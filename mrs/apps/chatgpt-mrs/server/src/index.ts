/**
 * MRS 4D Renderer — ChatGPT MCP server.
 *
 * Transports (ChatGPT Apps prefer Streamable HTTP):
 * - Streamable HTTP: POST/GET/DELETE /mcp (stateless JSON mode for OpenAI clients)
 * - Legacy SSE: GET /sse + POST /mcp/messages (MCP Inspector / older clients)
 *
 * Tool/resource registration: registerAppTool + registerAppResource + RESOURCE_MIME_TYPE
 * from @modelcontextprotocol/ext-apps. SDK: @modelcontextprotocol/sdk ^1.29.0.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { z } from "zod";

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

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
import {
  validateSceneSpecInputShape,
  handleValidateSceneSpec,
} from "./tools/validate-scene-spec.js";
import {
  renderSceneSpecInputShape,
  handleRenderSceneSpec,
} from "./tools/render-scene-spec.js";
import {
  render4dPromptInputShape,
  handleRender4dPrompt,
} from "./tools/render-4d-prompt.js";
import {
  render4dTo3dInputShape,
  handleRender4dTo3d,
} from "./tools/render-4d-to-3d.js";
import { handleDescribeCapabilities } from "./tools/describe-capabilities.js";
import {
  deleteJarvisMemoryInputShape,
  fetchJarvisMemoryInputShape,
  handleDeleteJarvisMemory,
  handleFetchJarvisMemory,
  handleSearchJarvisMemory,
  handleWriteJarvisSessionSummary,
  handleUpdateJarvisMemory,
  handleWriteJarvisMemory,
  searchJarvisMemoryInputShape,
  updateJarvisMemoryInputShape,
  writeJarvisSessionSummaryInputShape,
  writeJarvisMemoryInputShape,
} from "./tools/jarvis-memory.js";
import {
  getRenderDir,
  safeRenderFileName,
  type PngImagePayload,
} from "./render-jobs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Widget HTML: mrs/apps/chatgpt-mrs/assets/ (Vite web build target) */
const ASSETS_DIR = path.resolve(__dirname, "../../assets");
const RESOURCE_URI = "ui://mrs-viewport/v1.html";
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
    ui: {
      resourceUri: RESOURCE_URI,
      visibility: ["model", "app"],
    },
    "openai/outputTemplate": RESOURCE_URI,
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
    "openai/widgetAccessible": true,
  } as const;
}

/** Status-only metadata for native tool results that must not open the widget. */
function toolStatusMeta(invoking: string, invoked: string) {
  return {
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
  } as const;
}

function mcpImageContent(image: PngImagePayload) {
  return {
    type: "image" as const,
    data: image.data,
    mimeType: image.mimeType,
  };
}

