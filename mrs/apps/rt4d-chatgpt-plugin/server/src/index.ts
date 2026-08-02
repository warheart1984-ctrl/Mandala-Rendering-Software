/**
 * RT4D Hybrid Anime Production — ChatGPT MCP server (Phase 1 vertical slice).
 *
 * Status: MCP bridge partial; widget skeleton; public directory submission declared.
 * Does not embed RT4D math — calls RT4D_ENGINE_URL when set.
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
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  createRt4dSceneInputShape,
  handleCreateRt4dScene,
} from "./tools/create-rt4d-scene.js";
import {
  renderRt4dPreviewInputShape,
  handleRenderRt4dPreview,
} from "./tools/render-rt4d-preview.js";
import {
  inspectRt4dProvenanceInputShape,
  handleInspectRt4dProvenance,
} from "./tools/inspect-rt4d-provenance.js";
import {
  updateRt4dSceneInputShape,
  exportRt4dAssetInputShape,
  validateCharacterContinuityInputShape,
  replayAnimeShotInputShape,
  compareRenderVersionsInputShape,
  approveCanonicalShotInputShape,
  handleUpdateRt4dScene,
  handleExportRt4dAsset,
  handleValidateCharacterContinuity,
  handleReplayAnimeShot,
  handleCompareRenderVersions,
  handleApproveCanonicalShot,
} from "./tools/skeleton-tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIDGET_PATH = path.resolve(__dirname, "../../widget/index.html");
const RESOURCE_URI = "ui://rt4d-viewer/v1.html";
const PORT = Number(process.env.PORT ?? process.env.RT4D_PLUGIN_PORT ?? 8010);

function readWidgetHtml(): string {
  if (fs.existsSync(WIDGET_PATH)) {
    return fs.readFileSync(WIDGET_PATH, "utf8");
  }
  return `<!doctype html><html><body><p>RT4D viewer skeleton missing at ${WIDGET_PATH}</p></body></html>`;
}

function toolStatusMeta(invoking: string, invoked: string) {
  return {
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
  } as const;
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

function createRt4dPluginServer(): McpServer {
  const server = new McpServer(
    {
      name: "rt4d-hybrid-anime-production",
      version: "0.1.0",
    },
    {
      instructions:
        "RT4D Anime Lane product plugin (partial). Prefer create_rt4d_scene → render_rt4d_preview → inspect_rt4d_provenance. Modes map to product lanes (portrait/manga/anime_scene/film). Emit/inspect Shot Evidence Envelope + ContinuityState. Do not claim diffusion-as-anime, ChatGPT directory listing, persistent RT3D, 5s film, or Unity/Unreal export as enforced. Genblaze Actions are a companion onboarding tool. No claim without evidence. Architecture SoT: docs/anime-lane/RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md",
    }
  );

  const widgetHtml = readWidgetHtml();

  registerAppResource(
    server,
    "RT4D Viewer (skeleton)",
    RESOURCE_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: "Skeleton interactive viewer — provenance inspect via MCP tools",
    },
    async () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: {
            ui: { prefersBorder: true },
            "openai/widgetDescription":
              "Skeleton RT4D viewer. Status: skeleton.",
          },
        },
      ],
    })
  );

  registerAppTool(
    server,
    "create_rt4d_scene",
    {
      title: "Create RT4D Scene",
      description:
        "Create deterministic scene JSON with mode/product lane, ContinuityState, provenance, and Shot Evidence Envelope (partial).",
      inputSchema: createRt4dSceneInputShape,
      _meta: widgetMeta("Creating RT4D scene…", "Scene created"),
    },
    async (args) => {
      const result = handleCreateRt4dScene(args);
      return {
        content: [
          { type: "text", text: result.text },
          {
            type: "text",
            text: JSON.stringify(
              {
                sceneId: result.sceneId,
                provenance: result.provenance,
                continuityState: result.continuityState,
                shotEvidence: result.shotEvidence,
                scene: result.scene,
                statusTag: result.statusTag,
              },
              null,
              2
            ),
          },
        ],
        structuredContent: result,
      };
    }
  );

  registerAppTool(
    server,
    "render_rt4d_preview",
    {
      title: "Render RT4D Preview",
      description:
        "Preview via RT4D_ENGINE_URL (Genblaze /api/generate) or deterministic placeholder. Updates Shot Evidence Envelope outputHash.",
      inputSchema: renderRt4dPreviewInputShape,
      _meta: toolStatusMeta("Rendering RT4D preview…", "Preview ready"),
    },
    async (args) => {
      const result = await handleRenderRt4dPreview(args);
      return {
        content: [
          { type: "text", text: result.text },
          {
            type: "text",
            text: JSON.stringify(
              {
                sceneId: result.sceneId,
                previewUrl: result.previewUrl,
                sha256: result.sha256,
                source: result.source,
                shotEvidence: result.shotEvidence,
                provenance: result.provenance,
                statusTag: result.statusTag,
              },
              null,
              2
            ),
          },
        ],
        structuredContent: result,
      };
    }
  );

  registerAppTool(
    server,
    "inspect_rt4d_provenance",
    {
      title: "Inspect RT4D Provenance",
      description:
        "Return provenance, ContinuityState, and Shot Evidence Envelope from in-memory store.",
      inputSchema: inspectRt4dProvenanceInputShape,
      _meta: toolStatusMeta("Inspecting provenance…", "Provenance ready"),
    },
    async (args) => {
      const result = handleInspectRt4dProvenance(args);
      return {
        content: [
          { type: "text", text: result.text },
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
        structuredContent: result,
      };
    }
  );

  registerAppTool(
    server,
    "update_rt4d_scene",
    {
      title: "Update RT4D Scene",
      description: "Skeleton — NotImplemented (declared).",
      inputSchema: updateRt4dSceneInputShape,
      _meta: toolStatusMeta("Update not implemented…", "Declared stub"),
    },
    async (args) => ({
      content: [
        { type: "text", text: JSON.stringify(handleUpdateRt4dScene(args)) },
      ],
      structuredContent: handleUpdateRt4dScene(args),
      isError: true,
    })
  );

  registerAppTool(
    server,
    "export_rt4d_asset",
    {
      title: "Export RT4D Asset",
      description: "Skeleton — Unity/Unreal export declared, not implemented.",
      inputSchema: exportRt4dAssetInputShape,
      _meta: toolStatusMeta("Export not implemented…", "Declared stub"),
    },
    async (args) => ({
      content: [
        { type: "text", text: JSON.stringify(handleExportRt4dAsset(args)) },
      ],
      structuredContent: handleExportRt4dAsset(args),
      isError: true,
    })
  );

  function declaredGovernanceResult(handler: (args: unknown) => unknown) {
    return async (args: unknown) => {
      const result = handler(args);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result) },
        ],
        structuredContent: result as Record<string, unknown>,
        isError: true,
      };
    };
  }

  registerAppTool(
    server,
    "validate_character_continuity",
    {
      title: "Validate Character Continuity",
      description:
        "Declared governance tool — NotImplemented. No continuity claim without state comparison.",
      inputSchema: validateCharacterContinuityInputShape,
      _meta: toolStatusMeta("Validate continuity (declared)…", "Declared stub"),
    },
    declaredGovernanceResult(handleValidateCharacterContinuity)
  );

  registerAppTool(
    server,
    "replay_anime_shot",
    {
      title: "Replay Anime Shot",
      description:
        "Declared — deterministic replay verification not enforced. Inspect shotEvidence for partial receipt.",
      inputSchema: replayAnimeShotInputShape,
      _meta: toolStatusMeta("Replay shot (declared)…", "Declared stub"),
    },
    declaredGovernanceResult(handleReplayAnimeShot)
  );

  registerAppTool(
    server,
    "compare_render_versions",
    {
      title: "Compare Render Versions",
      description: "Declared — version compare not implemented.",
      inputSchema: compareRenderVersionsInputShape,
      _meta: toolStatusMeta("Compare versions (declared)…", "Declared stub"),
    },
    declaredGovernanceResult(handleCompareRenderVersions)
  );

  registerAppTool(
    server,
    "approve_canonical_shot",
    {
      title: "Approve Canonical Shot",
      description:
        "Declared — no approved scene without a recorded decision store.",
      inputSchema: approveCanonicalShotInputShape,
      _meta: toolStatusMeta("Approve shot (declared)…", "Declared stub"),
    },
    declaredGovernanceResult(handleApproveCanonicalShot)
  );

  return server;
}

async function handleStreamableHttp(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const server = createRt4dPluginServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

const sseTransports = new Map<string, SSEServerTransport>();

async function main(): Promise<void> {
  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          name: "rt4d-hybrid-anime-production",
          status: {
            mcp_bridge: "partial",
            widget: "skeleton",
            public_directory_submission: "declared",
            first_milestone: "declared",
          },
          architectureSoT:
            "docs/anime-lane/RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md",
          engineUrlConfigured: Boolean(process.env.RT4D_ENGINE_URL?.trim()),
        })
      );
      return;
    }

    if (url.pathname === "/mcp") {
      if (req.method === "POST" || req.method === "GET" || req.method === "DELETE") {
        await handleStreamableHttp(req, res);
        return;
      }
    }

    if (req.method === "GET" && url.pathname === "/sse") {
      const server = createRt4dPluginServer();
      const transport = new SSEServerTransport("/mcp/messages", res);
      sseTransports.set(transport.sessionId, transport);
      res.on("close", () => {
        sseTransports.delete(transport.sessionId);
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      return;
    }

    if (req.method === "POST" && url.pathname === "/mcp/messages") {
      const sessionId = url.searchParams.get("sessionId") ?? "";
      const transport = sseTransports.get(sessionId);
      if (!transport) {
        res.writeHead(404).end("Unknown SSE session");
        return;
      }
      await transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404).end("Not found");
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(
      `[rt4d-chatgpt-plugin] listening on http://0.0.0.0:${PORT}  MCP=/mcp  health=/health  status=partial`
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
