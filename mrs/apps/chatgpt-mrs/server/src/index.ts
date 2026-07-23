/**
 * MRS ChatGPT App MCP server.
 *
 * Transport: SSE (GET /mcp + POST /mcp/messages) — matches kitchen_sink_server_node.
 * Tool/resource registration: registerAppTool + registerAppResource + RESOURCE_MIME_TYPE
 * from @modelcontextprotocol/ext-apps (pinned ^1.0.1 per openai-apps-sdk-examples).
 * SDK: @modelcontextprotocol/sdk ^1.12.1 (mcp_app_basics_node evidence).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

import { createAuthenticator } from "./mrs-adapter/authenticator.js";
import { RendererClient } from "./mrs-adapter/renderer-client.js";
import { resolveLiveLinkUrl } from "./mrs-adapter/ports.js";
import {
  createSceneInputShape,
  handleCreateScene,
} from "./tools/create-scene.js";
import {
  updateSceneInputShape,
  handleUpdateScene,
} from "./tools/update-scene.js";
import {
  inspectPointInputShape,
  handleInspectPoint,
} from "./tools/inspect-point.js";
import {
  exportSceneInputShape,
  handleExportScene,
} from "./tools/export-asset.js";
import {
  replaySceneInputShape,
  handleReplayScene,
} from "./tools/replay-scene.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Widget HTML: mrs/apps/chatgpt-mrs/assets/ (Vite web build target) */
const ASSETS_DIR = path.resolve(__dirname, "../../assets");
const RESOURCE_URI = "ui://mrs-viewport/mrs-viewport.html";
const PORT = Number(process.env.PORT ?? process.env.MRS_CHATGPT_PORT ?? 8000);

const authenticator = createAuthenticator();
const rendererClient = new RendererClient();

function readWidgetHtml(): string {
  if (!fs.existsSync(ASSETS_DIR)) {
    return `<!doctype html><html><body><p>MRS viewport assets missing. Run <code>pnpm --filter @mrs/chatgpt-app-web build</code> (expected ${ASSETS_DIR}).</p></body></html>`;
  }
  const direct = path.join(ASSETS_DIR, "mrs-viewport.html");
  if (fs.existsSync(direct)) return fs.readFileSync(direct, "utf8");
  const candidates = fs
    .readdirSync(ASSETS_DIR)
    .filter((f) => f.startsWith("mrs-viewport") && f.endsWith(".html"))
    .sort();
  const fallback = candidates[candidates.length - 1];
  if (fallback) return fs.readFileSync(path.join(ASSETS_DIR, fallback), "utf8");
  return `<!doctype html><html><body><p>No mrs-viewport*.html in ${ASSETS_DIR}</p></body></html>`;
}

function widgetMeta(invoking: string, invoked: string) {
  return {
    ui: { resourceUri: RESOURCE_URI },
    "openai/outputTemplate": RESOURCE_URI,
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
    "openai/widgetAccessible": true,
  } as const;
}

