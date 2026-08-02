import { createHash } from "node:crypto";

export type EnginePreviewResult = {
  previewUrl: string;
  sha256: string;
  source: "engine" | "placeholder";
  width: number;
  height: number;
  runId?: string;
  note: string;
};

type JsonObject = Record<string, unknown>;

function engineBaseUrl(): string | null {
  const raw = process.env.RT4D_ENGINE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

function requestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const key = process.env.RT4D_API_KEY?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function absoluteUrl(base: string, value: string): string {
  try {
    return new URL(value, `${base}/`).toString();
  } catch {
    return value;
  }
}

/**
 * Minimal deterministic PNG (1×1) whose bytes depend on sceneSha256.
 * Used when RT4D_ENGINE_URL is unset or the engine call fails — declared stub path.
 */
export function buildPlaceholderPng(sceneSha256: string): {
  bytes: Buffer;
  dataUrl: string;
  sha256: string;
} {
  // Classic 1×1 PNG; recolor via CRC-stable approach: embed hash in tEXt-free way
  // by XORing the IDAT-adjacent seed into a regenerated tiny file hash label only.
  const base = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const stamp = createHash("sha256")
    .update(sceneSha256)
    .update("rt4d-chatgpt-plugin-placeholder-v1")
    .digest();
  const bytes = Buffer.concat([base, stamp.subarray(0, 8)]);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  return { bytes, dataUrl, sha256 };
}

/**
 * Call existing Genblaze-compatible engine via RT4D_ENGINE_URL.
 * Prefer POST /api/generate (structure-lane / RT4D backend when configured).
 * Does not embed RT4D math in this process.
 */
export async function renderViaEngine(input: {
  prompt: string;
  sceneId: string;
  sceneSha256: string;
  width?: number;
  height?: number;
}): Promise<EnginePreviewResult> {
  const base = engineBaseUrl();
  const width = input.width ?? 256;
  const height = input.height ?? 256;

  if (!base) {
    const placeholder = buildPlaceholderPng(input.sceneSha256);
    return {
      previewUrl: placeholder.dataUrl,
      sha256: placeholder.sha256,
      source: "placeholder",
      width,
      height,
      note:
        "RT4D_ENGINE_URL unset — returned deterministic placeholder preview (declared stub until engine wired).",
    };
  }

  const timeoutMs = Number(process.env.RT4D_ENGINE_TIMEOUT_MS ?? 120_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({
        prompt: input.prompt,
        quality: "draft",
        // Genblaze accepts these when present; unknown fields are typically ignored.
        width,
        height,
        metadata: {
          sceneId: input.sceneId,
          source: "rt4d-chatgpt-plugin",
          sceneSha256: input.sceneSha256,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`engine HTTP ${res.status}: ${body.slice(0, 240)}`);
    }

    const json = asObject(await res.json());
    if (!json) throw new Error("engine returned non-object JSON");

    const previewRaw =
      asString(json.preview_url) ??
      asString(json.previewUrl) ??
      asString(asObject(json.structure)?.preview_url);
    const sha =
      asString(json.sha256) ??
      asString(json.asset_sha256) ??
      asString(asObject(json.provenance)?.sha256) ??
      input.sceneSha256;
    const runId = asString(json.run_id) ?? asString(json.runId) ?? undefined;

    if (!previewRaw) {
      throw new Error("engine response missing preview_url");
    }

    return {
      previewUrl: absoluteUrl(base, previewRaw),
      sha256: sha,
      source: "engine",
      width,
      height,
      runId,
      note: `Preview from RT4D_ENGINE_URL (${base}) via POST /api/generate — no local RT4D math.`,
    };
  } catch (err) {
    const placeholder = buildPlaceholderPng(input.sceneSha256);
    const detail = err instanceof Error ? err.message : String(err);
    return {
      previewUrl: placeholder.dataUrl,
      sha256: placeholder.sha256,
      source: "placeholder",
      width,
      height,
      note: `Engine call failed (${detail}); fell back to deterministic placeholder. status=partial.`,
    };
  } finally {
    clearTimeout(timer);
  }
}
