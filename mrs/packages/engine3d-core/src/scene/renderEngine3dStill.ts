/**
 * Engine3D structure still: beauty (+ depth/normal) PNG via soft raster.
 *
 * Keeps null-headless `renderEngine3dFrame` for CI receipts.
 * Portrait structure MUST NOT use RT4D sphere-bridge (ENGINE3D_CONSTITUTIONAL_SUITE_v1.0).
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
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
import {
  defaultFaceRigConfig,
  detectFaceAssetKind,
  loadFaceRig,
  neutralFacePose,
  resolveHumanFacePath,
  defaultFaceRiggedGlbPath,
} from "../face/index.js";
import type { World3D } from "../world/World3D.js";
import { DEFAULT_BRIDGE_CAMERA } from "./Engine3DSceneBridge.js";

export const ENGINE3D_STRUCTURE_RECORD_SCHEMA =
  "engine3d-structure-record/1.0" as const;

/** Prefer operator GLB when present; else in-repo fixture. Re-exported for API stability. */
export { defaultFaceRiggedGlbPath };

export type StructureSource =
  | "engine3d"
  | "engine3d_raster"
  | "engine3d_composite"
  | "flux_plate";

/** Nested face rig evidence on structure stills (keeps boolean `face_rig`). */
export interface FaceRigDetailEvidence {
  mesh_path: string;
  armature_name: string;
  bones: string[];
  blendshapes: string[];
  asset_kind?: "fixture" | "operator";
}

/** Nested face pose evidence; stills without timeline use a neutral default. */
export interface FacePoseEvidence {
  time: number;
  bones: Record<string, number[]>;
  expressions: { name: string; weight: number }[];
}

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
  /** True when a face/HumanRig GLB was used for structure. */
  face_rig?: boolean;
  /** fixture = in-repo synthetic; operator = supplied production asset. */
  face_asset?: "fixture" | "operator" | "none";
  /** Discovered rig names + mesh path when a face GLB is used. */
  face_rig_detail?: FaceRigDetailEvidence;
  /** Pose applied for this still (neutral when no timeline pose). */
  face_pose?: FacePoseEvidence;
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
  /** Prefer face fixture when true and humanGlb omitted (default true). */
  preferFaceFixture?: boolean;
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

/** Build raster camera with safe defaults (incomplete world cameras cannot wipe eye/lookAt). */
export function defaultCamera(
  width: number,
  height: number,
  partial?: Partial<RasterCamera>,
): RasterCamera {
  const eye = DEFAULT_BRIDGE_CAMERA.eye;
  const lookAt = DEFAULT_BRIDGE_CAMERA.lookAt;
  const up = DEFAULT_BRIDGE_CAMERA.up;
  // Apply `partial` first, then re-assert fallbacks so missing eye/lookAt/up
  // (undefined keys from incomplete world JSON) cannot wipe defaults.
  return {
    ...partial,
    id: partial?.id ?? "bridge-default",
    eye: partial?.eye ?? [eye[0], eye[1], eye[2]],
    lookAt: partial?.lookAt ?? [lookAt[0], lookAt[1], lookAt[2]],
    up: partial?.up ?? [up[0], up[1], up[2]],
    fovY: partial?.fovY ?? DEFAULT_BRIDGE_CAMERA.fovY,
    near: partial?.near ?? 0.1,
    far: partial?.far ?? 40,
    width: partial?.width ?? width,
    height: partial?.height ?? height,
  };
}

function discoverFaceRigDetail(
  meshPath: string,
  faceAsset: "fixture" | "operator",
): FaceRigDetailEvidence | undefined {
  try {
    const loaded = loadFaceRig({
      ...defaultFaceRigConfig(meshPath),
      strict: false,
    });
    const bones = loaded.rig.skeleton.bones.map((b) => b.id);
    const blendshapes = new Set<string>();
    for (const mesh of loaded.rig.meshes.all) {
      for (const ch of mesh.morphChannels) blendshapes.add(ch.id);
    }
    return {
      mesh_path: meshPath,
      armature_name: loaded.config.armatureName,
      bones,
      blendshapes: [...blendshapes],
      asset_kind: faceAsset,
    };
  } catch {
    return undefined;
  }
}

function resolveMeshes(req: Engine3dStillRequest): {
  meshes: RasterMesh[];
  faceRig: boolean;
  faceAsset: "fixture" | "operator" | "none";
  humanGlb?: string;
  faceRigDetail?: FaceRigDetailEvidence;
  facePose?: FacePoseEvidence;
} {
  if (req.meshes && req.meshes.length > 0) {
    return { meshes: req.meshes, faceRig: false, faceAsset: "none" };
  }
  let humanGlb = req.humanGlb;
  let faceAsset: "fixture" | "operator" | "none" = "none";
  if (!humanGlb && req.preferFaceFixture !== false) {
    const resolved = resolveHumanFacePath("HumanFaceRigged");
    if (existsSync(resolved.path)) {
      humanGlb = resolved.path;
      faceAsset = resolved.face_asset;
    }
  } else if (humanGlb) {
    faceAsset = detectFaceAssetKind(humanGlb);
  }
  if (humanGlb) {
    const fromRig = buildPortraitRasterMeshesFromHumanRig(humanGlb, req.poseId);
    if (fromRig && fromRig.length > 0) {
      const kind = faceAsset === "none" ? "operator" : faceAsset;
      const faceRigDetail = discoverFaceRigDetail(humanGlb, kind);
      const neutral = neutralFacePose(0);
      return {
        meshes: fromRig,
        faceRig: true,
        faceAsset,
        humanGlb,
        faceRigDetail,
        facePose: {
          time: neutral.time,
          bones: { ...neutral.bones },
          expressions: [...neutral.expressions],
        },
      };
    }
  }
  if (req.world) {
    return {
      meshes: [worldMeshToRasterMesh("world-mesh", req.world.mesh)],
      faceRig: false,
      faceAsset: "none",
    };
  }
  return {
    meshes: buildDemoPortraitMeshes(),
    faceRig: false,
    faceAsset: "none",
  };
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
  const resolved = resolveMeshes(req);
  const rasterReq: RasterStillRequest = {
    camera,
    meshes: resolved.meshes,
    aov: {
      depth: req.aov?.depth !== false,
      normal: req.aov?.normal !== false,
    },
  };

  const files = new HeadlessGLStillRenderer(rasterReq).renderToDir(outDir);
  const worldId =
    req.worldId ??
    (resolved.humanGlb
      ? `human-glb:${resolved.faceAsset}`
      : req.world
        ? "world3d"
        : "demo-portrait");

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
    face_rig: resolved.faceRig,
    face_asset: resolved.faceAsset,
    ...(resolved.faceRigDetail
      ? { face_rig_detail: resolved.faceRigDetail }
      : {}),
    ...(resolved.facePose ? { face_pose: resolved.facePose } : {}),
    note:
      "Engine3D soft-raster structure still (beauty + AOVs). " +
      "NOT photoreal skin; NOT RT4D sphere-bridge. Polish separately via Genblaze." +
      (resolved.faceRig
        ? ` Face rig present (asset=${resolved.faceAsset}).`
        : " Demo sphere-head (not a governed face mesh)."),
  };

  return {
    runId,
    beautyPath: files.beautyPath,
    depthPath: files.depthPath,
    normalPath: files.normalPath,
    structureRecord,
  };
}
