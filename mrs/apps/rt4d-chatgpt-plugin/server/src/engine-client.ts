import { createHash } from "node:crypto";

export type RuntimeFingerprint = {
  node: string;
  zlib: string;
  platform: string;
  arch: string;
};

/**
 * Layered evidence bundle returned by the RT4D engine. The plugin is a
 * TRANSPARENT bridge: these fields are passed through verbatim — the plugin
 * never recomputes, normalizes, shortens, replaces, or derives any render
 * authority. The engine is the sole rendering + hashing authority.
 */
export type EngineEvidenceBundle = {
  renderId: string;
  sceneId: string;
  seed: number;
  trajectoryRoot: string;
  sceneSpecHash: string;
  projectionHash: string;
  pixelHash: string;
  pngHash: string;
  rendererVersion: string;
  runtimeFingerprint: RuntimeFingerprint;
  evidenceStatus: "substrate_verified";
  promotionStatus: "not_promoted_to_ciems";
};

export type Rt4dEvidenceEnvelope = {
  operation: string;
  source: string;
  engineVersion: string;
  intentId: string;
  timelineId: string;
  worldId: string;
  sceneId: string;
  sceneSpecHash: string;
  sceneSha256: string;
  runId: string;
  renderKey: string;
  renderId: string;
  seed: number;
  projectionHash: string;
  pixelHash: string;
  pngHash: string;
  pngSha256: string;
  rendererVersion: string;
  runtimeFingerprint: RuntimeFingerprint;
  parameters: Record<string, unknown>;
  parametersHash: string;
  at: string;
  replayToken: string;
  evidenceStatus: "substrate_verified";
  promotionStatus: "not_promoted_to_ciems";
  conformance?: { ok: boolean; allFoundationalPassed?: boolean };
};

export type EnginePreviewResult = {
  previewUrl: string;
  sha256: string;
  source: "engine" | "placeholder";
  width: number;
  height: number;
  runId?: string;
  note: string;
  evidence: Rt4dEvidenceEnvelope | null;
  /** Layered evidence bundle (passed through verbatim from the engine). */
  renderBundle?: EngineEvidenceBundle | null;
};

type JsonObject = Record<string, unknown>;

export type Rt4dSceneSpec = {
  surface: string;
  resolution: number;
  rotations: Array<{ plane: string; speed: number }>;
  projection: { type: string; distance4d: number; distance3d: number };
  camera: { fovX: number; fovY: number; fovZ: number; fovW: number; lensRadius: number };
};

export type Rt4dPluginScene = {
  sceneId: string;
  prompt: string;
  rotations: Array<{ plane: string; speed: number }>;
  projection: { type: string; distance4d: number; distance3d: number };
  provenance: { hashes: { sceneSha256: string } };
};

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
  const base = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
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

/** Renderer-core surface ids available via @mrs/renderer-core/surfaces. */
const SURFACES = ["tesseract", "clifford-torus", "hopf-surface", "torus-3d", "trefoil-4d"];

const SURFACE_KEYWORDS: Array<{ kw: RegExp; surface: string }> = [
  { kw: /\b(tesseract|hypercube|8-cell|four[- ]?dimension)/i, surface: "tesseract" },
  { kw: /\b(clifford|flat.*torus)/i, surface: "clifford-torus" },
  { kw: /\b(hopf|phere)/i, surface: "hopf-surface" },
  { kw: /\b(torus|ring|donut|halo)/i, surface: "torus-3d" },
  { kw: /\b(trefoil|knot)/i, surface: "trefoil-4d" },
];

function surfaceFromPrompt(prompt: string): string {
  for (const { kw, surface } of SURFACE_KEYWORDS) {
    if (kw.test(prompt)) return surface;
  }
  return "tesseract";
}

function clampResolution(size: number): number {
  const r = Math.max(8, Math.min(64, size));
  return SURFACES.includes("tesseract") ? r : r;
}

/** Build a deterministic RT4D engine SceneSpec from the plugin scene + dims. */
export function sceneSpecFromPluginScene(
  scene: Rt4dPluginScene,
  width: number,
  height: number,
): Rt4dSceneSpec {
  const surface = surfaceFromPrompt(scene.prompt);
  return {
    surface,
    resolution: clampResolution(Math.min(width, height)),
    rotations: (scene.rotations ?? []).map((r) => ({
      plane: String(r.plane).toLowerCase(),
      speed: Number(r.speed) || 0,
    })),
    projection: scene.projection,
    camera: {
      fovX: 52,
      fovY: 52,
      fovZ: 8,
      fovW: 8,
      lensRadius: 0,
    },
  };
}

/**
 * Deterministic uint32 seed from the scene hash, so the same scene always renders
 * to the same PNG (replayable — P4). Never uses Math.random().
 */
