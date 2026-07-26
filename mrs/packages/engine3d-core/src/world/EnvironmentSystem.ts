import type { EnvironmentParams, Vec3Tuple } from "./WorldObject.js";
import { hashCanonical } from "../scene/hash.js";

export interface Rt4dEnvironmentEntry {
  readonly preset: EnvironmentParams["preset"];
  readonly intensity: number;
  readonly color: Vec3Tuple;
  readonly rotation: number;
  readonly hdriTextureId?: string;
  readonly proceduralSeed: number;
  readonly horizonBlend: number;
}

export function createEnvironmentPreset(preset: EnvironmentParams["preset"], seed = 0): EnvironmentParams {
  if (preset === "studio") return { preset, intensity: 1.2, color: [1, 0.96, 0.9], proceduralSeed: seed, horizonBlend: 0.35 };
  if (preset === "void") return { preset, intensity: 0.15, color: [0.01, 0.01, 0.025], proceduralSeed: seed, horizonBlend: 0 };
  if (preset === "mandala") return { preset, intensity: 1.6, color: [0.8, 0.25, 1], proceduralSeed: seed, horizonBlend: 0.7 };
  if (preset === "cosmic") return { preset, intensity: 1.1, color: [0.25, 0.35, 1], proceduralSeed: seed, horizonBlend: 0.5 };
  return { preset: "city", intensity: 0.9, color: [0.8, 0.85, 1], proceduralSeed: seed, horizonBlend: 0.65 };
}

export function environmentToRt4dEntry(environment: EnvironmentParams | undefined): Rt4dEnvironmentEntry {
  const env = environment ?? createEnvironmentPreset("studio", 0);
  return {
    preset: env.preset,
    intensity: Math.max(0, Number.isFinite(env.intensity) ? env.intensity : 1),
    color: env.color,
    rotation: Number.isFinite(env.rotation) ? env.rotation! : 0,
    ...(env.hdriTextureId ? { hdriTextureId: env.hdriTextureId } : {}),
    proceduralSeed: Number.isInteger(env.proceduralSeed) ? env.proceduralSeed! : 0,
    horizonBlend: Math.min(1, Math.max(0, Number.isFinite(env.horizonBlend) ? env.horizonBlend! : 0.5)),
  };
}

export function hashEnvironment(environment: EnvironmentParams | undefined): string {
  return hashCanonical(environmentToRt4dEntry(environment));
}
