import type { CameraParams, Vec3Tuple, WorldObject } from "./WorldObject.js";
import { hashCanonical } from "../scene/hash.js";

export interface Rt4dCameraEntry {
  readonly id: string;
  readonly type: CameraParams["type"];
  readonly position: Vec3Tuple;
  readonly target: Vec3Tuple;
  readonly fovY: number;
  readonly orthographicHeight?: number;
  readonly focalLengthMm: number;
  readonly apertureF: number;
  readonly focusDistance: number;
  readonly exposure: number;
  readonly shutterSeconds: number;
  readonly motionBlur: boolean;
  readonly bokehBlades?: number;
  readonly chromaticAberration?: number;
  readonly motionPathId?: string;
}

function finite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback;
}

export function cameraObjectToRt4dEntry(camera: WorldObject): Rt4dCameraEntry {
  const params = camera.camera ?? { type: "perspective" as const };
  const type = params.type;
  const defaults = {
    perspective: { fovY: 55, focalLengthMm: 35 },
    orthographic: { fovY: 0, focalLengthMm: 50 },
    portrait: { fovY: 28, focalLengthMm: 85 },
    wide: { fovY: 75, focalLengthMm: 24 },
    macro: { fovY: 18, focalLengthMm: 100 },
  }[type];
  return {
    id: camera.id,
    type,
    position: camera.transform.position,
    target: params.target ?? [0, 0, 0],
    fovY: Math.max(0, finite(params.fovY, defaults.fovY)),
    ...(type === "orthographic" ? { orthographicHeight: Math.max(0.001, finite(params.orthographicHeight, 5)) } : {}),
    focalLengthMm: Math.max(1, finite(params.focalLengthMm, defaults.focalLengthMm)),
    apertureF: Math.max(0.1, finite(params.apertureF, type === "portrait" || type === "macro" ? 2.8 : 8)),
    focusDistance: Math.max(0.001, finite(params.focusDistance, 10)),
    exposure: finite(params.exposure, 1),
    shutterSeconds: Math.max(0, finite(params.shutterSeconds, 0)),
    motionBlur: params.motionBlur === true,
    ...(params.bokehBlades != null ? { bokehBlades: Math.max(3, Math.round(finite(params.bokehBlades, 7))) } : {}),
    ...(params.chromaticAberration != null ? { chromaticAberration: Math.max(0, finite(params.chromaticAberration, 0)) } : {}),
    ...(params.motionPathId ? { motionPathId: params.motionPathId } : {}),
  };
}

export function buildRt4dCameraTable(cameras: readonly WorldObject[]): readonly Rt4dCameraEntry[] {
  return cameras.map(cameraObjectToRt4dEntry).sort((a, b) => a.id.localeCompare(b.id));
}

export function hashCameraMotion(cameras: readonly WorldObject[]): string | undefined {
  const moving = buildRt4dCameraTable(cameras).filter((camera) => camera.motionBlur || camera.shutterSeconds > 0 || camera.motionPathId);
  return moving.length ? hashCanonical(moving) : undefined;
}
