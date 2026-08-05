// @mrs/rt4d-engine store — status: live (content-addressed scene cache + render receipts)
import { createHash } from "node:crypto";

export type SceneSpec = {
  surface: string;
  resolution: number;
  rotations: Array<{ plane: string; speed: number }>;
  projection: { type: string; distance4d: number; distance3d: number };
  camera: { fovX: number; fovY: number; fovZ: number; fovW: number; lensRadius: number };
  intentId?: string;
  timelineId?: string;
  worldId?: string;
  /** Non-canonical provenance metadata: sha256 of the natural-language request that
   * produced this spec. Excluded from canonicalSceneJson so it never affects sceneId. */
  promptHash?: string;
};

export type RenderReceipt = {
  runId: string;
  renderKey: string;
  sha256: string;
  pixelHash: string;
  renderId: string;
  renderIdentityHash: string;
  projectionHash: string;
  runtimeFingerprint: {
    node: string;
    zlib: string;
    platform: string;
    arch: string;
  };
  renderParameters: Record<string, unknown>;
  cached: boolean;
  at: string;
  pngBase64?: string;
};

export type SceneRecord = {
  /** Content-addressed identity (rt4d-scene-<16hex>) — stable across id-stable patches. */
  sceneId: string;
  spec: SceneSpec;
  /** Hash of the CURRENT spec (canonicalSceneJson) — changes after an id-stable patch. */
  sceneHash: string;
  provenance: {
    intentId: string;
    timelineId: string;
    worldId: string;
    hashes: { sceneSha256: string };
  };
  receipts: Map<string, RenderReceipt>;
  createdAt: string;
  updatedAt: string;
};

const scenes = new Map<string, SceneRecord>();

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Deterministic canonical serialization (fixed key order) so equal specs always
 * produce equal sceneIds. lensRadius is normalized to 0 (lens disabled for P4
 * replayable reality — Camera4D._sampleLens otherwise calls Math.random()).
 */
export function canonicalSceneJson(spec: SceneSpec): string {
  const canonical = {
    surface: spec.surface,
    resolution: spec.resolution,
    rotations: (spec.rotations ?? []).map((r) => ({
      plane: r.plane,
      speed: Number(r.speed),
    })),
    projection: {
      type: spec.projection?.type,
      distance4d: Number(spec.projection?.distance4d),
      distance3d: Number(spec.projection?.distance3d),
    },
    camera: {
      fovX: Number(spec.camera?.fovX),
      fovY: Number(spec.camera?.fovY),
      fovZ: Number(spec.camera?.fovZ),
      fovW: Number(spec.camera?.fovW),
      lensRadius: 0,
    },
    intentId: spec.intentId ?? "",
    timelineId: spec.timelineId ?? "",
    worldId: spec.worldId ?? "",
  };
  return JSON.stringify(canonical);
}

export function upsertScene(spec: SceneSpec): SceneRecord {
  const sceneHash = sha256Hex(canonicalSceneJson(spec));
  const sceneId = `rt4d-scene-${sceneHash.slice(0, 16)}`;
  const existing = scenes.get(sceneId);
  const now = new Date().toISOString();
  const record: SceneRecord = {
    sceneId,
    spec,
    sceneHash,
    provenance: {
      intentId: spec.intentId ?? "",
      timelineId: spec.timelineId ?? "",
      worldId: spec.worldId ?? "",
      hashes: { sceneSha256: sceneHash },
    },
    receipts: existing?.receipts ?? new Map(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: existing?.updatedAt ?? now,
  };
  scenes.set(sceneId, record);
  return record;
}

export function getScene(sceneId: string): SceneRecord | null {
  return scenes.get(sceneId) ?? null;
}

export function patchScene(sceneId: string, patch: Partial<SceneSpec>): SceneRecord | null {
  const record = scenes.get(sceneId);
  if (!record) return null;
  const spec: SceneSpec = { ...record.spec };
  if (typeof patch.surface === "string") spec.surface = patch.surface;
  if (typeof patch.resolution === "number") spec.resolution = patch.resolution;
  if (Array.isArray(patch.rotations)) spec.rotations = patch.rotations;
  if (patch.projection && typeof patch.projection === "object") {
    spec.projection = { ...spec.projection, ...(patch.projection as object) };
  }
  if (patch.camera && typeof patch.camera === "object") {
    spec.camera = { ...spec.camera, ...(patch.camera as object) } as SceneSpec["camera"];
  }
  const sceneHash = sha256Hex(canonicalSceneJson(spec));
  record.spec = spec;
  record.sceneHash = sceneHash;
  record.updatedAt = new Date().toISOString();
  return record;
}

/**
 * Restore a durable record into the in-memory cache WITHOUT re-deriving sceneId.
 * This is what makes id-stable patches survive ECS task replacement: the durable
 * sceneSpecHash may differ from the original content address (identityHash), but
 * the sceneId stays bound to the ORIGINAL creation spec.
 */
export function restoreScene(record: {
  sceneId: string;
  spec: SceneSpec;
  createdAt: string;
  updatedAt: string;
}): SceneRecord {
  const sceneHash = sha256Hex(canonicalSceneJson(record.spec));
  const restored: SceneRecord = {
    sceneId: record.sceneId,
    spec: structuredClone(record.spec),
    sceneHash,
    provenance: {
      intentId: record.spec.intentId ?? "",
      timelineId: record.spec.timelineId ?? "",
      worldId: record.spec.worldId ?? "",
      hashes: { sceneSha256: sceneHash },
    },
    receipts: scenes.get(record.sceneId)?.receipts ?? new Map(),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  scenes.set(restored.sceneId, restored);
  return restored;
}

/** Test-only cache clear so route tests can force a memory miss (rehydrate path). */
export function clearSceneCache(): void {
  scenes.clear();
}

export function getReceipt(sceneId: string, renderKey: string): RenderReceipt | null {
  return scenes.get(sceneId)?.receipts.get(renderKey) ?? null;
}

export function putReceipt(sceneId: string, renderKey: string, receipt: RenderReceipt): void {
  const record = scenes.get(sceneId);
  if (!record) return;
  record.receipts.set(renderKey, receipt);
}

export function listReceipts(sceneId: string): RenderReceipt[] {
  return Array.from(scenes.get(sceneId)?.receipts.values() ?? []);
}

export function deriveRenderKey(sceneHash: string, renderParams: Record<string, unknown>): string {
  return sha256Hex(sceneHash + JSON.stringify(renderParams));
}
