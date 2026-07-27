/**
 * Engine3D cinematic runtime — short sequence loop over soft-raster stills.
 *
 * Status: **prepared** (structure AOVs per frame). Polish / RT4D / composite
 * remain Genblaze Python responsibilities — not duplicated here.
 *
 * Spec: ENGINE3D_CINEMATIC_FOUNDATION_v1.0.md
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import {
  HeadlessGLStillRenderer,
  type RasterCamera,
  type RasterMesh,
} from "../renderer/raster/HeadlessStillRenderer.js";
import { buildDemoPortraitMeshes } from "../renderer/raster/portraitMeshes.js";
import {
  assertValidTimeline,
  evaluateCameraEye,
  frameCount,
  frameTime,
  type Timeline,
} from "../timeline/index.js";
import { DEFAULT_BRIDGE_CAMERA } from "../scene/Engine3DSceneBridge.js";

export const ENGINE3D_SEQUENCE_RECORD_SCHEMA =
  "engine3d-sequence-record/1.0" as const;

export interface CinematicRuntimeConfig {
  timeline: Timeline;
  outputDir: string;
  width?: number;
  height?: number;
  meshes?: RasterMesh[];
  /** Inclusive frame range (farm slice). Defaults to full timeline. */
  frameStart?: number;
  frameEnd?: number;
  cameraId?: string;
  worldId?: string;
  sequenceId?: string;
  aov?: { depth?: boolean; normal?: boolean };
  /** Resolution label for sequence record (declared target, not a guarantee). */
  resolutionLabel?: "preview" | "1080p" | "4K" | "8K" | "custom";
}

export interface SequenceFramePaths {
  frame_index: number;
  beauty_path: string;
  depth_path?: string | null;
  normal_path?: string | null;
  final_path: string;
  timestamp: string;
}

export interface Engine3dSequenceRecord {
  schemaVersion: typeof ENGINE3D_SEQUENCE_RECORD_SCHEMA;
  sequence_id: string;
  timeline_id: string;
  world_id: string;
  camera_id: string;
  resolution: { label: string; width: number; height: number };
  fps: number;
  frame_count: number;
  frame_start: number;
  frame_end: number;
  structure_source: "engine3d_raster";
  frames: SequenceFramePaths[];
  timestamp: string;
  note: string;
}

function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function baseCamera(width: number, height: number, cameraId: string): RasterCamera {
  return {
    id: cameraId,
    eye: [
      DEFAULT_BRIDGE_CAMERA.eye[0],
      DEFAULT_BRIDGE_CAMERA.eye[1],
      DEFAULT_BRIDGE_CAMERA.eye[2],
    ],
    lookAt: [
      DEFAULT_BRIDGE_CAMERA.lookAt[0],
      DEFAULT_BRIDGE_CAMERA.lookAt[1],
      DEFAULT_BRIDGE_CAMERA.lookAt[2],
    ],
    up: [
      DEFAULT_BRIDGE_CAMERA.up[0],
      DEFAULT_BRIDGE_CAMERA.up[1],
      DEFAULT_BRIDGE_CAMERA.up[2],
    ],
    fovY: DEFAULT_BRIDGE_CAMERA.fovY,
    near: 0.1,
    far: 40,
    width,
    height,
  };
}

function padFrame(f: number): string {
  return String(f).padStart(4, "0");
}

/**
 * Evaluate timeline + soft-raster each assigned frame into `outputDir`.
 * Does not call polish / RT4D / FFmpeg.
 */
export class Engine3DCinematicRuntime {
  constructor(private cfg: CinematicRuntimeConfig) {}

  runSequence(): Engine3dSequenceRecord {
    assertValidTimeline(this.cfg.timeline);
    const width = Math.max(16, Math.min(2048, this.cfg.width ?? 128));
    const height = Math.max(16, Math.min(2048, this.cfg.height ?? 128));
    const total = frameCount(this.cfg.timeline);
    const frameStart = Math.max(0, this.cfg.frameStart ?? 0);
    const frameEnd = Math.min(total - 1, this.cfg.frameEnd ?? total - 1);
    if (frameEnd < frameStart) {
      throw new Error(`invalid frame range ${frameStart}–${frameEnd}`);
    }

    const sequenceId = this.cfg.sequenceId ?? randomUUID();
    const outDir = join(this.cfg.outputDir, sequenceId);
    mkdirSync(outDir, { recursive: true });

    const meshes = this.cfg.meshes?.length
      ? this.cfg.meshes
      : buildDemoPortraitMeshes();
    const cameraId = this.cfg.cameraId ?? "cam0";
    const worldId = this.cfg.worldId ?? "demo-portrait";
    const frames: SequenceFramePaths[] = [];

    for (let f = frameStart; f <= frameEnd; f++) {
      const t = frameTime(f, this.cfg.timeline.fps);
      const camera = baseCamera(width, height, cameraId);
      const eye = evaluateCameraEye(this.cfg.timeline, t);
      if (eye) camera.eye = [eye[0], eye[1], eye[2]];

      const prefix = `frame_${padFrame(f)}_`;
      const finalPath = join(outDir, `${prefix}final.png`);

      const files = new HeadlessGLStillRenderer({
        camera,
        meshes,
        aov: {
          depth: this.cfg.aov?.depth !== false,
          normal: this.cfg.aov?.normal !== false,
        },
      }).renderToDir(outDir, prefix);

      copyFileSync(files.beautyPath, finalPath);

      frames.push({
        frame_index: f,
        beauty_path: files.beautyPath,
        depth_path: files.depthPath ?? null,
        normal_path: files.normalPath ?? null,
        final_path: finalPath,
        timestamp: utcNow(),
      });
    }

    const record: Engine3dSequenceRecord = {
      schemaVersion: ENGINE3D_SEQUENCE_RECORD_SCHEMA,
      sequence_id: sequenceId,
      timeline_id: this.cfg.timeline.id,
      world_id: worldId,
      camera_id: cameraId,
      resolution: {
        label: this.cfg.resolutionLabel ?? "preview",
        width,
        height,
      },
      fps: this.cfg.timeline.fps,
      frame_count: frames.length,
      frame_start: frameStart,
      frame_end: frameEnd,
      structure_source: "engine3d_raster",
      frames,
      timestamp: utcNow(),
      note:
        "Engine3D soft-raster short sequence (structure AOVs). " +
        "NOT photoreal; NOT 8K film farm. Polish/RT4D/composite via Genblaze.",
    };

    writeFileSync(
      join(outDir, "sequence_record.json"),
      JSON.stringify(record, null, 2),
      "utf8",
    );
    return record;
  }
}