function createMrsServer(): McpServer {
  const server = new McpServer(
    {
      name: "mrs-4d-renderer",
      version: "0.3.0",
    },
    {
      instructions:
        "Use render_4d_to_3d_pipeline for a complete native prompt→RT4D→governed scene→Engine3D result. Use render_4d_prompt for a single deterministic 4D still. These render tools return native image content and do not require the viewport. Treat returned image blocks as primary visual evidence: present them with their stage labels and reason from visible content instead of summarizing only metadata. Use create_4d_scene only when the user asks for an interactive wireframe scene. Never describe RT4D or Engine3D output as diffusion-generated.",
    }
  );

  const widgetHtml = readWidgetHtml();

  registerAppResource(
    server,
    "MRS 4D Renderer Viewport (optional)",
    RESOURCE_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description:
        "Optional interactive Scene4DDTO wireframe widget — not the path-traced PNG renderer",
    },
    async () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                connectDomains: [],
                resourceDomains: [],
              },
            },
            "openai/widgetDescription":
              "Interactive MRS Scene4DDTO wireframe viewport with projection and inspection controls.",
          },
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
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

  server.registerTool(
    "validate_scene_spec",
    {
      title: "Validate Scene Specification",
      description:
        "Parse and capability-check a SceneSpecification for local RT4D (no render). Returns field-path errors.",
      inputSchema: validateSceneSpecInputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: toolStatusMeta("Validating scene spec", "Validation complete"),
    },
    async (args) => {
      const { ok, text, errors } = handleValidateSceneSpec(args);
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { ok, errors },
      };
    }
  );

  server.registerTool(
    "render_scene_spec_rt4d",
    {
      title: "Render Scene Spec (RT4D PNG)",
      description:
        "Path-trace a SceneSpecification via local MRS RT4D (CPU) and return a PNG image plus provenance. Deterministic procedural renderer — not FLUX, not diffusion, not Genblaze. Default quality=draft.",
      inputSchema: renderSceneSpecInputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: toolStatusMeta("Path-tracing scene", "RT4D PNG ready"),
    },
    async (args) => {
      try {
        const { text, image, render } = await handleRenderSceneSpec(args);
        return {
          content: [
            { type: "text" as const, text },
            mcpImageContent(image),
          ],
          structuredContent: { render },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            { type: "text" as const, text: `RT4D render failed: ${message}` },
          ],
          structuredContent: { error: message },
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "render_4d_prompt",
    {
      title: "Render 4D from Prompt (RT4D PNG)",
      description:
        "Render a deterministic procedural 4D still from a text prompt (prompt selects scene archetype + palette). Returns PNG image + SHA-256 provenance. NOT text-to-image / not diffusion.",
      inputSchema: render4dPromptInputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: toolStatusMeta("Rendering 4D still", "RT4D PNG ready"),
    },
    async (args) => {
      try {
        const { text, image, render } = await handleRender4dPrompt(args);
        return {
          content: [
            { type: "text" as const, text },
            mcpImageContent(image),
          ],
          structuredContent: { render },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `RT4D prompt render failed: ${message}`,
            },
          ],
          structuredContent: { error: message },
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "render_4d_to_3d_pipeline",
    {
      title: "Render Native 4D to 3D Pipeline",
      description:
        "Use this when the user wants a complete native rendering journey: deterministic RT4D concept → governed SceneSpecification reveal → Engine3D structure/composite. Returns three primary image blocks for inline presentation and visual comparison, preserves run IDs and SHA-256 provenance, and forbids diffusion/img2img polish.",
      inputSchema: render4dTo3dInputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: toolStatusMeta(
        "Running native 4D to 3D pipeline",
        "4D to 3D renders ready"
      ),
    },
    async (args) => {
      try {
        const { text, content, pipeline } = await handleRender4dTo3d(args);
        return {
          content: [{ type: "text" as const, text }, ...content],
          structuredContent: { pipeline },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Native 4D to 3D pipeline failed: ${message}`,
            },
          ],
          structuredContent: { error: message },
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "search_jarvis_memory",
    {
      title: "Search Jarvis Memory",
      description:
        "Use this when you want live or archived Jarvis session memory, board context, or prior decisions relevant to the current task.",
      inputSchema: searchJarvisMemoryInputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: toolStatusMeta("Reading Jarvis memory", "Jarvis memory ready"),
    },
    async (args) => {
      try {
        const { text, structured } = await handleSearchJarvisMemory(args);
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: structured,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Jarvis search failed: ${message}` }],
          structuredContent: { error: message },
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "fetch_jarvis_memory",
    {
      title: "Fetch Jarvis Memory",
      description:
        "Use this when you already know a Jarvis memory id and want the full stored record.",
      inputSchema: fetchJarvisMemoryInputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: toolStatusMeta("Fetching Jarvis memory", "Jarvis memory fetched"),
    },
    async (args) => {
      try {
        const { text, structured } = await handleFetchJarvisMemory(args);
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: structured,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Jarvis fetch failed: ${message}` }],
          structuredContent: { error: message },
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "write_jarvis_memory",
    {
      title: "Write Jarvis Memory",
      description:
        "Use this when you want to persist a concise memory, session summary, preference, or decision into the Jarvis memory board.",
      inputSchema: writeJarvisMemoryInputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: toolStatusMeta("Writing Jarvis memory", "Jarvis memory stored"),
    },
    async (args) => {
      try {
        const { text, structured } = await handleWriteJarvisMemory(args);
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: structured,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Jarvis write failed: ${message}` }],
          structuredContent: { error: message },
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "update_jarvis_memory",
    {
      title: "Update Jarvis Memory",
      description:
        "Use this when you want to revise an existing Jarvis memory by id, including content, tags, scope, or truth status.",
      inputSchema: updateJarvisMemoryInputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: toolStatusMeta("Updating Jarvis memory", "Jarvis memory updated"),
    },
    async (args) => {
      try {
        const { text, structured } = await handleUpdateJarvisMemory(args);
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: structured,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Jarvis update failed: ${message}` }],
          structuredContent: { error: message },
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "write_jarvis_session_summary",
    {
      title: "Write Jarvis Session Summary",
      description:
        "Use this when you want to persist a standard session recap in one call with objective, decisions, touched systems, open threads, and notes.",
      inputSchema: writeJarvisSessionSummaryInputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: toolStatusMeta(
        "Writing Jarvis session summary",
        "Jarvis session summary stored"
      ),
    },
    async (args) => {
      try {
        const { text, structured } = await handleWriteJarvisSessionSummary(args);
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: structured,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Jarvis session summary write failed: ${message}`,
            },
          ],
          structuredContent: { error: message },
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "delete_jarvis_memory",
    {
      title: "Delete Jarvis Memory",
      description:
        "Use this when you want to delete an existing Jarvis memory by id.",
      inputSchema: deleteJarvisMemoryInputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
      _meta: toolStatusMeta("Deleting Jarvis memory", "Jarvis memory deleted"),
    },
    async (args) => {
      try {
        const { text, structured } = await handleDeleteJarvisMemory(args);
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: structured,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Jarvis delete failed: ${message}` }],
          structuredContent: { error: message },
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "describe_4drs_capabilities",
    {
      title: "Describe 4DRS Capabilities",
      description:
        "Honest capability card: RT4D PNG renderer vs optional Canvas2D viewport, and what is not included (no FLUX/Genblaze/diffusion).",
      inputSchema: {
        detail: z
          .enum(["summary"])
          .optional()
          .describe("Optional; omit for full capability card"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: toolStatusMeta("Reading capabilities", "Capabilities ready"),
    },
    async () => {
      const { text, capabilities } = handleDescribeCapabilities();
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { capabilities },
      };
    }
  );

  return server;
}

type SseSessionRecord = {
  server: McpServer;
  transport: SSEServerTransport;
};

const sseSessions = new Map<string, SseSessionRecord>();
/** ChatGPT / OpenAI Apps primary endpoint (Streamable HTTP). */
const mcpPath = "/mcp";
/** Legacy SSE for MCP Inspector and older clients. */
const ssePath = "/sse";
const ssePostPath = "/mcp/messages";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "content-type, accept, mcp-session-id, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id",
} as const;

/**
 * Streamable HTTP (stateless + JSON) — preferred by ChatGPT Apps / OpenAI MCP clients.
 * Creates a fresh server+transport per POST so OpenAI's session lifecycle does not
 * trip stateful DELETE/session-terminated failures.
 */
async function handleStreamableHttp(
  req: IncomingMessage,
  res: ServerResponse
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

  if (req.method === "GET" || req.method === "DELETE") {
    res.writeHead(405, { "Content-Type": "application/json", Allow: "POST" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed. Use POST /mcp (Streamable HTTP).",
        },
        id: null,
      })
    );
    return;
  }

  const server = createMrsServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const cleanup = () => {
    void transport.close().catch(() => undefined);
    void server.close().catch(() => undefined);
  };
  res.on("close", cleanup);

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Streamable HTTP request failed", error);
    cleanup();
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        })
      );
    }
  }
}

async function handleSseRequest(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const server = createMrsServer();
  const transport = new SSEServerTransport(ssePostPath, res);
  const sessionId = transport.sessionId;
  sseSessions.set(sessionId, { server, transport });

  // Avoid recursive close: server.close() → transport.close() → onclose → server.close().
  transport.onclose = () => {
    sseSessions.delete(sessionId);
  };
  transport.onerror = (error) => {
    console.error("SSE transport error", error);
  };

  try {
    await server.connect(transport);
  } catch (error) {
    sseSessions.delete(sessionId);
    console.error("Failed to start SSE session", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to establish SSE connection");
    }
  }
}

async function handleSsePostMessage(
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
  const session = sseSessions.get(sessionId);
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
    res.writeHead(204, { ...CORS_HEADERS });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        name: "MRS 4D Renderer",
        serverId: "mrs-4d-renderer",
        description:
          "Render deterministic procedural 4D scenes and return PNGs with provenance.",
        resourceUri: RESOURCE_URI,
        liveLinkUrl: resolveLiveLinkUrl(),
        assetsDir: ASSETS_DIR,
        renderDir: getRenderDir(),
        publicBaseUrl: process.env.MRS_PUBLIC_BASE_URL ?? null,
        transports: {
          streamableHttp: `POST ${mcpPath}`,
          legacySse: `GET ${ssePath} + POST ${ssePostPath}`,
        },
        tools: [
          "render_4d_to_3d_pipeline",
          "render_4d_prompt",
          "render_scene_spec_rt4d",
          "validate_scene_spec",
          "describe_4drs_capabilities",
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

  if (req.method === "GET" && url.pathname.startsWith("/renders/")) {
    const name = safeRenderFileName(url.pathname.slice("/renders/".length));
    if (!name) {
      res.writeHead(400).end("Invalid render id");
      return;
    }
    const filePath = path.join(getRenderDir(), name);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      // Wildcard CORS is intentional here: the PNG must load inside the ChatGPT
      // widget iframe, whose origin varies. Exposure is limited by unguessable
      // UUID-style filenames enforced by safeRenderFileName; this app has no
      // origin allowlist today.
      "Access-Control-Allow-Origin": "*",
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Primary: Streamable HTTP for ChatGPT (POST /mcp). GET/DELETE → 405 in stateless mode.
  if (
    url.pathname === mcpPath &&
    (req.method === "POST" || req.method === "GET" || req.method === "DELETE")
  ) {
    await handleStreamableHttp(req, res);
    return;
  }

  // Legacy SSE (Inspector): moved off /mcp so it no longer conflicts with ChatGPT.
  if (req.method === "GET" && url.pathname === ssePath) {
    await handleSseRequest(res);
    return;
  }

  if (req.method === "POST" && url.pathname === ssePostPath) {
    await handleSsePostMessage(req, res, url);
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(PORT, () => {
  console.log(`MRS ChatGPT MCP server listening on http://127.0.0.1:${PORT}`);
  console.log(`  Streamable HTTP: POST http://127.0.0.1:${PORT}${mcpPath}`);
  console.log(`  Legacy SSE:      GET  http://127.0.0.1:${PORT}${ssePath}`);
  console.log(
    `  Legacy POST:     http://127.0.0.1:${PORT}${ssePostPath}?sessionId=...`
  );
  console.log(`  Health: GET http://127.0.0.1:${PORT}/health`);
  console.log(
    `  Primary tools: render_4d_to_3d_pipeline, render_4d_prompt, render_scene_spec_rt4d`
  );
  console.log(`  LiveLink default: ${resolveLiveLinkUrl()}`);
  console.log(`  Assets: ${ASSETS_DIR}`);
});