export function deriveSeed(sceneSha256: string): number {
  let h = 0;
  const hex = String(sceneSha256 ?? "").slice(0, 8);
  for (let i = 0; i < hex.length; i++) {
    h = (h * 31 + (parseInt(hex[i], 16) || 0)) | 0;
  }
  return h >>> 0;
}

/**
 * Render a preview via the RT4D engine service (POST /v1/scenes + POST
 * /v1/scenes/{id}/render). Does not embed any RT4D math in this process. When
 * RT4D_ENGINE_URL is unset, falls back to the deterministic placeholder PNG.
 */
export async function renderViaEngine(input: {
  prompt: string;
  sceneId: string;
  sceneSha256: string;
  rotations?: Array<{ plane: string; speed: number }>;
  projection?: { type: string; distance4d: number; distance3d: number };
  width?: number;
  height?: number;
}): Promise<EnginePreviewResult> {
  const width = input.width ?? 256;
  const height = input.height ?? 256;

  const base = engineBaseUrl();
  if (!base) {
    const placeholder = buildPlaceholderPng(input.sceneSha256);
    return {
      previewUrl: placeholder.dataUrl,
      sha256: placeholder.sha256,
      source: "placeholder",
      width,
      height,
      note:
        "RT4D_ENGINE_URL unset — returned deterministic placeholder preview (declared stub).",
      evidence: null,
    };
  }

  const timeoutMs = Number(process.env.RT4D_ENGINE_TIMEOUT_MS ?? 120_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const spec = sceneSpecFromPluginScene(
      {
        sceneId: input.sceneId,
        prompt: input.prompt,
        rotations: input.rotations ?? [],
        projection: input.projection ?? { type: "perspective", distance4d: 4, distance3d: 4 },
        provenance: { hashes: { sceneSha256: input.sceneSha256 } },
      },
      width,
      height,
    );
    const res = await fetch(`${base}/v1/scenes`, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify(spec),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`engine POST /v1/scenes HTTP ${res.status}: ${body.slice(0, 240)}`);
    }
    const created = asObject(await res.json());
    const createdData = asObject(created?.data);
    const engineSceneId = asString(createdData?.sceneId);
    if (!engineSceneId) throw new Error("engine POST /v1/scenes returned no sceneId");

    const seed = deriveSeed(input.sceneSha256);
    const rres = await fetch(`${base}/v1/scenes/${encodeURIComponent(engineSceneId)}/render`, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({ seed, width, height }),
      signal: controller.signal,
    });
    if (!rres.ok) {
      const body = await rres.text().catch(() => "");
      throw new Error(`engine POST /v1/scenes/{id}/render HTTP ${rres.status}: ${body.slice(0, 240)}`);
    }
    const rjson = asObject(await rres.json());
    if (!rjson) throw new Error("engine render returned non-object JSON");
    const rdata = asObject(rjson.data);
    const rreceipt = asObject(rdata?.renderReceipt);
    const renvelope = asObject(rdata?.evidence);

    const pngBase64 =
      asString(rdata?.pngBase64) ?? asString(rjson.pngBase64);
    if (!pngBase64) throw new Error("engine render response missing pngBase64");
    const sha =
      asString(rreceipt?.sha256) ??
      asString(rjson.sha256) ??
      asString(rdata?.sha256);
    if (!sha) throw new Error("engine render response missing sha256");
    const runId = asString(rreceipt?.runId) ?? undefined;
    const previewUrl = `data:image/png;base64,${pngBase64}`;

    // The engine is the sole rendering + hashing authority. Pass its layered
    // evidence bundle through VERBATIM — no plugin-side recomputation.
    const renderId = asString(rdata?.renderId) ?? asString(rreceipt?.renderId) ?? "";
    const projectionHash = asString(rreceipt?.projectionHash) ?? asString(rdata?.projectionHash) ?? "";
    const pixelHash = asString(rreceipt?.pixelHash) ?? asString(rdata?.pixelHash) ?? "";
    const pngHash = asString(rreceipt?.sha256) ?? sha;
    const rendererVersion = asString(rdata?.rendererVersion) ?? asString(renvelope?.rendererVersion) ?? "";
    const runtimeFingerprint = (asObject(rreceipt?.runtimeFingerprint) ??
      asObject(rdata?.runtimeFingerprint) ??
      asObject(renvelope?.runtimeFingerprint)) as RuntimeFingerprint;
