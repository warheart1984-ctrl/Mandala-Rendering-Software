import { z } from "zod";

const DEFAULT_GENBLAZE_BASE_URL =
  "https://mandala-rendering-system-mrs.onrender.com";
const DEFAULT_TIMEOUT_MS = 360_000;
const MAX_IMAGE_BYTES = 2_000_000;

export const render4dTo3dInputShape = {
  prompt: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "Scene direction for the complete native RT4D → SceneSpecification → Engine3D pipeline."
    ),
  quality: z
    .enum(["draft", "final"])
    .optional()
    .describe("draft is the default and recommended ChatGPT preview quality"),
  width: z
    .number()
    .int()
    .min(64)
    .max(512)
    .optional()
    .describe("Engine3D output width; defaults to 256"),
  height: z
    .number()
    .int()
    .min(64)
    .max(512)
    .optional()
    .describe("Engine3D output height; defaults to 256"),
};

const parser = z.object(render4dTo3dInputShape);

type JsonObject = Record<string, unknown>;
type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: "image/png" };

type AssetSummary = {
  runId: string | null;
  previewUrl: string | null;
  provider: string | null;
  model: string | null;
  sha256: string | null;
  kind: string | null;
  assetKey: string | null;
  manifestKey: string | null;
};

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected an object response");
  }
  return value as JsonObject;
}

function asOptionalObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function genblazeBaseUrl(): string {
  return (
    process.env.MRS_GENBLAZE_BASE_URL?.trim() || DEFAULT_GENBLAZE_BASE_URL
  ).replace(/\/$/, "");
}

function absoluteUrl(baseUrl: string, value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    return new URL(raw, `${baseUrl}/`).toString();
  } catch {
    return null;
  }
}