function createMrsServer(): McpServer {
  const server = new McpServer({
    name: "mrs-chatgpt-app",
    version: "0.1.0",
  });

  const widgetHtml = readWidgetHtml();

  registerAppResource(
    server,
    "MRS 4D Viewport",
    RESOURCE_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: "Interactive 4D surface viewport widget (skybridge)",
    },
    async () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
        },
      ],
    })
  );

  registerAppTool(
    server,
    "create_4d_scene",
    {
      title: "Create 4D Scene",
      description:
        "Create an in-memory 4D scene DTO and open the MRS viewport widget.",
      inputSchema: createSceneInputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: widgetMeta("Creating 4D scene", "Scene ready"),
    },
    async (args) => {
      await authenticator.authorize({ toolName: "create_4d_scene" });
      const { scene, text } = handleCreateScene(args);
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { scene },
        _meta: widgetMeta("Creating 4D scene", "Scene ready"),
      };
    }
  );

  registerAppTool(
    server,
    "update_4d_scene",
    {
      title: "Update 4D Scene",
      description: "Patch an in-memory scene; best-effort LiveLink set_config.",
      inputSchema: updateSceneInputShape,
      _meta: widgetMeta("Updating 4D scene", "Scene updated"),
    },
    async (args) => {
      const { scene, text, liveLink } = await handleUpdateScene(
        args,
        rendererClient
      );
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { scene, liveLink },
        _meta: widgetMeta("Updating 4D scene", "Scene updated"),
      };
    }
  );

  registerAppTool(
    server,
    "inspect_4d_point",
    {
      title: "Inspect 4D Point",
      description:
        "Inspect a screen point or 4D ray via in-process MRSInspector4D (LiveLink optional).",
      inputSchema: inspectPointInputShape,
      _meta: widgetMeta("Inspecting 4D point", "Inspect complete"),
    },
    async (args) => {
      const { result, text, path: inspectPath } = await handleInspectPoint(
        args,
        rendererClient
      );
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { ...result, inspectPath },
        _meta: widgetMeta("Inspecting 4D point", "Inspect complete"),
      };
    }
  );

  registerAppTool(
    server,
    "export_4d_scene",
    {
      title: "Export 4D Scene",
      description:
        "Export scene as json/mesh (real) or glTF/image via ExportManager when canvas works; replay not_implemented.",
      inputSchema: exportSceneInputShape,
      _meta: widgetMeta("Exporting scene", "Export finished"),
    },
    async (args) => {
      const { structured, text } = await handleExportScene(args);
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: structured,
        _meta: widgetMeta("Exporting scene", "Export finished"),
      };
    }
  );

  registerAppTool(
    server,
    "replay_4d_scene",
    {
      title: "Replay 4D Scene",
      description:
        "timeline: declared keyframe metadata; cssv: not_implemented in this slice.",
      inputSchema: replaySceneInputShape,
      _meta: widgetMeta("Preparing replay", "Replay metadata attached"),
    },
    async (args) => {
      const { structured, text } = await handleReplayScene(args);
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: structured,
        _meta: widgetMeta("Preparing replay", "Replay metadata attached"),
      };
    }
  );

  return server;
}

type SessionRecord = {
  server: McpServer;
  transport: SSEServerTransport;
};

const sessions = new Map<string, SessionRecord>();
const ssePath = "/mcp";
const postPath = "/mcp/messages";

async function handleSseRequest(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const server = createMrsServer();
  const transport = new SSEServerTransport(postPath, res);
  const sessionId = transport.sessionId;
  sessions.set(sessionId, { server, transport });

  transport.onclose = async () => {
    sessions.delete(sessionId);
    await server.close();
  };
  transport.onerror = (error) => {
    console.error("SSE transport error", error);
  };

  try {
    await server.connect(transport);
  } catch (error) {
    sessions.delete(sessionId);
    console.error("Failed to start SSE session", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to establish SSE connection");
    }
  }
}

async function handlePostMessage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    res.writeHead(400).end("Missing sessionId query parameter");
    return;
  }
  const session = sessions.get(sessionId);
  if (!session) {
    res.writeHead(404).end("Unknown session");
    return;
  }
  try {
    await session.transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("Failed to process message", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to process message");
    }
  }
}

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        name: "mrs-chatgpt-app",
        resourceUri: RESOURCE_URI,
        liveLinkUrl: resolveLiveLinkUrl(),
        assetsDir: ASSETS_DIR,
        tools: [
          "create_4d_scene",
          "update_4d_scene",
          "inspect_4d_point",
          "export_4d_scene",
          "replay_4d_scene",
        ],
      })
    );
    return;
  }

  if (req.method === "GET" && url.pathname === ssePath) {
    await handleSseRequest(res);
    return;
  }

  if (req.method === "POST" && url.pathname === postPath) {
    await handlePostMessage(req, res, url);
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(PORT, () => {
  console.log(`MRS ChatGPT MCP server listening on http://127.0.0.1:${PORT}`);
  console.log(`  SSE:  GET  http://127.0.0.1:${PORT}${ssePath}`);
  console.log(`  POST: http://127.0.0.1:${PORT}${postPath}?sessionId=...`);
  console.log(`  Health: GET http://127.0.0.1:${PORT}/health`);
  console.log(`  LiveLink default: ${resolveLiveLinkUrl()}`);
  console.log(`  Assets: ${ASSETS_DIR}`);
});
