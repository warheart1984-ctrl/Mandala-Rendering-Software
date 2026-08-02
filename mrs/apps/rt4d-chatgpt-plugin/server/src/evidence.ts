import { createHash } from "node:crypto";
import type { ProductionMode } from "./modes.js";
import { MODE_PRODUCT_LANE } from "./modes.js";

export type ContinuityState = {
  schemaVersion: "ContinuityState.v1";
  statusTag: "partial";
  characterState: Record<string, unknown>;
  worldState: Record<string, unknown>;
  cameraState: Record<string, unknown>;
  emotionState: Record<string, unknown>;
  rt4dState: Record<string, unknown>;
  continuityVersion: number;
};

export type ShotEvidenceEnvelope = {
  schemaVersion: "ShotEvidenceEnvelope.v1";
  statusTag: "partial";
  shotId: string;
  characterModelHash: string;
  worldStateHash: string;
  rt3dSceneHash: string;
  rt4dTransformHash: string;
  timelineHash: string;
  rendererVersion: string;
  seed: number;
  cameraParameters: Record<string, unknown>;
  projectionParameters: Record<string, unknown>;
  outputHash: string;
  parentShotId: string | null;
  intentId: string;
  timelineId: string;
  worldId: string;
  productLane: string;
  mode: ProductionMode;
  notes: string;
};

/** Minimal scene slice for envelope emission (avoids circular imports). */
export type SceneEvidenceInput = {
  sceneId: string;
  prompt: string;
  mode: ProductionMode;
  pass: string;
  rotations: Array<{ plane: string; speed: number }>;
  projection: Record<string, unknown>;
  continuityState: ContinuityState;
  provenance: {
    intentId: string;
    timelineId: string;
    worldId: string;
    hashes: { sceneSha256: string; previewSha256?: string };
  };
  preview?: { sha256: string };
  shotEvidence?: { parentShotId?: string | null };
};

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function seedFromHex(hex: string): number {
  return Number.parseInt(hex.slice(0, 8), 16) >>> 0;
}

export function defaultContinuityState(
  partial?: Partial<ContinuityState>
): ContinuityState {
  return {
    schemaVersion: "ContinuityState.v1",
    statusTag: "partial",
    characterState: partial?.characterState ?? {},
    worldState: partial?.worldState ?? {},
    cameraState: partial?.cameraState ?? {},
    emotionState: partial?.emotionState ?? {},
    rt4dState: partial?.rt4dState ?? {},
    continuityVersion: partial?.continuityVersion ?? 0,
  };
}

export function buildShotEvidenceEnvelope(
  scene: SceneEvidenceInput,
  opts?: { parentShotId?: string | null; outputHash?: string }
): ShotEvidenceEnvelope {
  const continuity = scene.continuityState ?? defaultContinuityState();
  const characterModelHash = sha256Hex(
    JSON.stringify(continuity.characterState)
  );
  const worldStateHash = sha256Hex(JSON.stringify(continuity.worldState));
  const rt3dSceneHash = sha256Hex(
    JSON.stringify({
      prompt: scene.prompt,
      mode: scene.mode,
      pass: scene.pass,
      note: "rt3d_assembly_declared",
    })
  );
  const rt4dTransformHash = sha256Hex(
    JSON.stringify({
      rotations: scene.rotations,
      projection: scene.projection,
      rt4dState: continuity.rt4dState,
    })
  );
  const timelineHash = sha256Hex(
    JSON.stringify({
      timelineId: scene.provenance.timelineId,
      continuityVersion: continuity.continuityVersion,
    })
  );
  const outputHash =
    opts?.outputHash ??
    scene.preview?.sha256 ??
    scene.provenance.hashes.previewSha256 ??
    scene.provenance.hashes.sceneSha256;

  return {
    schemaVersion: "ShotEvidenceEnvelope.v1",
    statusTag: "partial",
    shotId: `RTANIME-${scene.sceneId.replace(/^rt4d-scene-/, "S-").toUpperCase()}`,
    characterModelHash,
    worldStateHash,
    rt3dSceneHash,
    rt4dTransformHash,
    timelineHash,
    rendererVersion: "rt4d-chatgpt-plugin@0.1.0",
    seed: seedFromHex(scene.provenance.hashes.sceneSha256),
    cameraParameters: {
      ...continuity.cameraState,
      intentId: scene.provenance.intentId,
    },
    projectionParameters: {
      ...scene.projection,
      planes: scene.rotations.map((r) => r.plane),
    },
    outputHash,
    parentShotId: opts?.parentShotId ?? null,
    intentId: scene.provenance.intentId,
    timelineId: scene.provenance.timelineId,
    worldId: scene.provenance.worldId,
    productLane: MODE_PRODUCT_LANE[scene.mode],
    mode: scene.mode,
    notes:
      "Phase 1 in-memory envelope. RT3D persistence, 5s film timeline, and verified replay remain declared until built. No claim without evidence.",
  };
}