function requestHeaders(hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (hasBody) headers["Content-Type"] = "application/json";
  const key = process.env.MRS_GENBLAZE_API_KEY?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function request(
  baseUrl: string,
  path: string,
  body?: JsonObject
): Promise<Response> {
  const timeoutMs = Number(
    process.env.MRS_GENBLAZE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS
  );
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS
  );
  try {
    return await fetch(`${baseUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: requestHeaders(Boolean(body)),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestJson(
  baseUrl: string,
  path: string,
  body?: JsonObject
): Promise<JsonObject> {
  const response = await request(baseUrl, path, body);
  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { detail: text.slice(0, 500) };
    }
  }
  if (!response.ok) {
    const detail = asOptionalObject(payload)?.detail ?? payload;
    throw new Error(
      `${path} returned ${response.status}: ${
        typeof detail === "string" ? detail : JSON.stringify(detail)
      }`
    );
  }
  return asObject(payload);
}

function summarizeAsset(baseUrl: string, value: unknown): AssetSummary {
  const asset = asObject(value);
  const runId = asString(asset.run_id);
  return {
    runId,
    previewUrl:
      absoluteUrl(baseUrl, asset.preview_url) ??
      (runId ? `${baseUrl}/api/preview/${encodeURIComponent(runId)}` : null),
    provider: asString(asset.provider),
    model: asString(asset.model),
    sha256: asString(asset.asset_sha256) ?? asString(asset.sha256),
    kind: asString(asset.kind),
    assetKey: asString(asset.asset_key),
    manifestKey: asString(asset.manifest_key),
  };
}

async function fetchPng(url: string): Promise<McpContent> {
  const response = await fetch(url, {
    headers: requestHeaders(false),
  });
  if (!response.ok) {
    throw new Error(`preview returned ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  if (
    data.length < 8 ||
    data[0] !== 0x89 ||
    data[1] !== 0x50 ||
    data[2] !== 0x4e ||
    data[3] !== 0x47
  ) {
    throw new Error("preview was not a PNG");
  }
  if (data.length > MAX_IMAGE_BYTES) {
    throw new Error(
      `preview is ${data.length} bytes; cap is ${MAX_IMAGE_BYTES}`
    );
  }
  return {
    type: "image",
    data: data.toString("base64"),
    mimeType: "image/png",
  };
}

async function appendStageImage(
  content: McpContent[],
  label: string,
  asset: AssetSummary
): Promise<void> {
  content.push({
    type: "text",
    text: `${label} · run=${asset.runId ?? "unknown"} · provider=${
      asset.provider ?? "unknown"
    } · sha256=${asset.sha256?.slice(0, 12) ?? "unknown"}…`,
  });
  if (!asset.previewUrl) {
    content.push({ type: "text", text: `${label} preview URL unavailable.` });
    return;
  }
  try {
    content.push(await fetchPng(asset.previewUrl));
  } catch (error) {
    content.push({
      type: "text",
      text: `${label} preview could not be embedded: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
}

export type Render4dTo3dResult = {
  text: string;
  content: McpContent[];
  pipeline: {
    status: "ok";
    backend: string;
    prompt: string;
    quality: "draft" | "final";
    presentation: {
      imagesArePrimaryEvidence: true;
      labels: [
        "RT4D concept",
        "Governed SceneSpecification reveal",
        "Engine3D structure/composite"
      ];
    };
    constraints: {
      nativeRenderersOnly: true;
      noDiffusion: true;
      engine3dPolish: false;
    };
    stages: {
      rt4d: AssetSummary;
      governedScene: AssetSummary;
      engine3d: AssetSummary;
      composite: AssetSummary | null;
    };
  };
};

export async function handleRender4dTo3d(
  args: unknown
): Promise<Render4dTo3dResult> {
  const parsed = parser.parse(args ?? {});
  const quality = parsed.quality ?? "draft";
  const width = parsed.width ?? 256;
  const height = parsed.height ?? 256;
  const baseUrl = genblazeBaseUrl();

  const health = await requestJson(baseUrl, "/health");
  const promptSceneHealth = asOptionalObject(health.prompt_scene);
  const engine3dHealth = asOptionalObject(health.engine3d_still);
  const rt4dHealth = asOptionalObject(health.rt4d);
  if (health.image_backend !== "rt4d" || rt4dHealth?.available !== true) {
    throw new Error(
      "Genblaze must expose the deterministic RT4D image backend for this no-diffusion pipeline"
    );
  }
  if (promptSceneHealth?.available !== true) {
    throw new Error("Genblaze prompt-to-scene lane is unavailable");
  }
  if (engine3dHealth?.available !== true) {
    throw new Error("Genblaze Engine3D still lane is unavailable");
  }

  const rt4dResponse = await requestJson(baseUrl, "/api/generate", {
    prompt: parsed.prompt,
    quality,
    embed: false,
    then_scene: false,
    then_polish: false,
  });
  const rt4d = summarizeAsset(baseUrl, rt4dResponse);
  if (!rt4d.runId) throw new Error("RT4D stage returned no run_id");

  const promptScene = await requestJson(baseUrl, "/api/prompt-to-scene", {
    prompt: parsed.prompt,
    render: true,
    quality,
    width: Math.min(width, 256),
    height: Math.min(height, 256),
    samples: quality === "final" ? 8 : 4,
    max_depth: quality === "final" ? 5 : 4,
  });
  const worldDocument = asObject(promptScene.engine3dWorldDocument);
  const governedScene = summarizeAsset(baseUrl, promptScene.render);

  const engine3dResponse = await requestJson(baseUrl, "/api/engine3d-still", {
    world_document: worldDocument,
    width,
    height,
    aov_depth: true,
    aov_normal: true,
    polish: false,
    path_trace: false,
    rt4d_background_run_id: rt4d.runId,
  });
  const engine3d = summarizeAsset(baseUrl, engine3dResponse.structure);
  const compositeValue = asOptionalObject(engine3dResponse.composite);
  const composite = compositeValue
    ? summarizeAsset(baseUrl, compositeValue)
    : null;

  const content: McpContent[] = [];
  await appendStageImage(content, "Stage 1 · native RT4D concept", rt4d);
  await appendStageImage(
    content,
    "Stage 2 · governed SceneSpecification reveal",
    governedScene
  );
  await appendStageImage(
    content,
    composite
      ? "Stage 3 · Engine3D structure over RT4D plate"
      : "Stage 3 · Engine3D structure",
    composite ?? engine3d
  );

  return {
    text:
      "Native 4D→3D pipeline complete. Treat the next three image blocks as the primary visual evidence: present them inline as RT4D concept, Governed SceneSpecification reveal, and Engine3D structure/composite, then describe only differences visible in the images. Preserve the run IDs and SHA-256 receipts. No diffusion or img2img polish was used.",
    content,
    pipeline: {
      status: "ok",
      backend: baseUrl,
      prompt: parsed.prompt,
      quality,
      presentation: {
        imagesArePrimaryEvidence: true,
        labels: [
          "RT4D concept",
          "Governed SceneSpecification reveal",
          "Engine3D structure/composite",
        ],
      },
      constraints: {
        nativeRenderersOnly: true,
        noDiffusion: true,
        engine3dPolish: false,
      },
      stages: {
        rt4d,
        governedScene,
        engine3d,
        composite,
      },
    },
  };
}
