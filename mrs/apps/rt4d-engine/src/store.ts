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
};

export type RenderReceipt = {
  runId: string;
  renderKey: string;
  sha256: string;
  pixelHash: string;
  renderId: string;
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
  spec: SceneSpec;
  sceneHash: string;
  provenance: {
    intentId: string;
    timelineId: string;
    worldId: string;
    hashes: { sceneSha256: string };
  };
  receipts: Map<string, RenderReceipt>;
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

export function upsertScene(spec: SceneSpec): { sceneId: string; sceneHash: string } {
  const sceneHash = sha256Hex(canonicalSceneJson(spec));
  const sceneId = `rt4d-scene-${sceneHash.slice(0, 16)}`;
  const existing = scenes.get(sceneId);
  scenes.set(sceneId, {
    spec,
    sceneHash,
    provenance: {
      intentId: spec.intentId ?? "",
      timelineId: spec.timelineId ?? "",
      worldId: spec.worldId ?? "",
      hashes: { sceneSha256: sceneHash },
    },
    receipts: existing?.receipts ?? new Map(),
  });
  return { sceneId, sceneHash };
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
  return record;
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
