import { createEnvironmentPreset } from "./EnvironmentSystem.js";
import { createLightingPreset } from "./LightingSystem.js";
import { createUniversalMaterial, createWorldObject, type Engine3DWorldDocument, type EnvironmentPreset, type WorldGeneratorParams } from "./WorldObject.js";
import { hashCanonical } from "../scene/hash.js";

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function primitiveFor(type: EnvironmentPreset): "sphere" | "box" | "torus" | "plane" {
  if (type === "city") return "box";
  if (type === "mandala") return "torus";
  if (type === "void") return "sphere";
  return "plane";
}

export function createWorldGenerator(type: EnvironmentPreset, seed: number, params: Readonly<Record<string, number>> = {}): WorldGeneratorParams {
  return { id: `${type}-generator`, type, seed: seed >>> 0, params };
}

export function generateWorldFromGenerator(generator: WorldGeneratorParams): Engine3DWorldDocument {
  const rng = mulberry32(generator.seed);
  const count = Math.max(1, Math.min(64, Math.round(generator.params["count"] ?? (generator.type === "city" ? 12 : 5))));
  const material = createUniversalMaterial({
    id: `${generator.type}-mat`,
    type: generator.type === "mandala" ? "mandala-core" : generator.type === "void" ? "sovereign-glyph" : "basic",
    baseColor: generator.type === "cosmic" ? [0.2, 0.25, 0.9] : [0.75, 0.75, 0.8],
    roughness: 0.6,
  });
  const objects = Array.from({ length: count }, (_, index) => {
    const spread = generator.params["spread"] ?? 8;
    const x = (rng() - 0.5) * spread;
    const z = (rng() - 0.5) * spread;
    const y = generator.type === "city" ? (rng() * 2) : 0;
    const scaleY = generator.type === "city" ? 0.5 + rng() * 4 : 0.5 + rng();
    return createWorldObject({
      id: `${generator.type}-obj-${index}`,
      kind: "primitive",
      geometry: { primitiveType: primitiveFor(generator.type) },
      material: { materialId: material.id },
      transform: { position: [x, y, z], rotation: [0, 0, 0], scale: [0.5 + rng(), scaleY, 0.5 + rng()] },
    });
  });
  const camera = createWorldObject({
    id: "camera-main",
    kind: "camera",
    geometry: null,
    material: null,
    camera: { type: generator.type === "city" ? "wide" : "perspective", target: [0, 0, 0], exposure: 1 },
    transform: { position: [0, 4, 10], rotation: [0, 0, 0], scale: [1, 1, 1] },
  });
  const lights = createLightingPreset(generator.type === "void" ? "void-rim" : generator.type === "mandala" ? "mandala-glow" : "studio-softbox");
  return {
    schemaVersion: "engine3d-world/1.0",
    id: `${generator.type}-world-${generator.seed}`,
    objects,
    materials: [material],
    environment: createEnvironmentPreset(generator.type, generator.seed),
    generator,
    assets: [{
      id: generator.id,
      kind: "world",
      version: "1.0.0",
      contentHash: `sha256:${hashCanonical(generator).slice(0, 32)}`,
      provenance: { source: "Engine3D WorldGenerator" },
      tags: [generator.type, "generated"],
    }],
    lights,
    cameras: [camera],
    activeCameraId: camera.id,
  };
}

export function hashWorldGenerator(generator: WorldGeneratorParams | undefined): string | undefined {
  return generator ? hashCanonical(generator) : undefined;
}
