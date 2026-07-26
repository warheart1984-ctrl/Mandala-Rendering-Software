import type { LightParams, Vec3Tuple, WorldObject } from "./WorldObject.js";
import { hashCanonical } from "../scene/hash.js";

export interface Rt4dLightEntry {
  readonly id: string;
  readonly type: LightParams["type"];
  readonly color: Vec3Tuple;
  readonly intensity: number;
  readonly position: Vec3Tuple;
  readonly direction?: Vec3Tuple;
  readonly range?: number;
  readonly coneAngle?: number;
  readonly radius: number;
  readonly width?: number;
  readonly height?: number;
  readonly softness: number;
  readonly shadowBias: number;
}

export type LightingPreset = "portrait-studio" | "studio-softbox" | "void-rim" | "mandala-glow";

function finite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback;
}

function finiteColor(color: Vec3Tuple | undefined, fallback: Vec3Tuple): Vec3Tuple {
  if (!color) return fallback;
  return [
    Number.isFinite(color[0]) ? color[0] : fallback[0],
    Number.isFinite(color[1]) ? color[1] : fallback[1],
    Number.isFinite(color[2]) ? color[2] : fallback[2],
  ];
}

export function lightObjectToRt4dEntry(light: WorldObject): Rt4dLightEntry {
  const params = light.light ?? { type: "directional" as const, color: [1, 1, 1] as const, intensity: 1 };
  return {
    id: light.id,
    type: params.type,
    color: finiteColor(params.color, [1, 1, 1]),
    intensity: Math.max(0, finite(params.intensity, 1)),
    position: light.transform.position,
    ...(params.direction ? { direction: finiteColor(params.direction, [0, -1, 0]) } : {}),
    ...(params.range != null ? { range: Math.max(0, finite(params.range, 0)) } : {}),
    ...(params.coneAngle != null ? { coneAngle: Math.max(0, finite(params.coneAngle, 0)) } : {}),
    radius: Math.max(0, finite(params.radius, params.type === "area" ? 1 : 0)),
    ...(params.width != null ? { width: Math.max(0, finite(params.width, 0)) } : {}),
    ...(params.height != null ? { height: Math.max(0, finite(params.height, 0)) } : {}),
    softness: Math.max(0, finite(params.softness, params.type === "directional" ? 0.05 : 0.25)),
    shadowBias: Math.max(0, finite(params.shadowBias, 0.001)),
  };
}

export function buildRt4dLightTable(lights: readonly WorldObject[]): readonly Rt4dLightEntry[] {
  return lights.map(lightObjectToRt4dEntry).sort((a, b) => a.id.localeCompare(b.id));
}

export function createLightingPreset(preset: LightingPreset): readonly WorldObject[] {
  const base = {
    kind: "light" as const,
    geometry: null,
    material: null,
    children: [],
    transform: { position: [0, 0, 0] as const, rotation: [0, 0, 0] as const, scale: [1, 1, 1] as const },
  };
  if (preset === "portrait-studio") {
    return [
      { ...base, id: "key", light: { type: "area", color: [1, 0.94, 0.86], intensity: 4, direction: [-0.4, -0.6, -0.2], width: 2, height: 2, softness: 0.65 } },
      { ...base, id: "fill", light: { type: "area", color: [0.65, 0.75, 1], intensity: 1.1, direction: [0.6, -0.4, -0.1], width: 3, height: 3, softness: 0.9 } },
      { ...base, id: "rim", light: { type: "directional", color: [0.8, 0.9, 1], intensity: 1.8, direction: [0.2, -0.2, 1], softness: 0.2 } },
    ];
  }
  if (preset === "void-rim") {
    return [{ ...base, id: "void-rim", light: { type: "directional", color: [0.5, 0.7, 1], intensity: 2, direction: [0, -0.2, 1], softness: 0.15 } }];
  }
  if (preset === "mandala-glow") {
    return [{ ...base, id: "mandala-env", light: { type: "environment", color: [0.8, 0.3, 1], intensity: 1.6, softness: 1 } }];
  }
  return [{ ...base, id: "studio-softbox", light: { type: "area", color: [1, 1, 1], intensity: 3, width: 4, height: 4, softness: 0.85 } }];
}

export function hashLightingRig(lights: readonly WorldObject[]): string {
  return hashCanonical(buildRt4dLightTable(lights));
}
