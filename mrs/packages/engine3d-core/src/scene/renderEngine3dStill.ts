/**
 * Engine3D structure still: beauty (+ depth/normal) PNG via soft raster.
 *
 * Keeps null-headless `renderEngine3dFrame` for CI receipts.
 * Portrait structure MUST NOT use RT4D sphere-bridge (ENGINE3D_CONSTITUTIONAL_SUITE_v1.0).
 */

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  HeadlessGLStillRenderer,
  type RasterCamera,
  type RasterMesh,
  type RasterStillRequest,
} from "../renderer/raster/HeadlessStillRenderer.js";
import {
  buildDemoPortraitMeshes,
  buildPortraitRasterMeshesFromHumanRig,
  worldMeshToRasterMesh,
} from "../renderer/raster/portraitMeshes.js";
import type { World3D } from "../world/World3D.js";
import { DEFAULT_BRIDGE_CAMERA } from "./Engine3DSceneBridge.js";

export const ENGINE3D_STRUCTURE_RECORD_SCHEMA =
  "engine3d-structure-record/1.0" as const;

export type StructureSource =
  | "engine3d"
  | "engine3d_raster"
  | "engine3d_composite"
  | "flux_plate";

export interface Engine3dStructureRecord {
  schemaVersion: typeof ENGINE3D_STRUCTURE_RECORD_SCHEMA;
  run_id: string;
  world_id: string;
  camera_id: string;
  beauty_path: string;
  beauty_sha256?: string | null;
  depth_path?: string | null;
  depth_sha256?: string | null;
  normal_path?: string | null;
  normal_sha256?: string | null;
  rt4d_background_path?: string | null;
  rt4d_background_run_id?: string | null;
  composite_structure_path?: string | null;
  polished_png_path?: string | null;
  polish_strength?: number | null;
  polish_prompt?: string | null;
  structure_source: StructureSource;
  width?: number;
  height?: number;
  timestamp: string;
  note?: string;
}

export interface Engine3dStillRequest {
  outDir: string;
  width?: number;
  height?: number;
  worldId?: string;
  cameraId?: string;
  /** Optional World3D mesh to rasterize (takes precedence over demo). */
  world?: World3D;
  /** Optional HumanRig GLB path. */
  humanGlb?: string;
  poseId?: string;
  /** Override camera; defaults from BridgeCameraDescriptor + size. */
  camera?: Partial<RasterCamera>;
  aov?: { depth?: boolean; normal?: boolean };
  meshes?: RasterMesh[];
  runId?: string;
}

export interface Engine3dStillResult {
  runId: string;
  beautyPath: string;
  depthPath?: string;
  normalPath?: string;
  structureRecord: Engine3dStructureRecord;
}

function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function defaultCamera(width: number, height: number, partial?: Partial<RasterCamera>): RasterCamera {
  const eye = DEFAULT_BRIDGE_CAMERA.eye;
  const lookAt = DEFAULT_BRIDGE_CAMERA.lookAt;
  const up = DEFAULT_BRIDGE_CAMERA.up;
  return {
    id: partial?.id ?? "bridge-default",
    eye: partial?.eye ?? [eye[0], eye[1], eye[2]],
    lookAt: partial?.lookAt ?? [lookAt[0], lookAt[1], lookAt[2]],
    up: partial?.up ?? [up[0], up[1], up[2]],
    fovY: partial?.fovY ?? DEFAULT_BRIDGE_CAMERA.fovY,
    near: partial?.near ?? 0.1,
    far: partial?.far ?? 40,
    ...partial,
    width: partial?.width ?? width,
    height: partial?.height ?? height,
  };
}

function resolveMeshes(req: Engine3dStillRequest): RasterMesh[] {
  if (req.meshes && req.meshes.length > 0) return req.meshes;
  if (req.humanGlb) {
    const fromRig = buildPortraitRasterMeshesFromHumanRig(req.humanGlb, req.poseId);
    if (fromRig && fromRig.length > 0) return fromRig;
  }
  if (req.world) {
    return [worldMeshToRasterMesh("world-mesh", req.world.mesh)];
  }
  return buildDemoPortraitMeshes();
}

/**
 * Render an Engine3D structure still (beauty + optional AOVs) to `outDir`.
 */
export function renderEngine3dStill(req: Engine3dStillRequest): Engine3dStillResult {
  const width = Math.max(16, Math.min(2048, req.width ?? 512));
  const height = Math.max(16, Math.min(2048, req.height ?? 512));
  const runId = req.runId ?? randomUUID();
  const outDir = join(req.outDir, runId);
  mkdirSync(outDir, { recursive: true });

  const camera = defaultCamera(width, height, {
    ...req.camera,
    id: req.cameraId ?? req.camera?.id ?? "cam0",
  });
  const meshes = resolveMeshes(req);
  const rasterReq: RasterStillRequest = {
    camera,
    meshes,
    aov: {
      depth: req.aov?.depth !== false,
      normal: req.aov?.normal !== false,
    },
  };

  const files = new HeadlessGLStillRenderer(rasterReq).renderToDir(outDir);
  const worldId =
    req.worldId ??
    (req.humanGlb ? `human-glb:${req.humanGlb}` : req.world ? "world3d" : "demo-portrait");

  const structureRecord: Engine3dStructureRecord = {
    schemaVersion: ENGINE3D_STRUCTURE_RECORD_SCHEMA,
    run_id: runId,
    world_id: worldId,
    camera_id: camera.id,
    beauty_path: files.beautyPath,
    beauty_sha256: files.beautySha256,
    depth_path: files.depthPath ?? null,
    depth_sha256: files.depthSha256 ?? null,
    normal_path: files.normalPath ?? null,
    normal_sha256: files.normalSha256 ?? null,
    structure_source: "engine3d_raster",
    width,
    height,
    timestamp: utcNow(),
    note:
      "Engine3D soft-raster structure still (beauty + AOVs). " +
      "NOT photoreal skin; NOT RT4D sphere-bridge. Polish separately via Genblaze.",
  };

  return {
    runId,
    beautyPath: files.beautyPath,
    depthPath: files.depthPath,
    normalPath: files.normalPath,
    structureRecord,
  };
}