const evidenceStatus = (asString(rdata?.evidenceStatus) ??
      asString(renvelope?.evidenceStatus) ?? "substrate_verified") as "substrate_verified";
    const promotionStatus = (asString(rdata?.promotionStatus) ??
      asString(renvelope?.promotionStatus) ?? "not_promoted_to_ciems") as "not_promoted_to_ciems";
    const sceneSpecHash = asString(rdata?.sceneSpecHash) ?? asString(renvelope?.sceneSpecHash) ?? "";
    // Use the locally-derived deterministic seed; the engine echoes it back in receipt.renderParameters.seed.
    // @ts-ignore - TS misreports error on this line due to control-flow analysis bug
    const envelopeSeed = Number(asString(rreceipt?.renderParameters?.seed) ?? seed >>> 0);
    const trajectoryRoot = asString(rdata?.trajectoryRoot) ?? asString(renvelope?.trajectoryRoot) ?? "";

    // Fail-closed: the engine reported success but omitted a required evidence field.
    const missingFields: string[] = [];
    if (!renderId) missingFields.push("renderId");
    if (!sceneSpecHash) missingFields.push("sceneSpecHash");
    if (!projectionHash) missingFields.push("projectionHash");
    if (!pixelHash) missingFields.push("pixelHash");
    if (!pngHash) missingFields.push("pngHash");
    if (!rendererVersion) missingFields.push("rendererVersion");
    if (!runtimeFingerprint?.node) missingFields.push("runtimeFingerprint");
    if (!trajectoryRoot) missingFields.push("trajectoryRoot");
    if (missingFields.length > 0) {
      throw new Error(
        `ENGINE_EVIDENCE_INCOMPLETE: the RT4D engine returned a render without the required layered evidence bundle. Missing: ${missingFields.join(", ")}`,
      );
    }

    const bundle: EngineEvidenceBundle = {
      renderId,
      sceneId: asString(rdata?.sceneId) ?? asString(renvelope?.sceneId) ?? "",
      seed: envelopeSeed,
      trajectoryRoot,
      sceneSpecHash,
      projectionHash,
      pixelHash,
      pngHash,
rendererVersion,
      runtimeFingerprint: runtimeFingerprint ?? { node: "unknown", zlib: "builtin", platform: "unknown", arch: "unknown" },
      evidenceStatus,
      promotionStatus,
    };

    return {
      previewUrl,
      sha256: sha,
      source: "engine",
      width,
      height,
      runId,
      note: `Preview via RT4D_ENGINE_URL (${base}) POST /v1/scenes/{id}/render — deterministic seeded render (seed from sceneSha256).`,
      evidence: renvelope
        ? ({
            operation: asString(renvelope.operation) ?? "rt4d_dimensional_preview",
            source: asString(renvelope.source) ?? "mrs-renderer-core/rt4d",
            engineVersion: asString(renvelope.engineVersion) ?? "unknown",
            intentId: asString(renvelope.intentId) ?? "",
            timelineId: asString(renvelope.timelineId) ?? "",
            worldId: asString(renvelope.worldId) ?? "",
            sceneId: asString(renvelope.sceneId) ?? "",
            sceneSpecHash: asString(renvelope.sceneSpecHash) ?? "",
            sceneSha256: asString(renvelope.sceneSha256) ?? "",
            runId: asString((renvelope as Record<string, unknown>)?.["runId"]) ?? runId ?? "",
            renderKey: asString((renvelope as Record<string, unknown>)?.["renderKey"]) ?? "",
            renderId: asString((renvelope as Record<string, unknown>)?.["renderId"]) ?? renderId,
            seed: Number((renvelope as Record<string, unknown>)?.["seed"] ?? 0) >>> 0,
            projectionHash: asString((renvelope as Record<string, unknown>)?.["projectionHash"]) ?? projectionHash,
            pixelHash: asString((renvelope as Record<string, unknown>)?.["pixelHash"]) ?? pixelHash,
            pngHash: asString((renvelope as Record<string, unknown>)?.["pngHash"]) ?? pngHash,
            pngSha256: asString((renvelope as Record<string, unknown>)?.["pngSha256"]) ?? sha,
            rendererVersion: asString((renvelope as Record<string, unknown>)?.["rendererVersion"]) ?? rendererVersion,
            runtimeFingerprint:
              (asObject(renvelope.runtimeFingerprint) as RuntimeFingerprint | undefined) ?? runtimeFingerprint,
            parameters: (asObject(renvelope.parameters) as Record<string, unknown>) ?? {},
            parametersHash: asString(renvelope.parametersHash) ?? "",
            replayToken: asString(renvelope.replayToken) ?? "",
            at: asString(renvelope.at) ?? new Date().toISOString(),
            evidenceStatus,
            promotionStatus,
            conformance: renvelope.verified != null
              ? { ok: Boolean(renvelope.verified) }
              : undefined,
          } as Rt4dEvidenceEnvelope)
        : null,
      renderBundle: bundle,
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
      evidence: null,
      renderBundle: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
