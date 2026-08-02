/**
 * RT4D Hybrid Anime Production — ChatGPT MCP server (Phase 2 interactive viewer).
 *
 * Status: MCP bridge partial; widget partial (local dimensional preview);
 * ChatGPT embedded UI depends on platform support — not directory-ready.
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
  handleUpdateRt4dScene,
} from "./tools/update-rt4d-scene.js";
import {
  exportRt4dAssetInputShape,
  validateCharacterContinuityInputShape,
  replayAnimeShotInputShape,
  compareRenderVersionsInputShape,
  approveCanonicalShotInputShape,
  handleExportRt4dAsset,
  handleValidateCharacterContinuity,
  handleReplayAnimeShot,
  handleCompareRenderVersions,
  handleApproveCanonicalShot,
} from "./tools/skeleton-tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "../../assets");
const WIDGET_DIR = path.resolve(__dirname, "../../widget");
const WIDGET_BUILT = path.join(ASSETS_DIR, "rt4d-viewer.html");
const WIDGET_FALLBACK = path.join(WIDGET_DIR, "index.html");
/** MCP Apps UI resource — MIME text/html;profile=mcp-app via RESOURCE_MIME_TYPE */
const RESOURCE_URI = "ui://rt4d/viewer-v1";
const PORT = Number(process.env.PORT ?? process.env.RT4D_PLUGIN_PORT ?? 8010);

function readWidgetHtml(): string {
  if (fs.existsSync(WIDGET_BUILT)) {
    return fs.readFileSync(WIDGET_BUILT, "utf8");
  }
  if (fs.existsSync(WIDGET_FALLBACK)) {
    return fs.readFileSync(WIDGET_FALLBACK, "utf8");
  }
  return `<!doctype html><html><body><p>RT4D viewer missing. Run <code>npm run build</code> in widget/ (expected ${WIDGET_BUILT}).</p></body></html>`;
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
      version: "0.2.0",
    },
    {
      instructions:
        "RT4D Anime Lane product plugin (partial). Prefer create_rt4d_scene → render_rt4d_preview → inspect_rt4d_provenance. Interactive viewer (ui://rt4d/viewer-v1) can call update_rt4d_scene for XW/YW/ZW + projection (partial dimensional preview — not AnimeStylizer). Modes map to product lanes. Do not claim diffusion-as-anime, ChatGPT directory listing, persistent RT3D, 5s film, or Unity/Unreal export as enforced. Genblaze Actions are a companion onboarding tool. No claim without evidence. Architecture SoT: docs/anime-lane/RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md",
    }
  );

  const widgetHtml = readWidgetHtml();

  registerAppResource(
    server,
    "RT4D Viewer v1",
    RESOURCE_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description:
        "Interactive RT4D dimensional preview (Three.js tesseract / engine PNG). Phase 2 partial — not photoreal anime.",
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
              "RT4D dimensional preview viewer. Status: partial. Not AnimeStylizer.",
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
        "Create deterministic scene JSON with mode/product lane, ContinuityState, provenance, and Shot Evidence Envelope (partial). Opens interactive viewer when host supports MCP Apps UI.",
      inputSchema: createRt4dSceneInputShape,
      _meta: widgetMeta("Creating RT4D scene…", "Scene created"),
    },
    async (args) => {
      const result = handleCreateRt4dScene(args);
      const structuredContent = {
        sceneId: result.sceneId,
        provenance: result.provenance,
        continuityState: result.continuityState,
        shotEvidence: result.shotEvidence,
        scene: result.scene,
        rotations: (result.scene as { rotations?: unknown }).rotations,
        projection: (result.scene as { projection?: unknown }).projection,
        statusTag: result.statusTag,
        visualKind: "dimensional_preview" as const,
      };
      return {
        content: [
          { type: "text", text: result.text },
          {
            type: "text",
            text: JSON.stringify(structuredContent, null, 2),
          },
        ],
        structuredContent,
      };
    }
  );

  registerAppTool(
    server,
    "render_rt4d_preview",
    {
      title: "Render RT4D Preview",
      description:
        "Preview via RT4D_ENGINE_URL (Genblaze /api/generate) or deterministic placeholder. Updates Shot Evidence Envelope outputHash. Binds to viewer widget.",
      inputSchema: renderRt4dPreviewInputShape,
      _meta: widgetMeta("Rendering RT4D preview…", "Preview ready"),
    },
    async (args) => {
      const result = await handleRenderRt4dPreview(args);
      const structuredContent = {
        sceneId: result.sceneId,
        previewUrl: result.previewUrl,
        sha256: result.sha256,
        source: result.source,
        width: result.width,
        height: result.height,
        shotEvidence: result.shotEvidence,
        provenance: result.provenance,
        continuityState: result.continuityState,
        statusTag: result.statusTag,
        visualKind: "dimensional_preview" as const,
      };
      return {
        content: [
          { type: "text", text: result.text },
          {
            type: "text",
            text: JSON.stringify(structuredContent, null, 2),
          },
        ],
        structuredContent,
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
      _meta: widgetMeta("Inspecting provenance…", "Provenance ready"),
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
      description:
        "Phase 2 partial — update XW/YW/ZW rotations and/or projection distance; optional rePreview. Id-stable in-memory mutation. Not RT3D persistence / export.",
      inputSchema: updateRt4dSceneInputShape,
      _meta: widgetMeta("Updating RT4D scene…", "Scene updated"),
    },
    async (args) => {
      const result = await handleUpdateRt4dScene(args);
      const isError = "error" in result && Boolean(result.error);
      return {
        content: [
          { type: "text", text: result.text },
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
        structuredContent: result,
        isError,
      };
    }
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
      const widgetBuilt = fs.existsSync(WIDGET_BUILT);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          name: "rt4d-hybrid-anime-production",
          version: "0.2.0",
          status: {
            mcp_bridge: "partial",
            widget: widgetBuilt ? "partial" : "skeleton",
            phase: 2,
            public_directory_submission: "declared",
            first_milestone: "declared",
            chatgpt_embedded_ui: "partial",
          },
          resourceUri: RESOURCE_URI,
          architectureSoT:
            "docs/anime-lane/RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md",
          engineUrlConfigured: Boolean(process.env.RT4D_ENGINE_URL?.trim()),
          widgetBuilt,
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
      `[rt4d-chatgpt-plugin] listening on http://0.0.0.0:${PORT}  MCP=/mcp  health=/health  ui=${RESOURCE_URI}  status=partial`
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
