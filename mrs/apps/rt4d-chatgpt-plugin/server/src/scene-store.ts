import { createHash, randomUUID } from "node:crypto";
import {
  buildShotEvidenceEnvelope,
  defaultContinuityState,
  type ContinuityState,
  type ShotEvidenceEnvelope,
} from "./evidence.js";
import type { ProductionMode } from "./modes.js";
import {
  MODE_PASS,
  MODE_PRODUCT_LANE,
  type PipelinePass,
  type ProductLane,
} from "./modes.js";

export type { ContinuityState };
export type RotationPlane = "XY" | "XZ" | "XW" | "YZ" | "YW" | "ZW";

export type SceneProvenance = {
  intentId: string;
  timelineId: string;
  worldId: string;
  projector: {
    type: "perspective" | "orthographic";
    distance4d: number;
    distance3d: number;
    planes: RotationPlane[];
  };
  hashes: {
    sceneSha256: string;
    previewSha256?: string;
  };
  mode: ProductionMode;
  productLane: ProductLane;
  pass: PipelinePass;
  passStatus: "partial" | "skeleton" | "declared";
  statusTag: "partial";
  createdAt: string;
  updatedAt: string;
};

export type Rt4dSceneRecord = {
  sceneId: string;
  prompt: string;
  mode: ProductionMode;
  productLane: ProductLane;
  pass: PipelinePass;
  passStatus: "partial" | "skeleton" | "declared";
  rotations: Array<{ plane: RotationPlane; speed: number }>;
  projection: {
    type: "perspective" | "orthographic";
    distance4d: number;
    distance3d: number;
  };
  continuityState: ContinuityState;
  provenance: SceneProvenance;
  shotEvidence?: ShotEvidenceEnvelope;
  preview?: {
    previewUrl: string;
    sha256: string;
    source: "engine" | "placeholder";
    width: number;
    height: number;
  };
  sceneJson: Record<string, unknown>;
};

/** In-memory scene store for this MCP process (not durable). */
export const sceneStore = new Map<string, Rt4dSceneRecord>();

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function stableSceneId(seed: string): string {
  const digest = sha256Hex(seed).slice(0, 16);
  return `rt4d-scene-${digest}`;
}

export function createRt4dScene(input: {
  prompt: string;
  mode: ProductionMode;
  rotations?: Array<{ plane: RotationPlane; speed: number }>;
  projection?: {
    type: "perspective" | "orthographic";
    distance4d: number;
    distance3d: number;
  };
  continuityState?: Partial<ContinuityState>;
  intentId?: string;
  timelineId?: string;
  worldId?: string;
  parentShotId?: string | null;
}): Rt4dSceneRecord {
  const passMeta = MODE_PASS[input.mode];
  const productLane = MODE_PRODUCT_LANE[input.mode];
  const rotations = input.rotations ?? [
    { plane: "XW" as const, speed: 0.7 },
    { plane: "YW" as const, speed: 0.55 },
  ];
  const projection = input.projection ?? {
    type: "perspective" as const,
    distance4d: 4,
    distance3d: 2.5,
  };

  const continuityState = defaultContinuityState({
    ...input.continuityState,
    rt4dState: {
      rotations,
      projection,
      ...(input.continuityState?.rt4dState ?? {}),
    },
  });

  const intentId = input.intentId ?? `intent-${randomUUID()}`;
  const timelineId = input.timelineId ?? `timeline-${randomUUID()}`;
  const worldId = input.worldId ?? `world-${randomUUID()}`;
  const now = new Date().toISOString();

  const sceneSeed = JSON.stringify({
    prompt: input.prompt,
    mode: input.mode,
    rotations,
    projection,
    continuityVersion: continuityState.continuityVersion,
  });
  const sceneId = stableSceneId(sceneSeed);

  const sceneJson: Record<string, unknown> = {
    schemaVersion: "rt4d-chatgpt-plugin/scene/v0.1",
    sceneId,
    prompt: input.prompt,
    mode: input.mode,
    productLane,
    pass: passMeta.pass,
    passStatus: passMeta.status,
    rotations,
    projection,
    continuityState,
    pipeline: [
      "user_intent",
      "anime_director",
      "state_resolver",
      "rt3d_scene_assembly",
      "rt4d_effect_graph",
      "timeline",
      "continuity_gate",
      "renderer_router",
      "composite",
      "evidence_replay",
    ],
    architectureSoT:
      "docs/anime-lane/RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md",
    note:
      "Phase 1: RT4D dimensional preview is partial; RT3D persistence, 5s film, Unity/Unreal export are declared. MCP does not embed RT4D math.",
  };

  const sceneSha256 = sha256Hex(JSON.stringify(sceneJson));
  const provenance: SceneProvenance = {
    intentId,
    timelineId,
    worldId,
    projector: {
      ...projection,
      planes: rotations.map((r) => r.plane),
    },
    hashes: { sceneSha256 },
    mode: input.mode,
    productLane,
    pass: passMeta.pass,
    passStatus: passMeta.status,
    statusTag: "partial",
    createdAt: now,
    updatedAt: now,
  };

  const record: Rt4dSceneRecord = {
    sceneId,
    prompt: input.prompt,
    mode: input.mode,
    productLane,
    pass: passMeta.pass,
    passStatus: passMeta.status,
    rotations,
    projection,
    continuityState,
    provenance,
    sceneJson: {
      ...sceneJson,
      provenance,
    },
  };

  record.shotEvidence = buildShotEvidenceEnvelope(record, {
    parentShotId: input.parentShotId ?? null,
  });
  record.sceneJson = {
    ...record.sceneJson,
    shotEvidence: record.shotEvidence,
  };

  sceneStore.set(sceneId, record);
  return record;
}

export function getSceneOrThrow(sceneId: string): Rt4dSceneRecord {
  const scene = sceneStore.get(sceneId);
  if (!scene) {
    throw new Error(`Unknown sceneId: ${sceneId}`);
  }
  return scene;
}

export function attachPreview(
  sceneId: string,
  preview: NonNullable<Rt4dSceneRecord["preview"]>
): Rt4dSceneRecord {
  const scene = getSceneOrThrow(sceneId);
  scene.preview = preview;
  scene.provenance.hashes.previewSha256 = preview.sha256;
  scene.provenance.updatedAt = new Date().toISOString();
  scene.shotEvidence = buildShotEvidenceEnvelope(scene, {
    parentShotId: scene.shotEvidence?.parentShotId ?? null,
    outputHash: preview.sha256,
  });
  scene.sceneJson = {
    ...scene.sceneJson,
    preview,
    provenance: scene.provenance,
    shotEvidence: scene.shotEvidence,
  };
  sceneStore.set(sceneId, scene);
  return scene;
}
