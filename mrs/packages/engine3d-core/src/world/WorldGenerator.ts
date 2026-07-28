import { createEnvironmentPreset } from "./EnvironmentSystem.js";
import { createLightingPreset } from "./LightingSystem.js";
import {
  chromeJointMaterial,
  coreGlowMaterial,
  glassTubeMaterial,
} from "../materials/LatticeMaterials.js";
import { create4dStarWorld } from "./StarWorld.js";
import {
  createUniversalMaterial,
  createWorldObject,
  type Engine3DWorldDocument,
  type EnvironmentPreset,
  type WorldGeneratorParams,
  type WorldObject,
} from "./WorldObject.js";
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
  if (type === "void" || type === "star") return "sphere";
  return "plane";
}

/** Neural-lattice mandala: glass tubes + chrome joints + emissive core. */
function createMandalaLatticeWorld(
  generator: WorldGeneratorParams,
): Engine3DWorldDocument {
  const count = Math.max(3, Math.min(16, Math.round(generator.params["count"] ?? 6)));
  const radius = generator.params["spread"] ?? 2.2;
  const tubeR = 0.08;
  const jointR = 0.14;
  const coreR = 0.35;
  const materials = [glassTubeMaterial, chromeJointMaterial, coreGlowMaterial];
  const objects: WorldObject[] = [
    createWorldObject({
      id: "mandala-core",
      kind: "primitive",
      geometry: { primitiveType: "sphere" },
      material: { materialId: "core_glow" },
      transform: {
        position: [0, 0.5, 0],
        rotation: [0, 0, 0],
        scale: [coreR * 2, coreR * 2, coreR * 2],
      },
    }),
  ];

  const joints: Array<readonly [number, number, number]> = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    const y = 0.5;
    joints.push([x, y, z]);
    objects.push(
      createWorldObject({
        id: `mandala-joint-${i}`,
        kind: "primitive",
        geometry: { primitiveType: "sphere" },
        material: { materialId: "chrome_joint" },
        transform: {
          position: [x, y, z],
          rotation: [0, 0, 0],
          scale: [jointR * 2, jointR * 2, jointR * 2],
        },
      }),
    );
  }

  for (let i = 0; i < count; i++) {
    const a = joints[i]!;
    const b = joints[(i + 1) % count]!;
    const mx = (a[0] + b[0]) * 0.5;
    const my = (a[1] + b[1]) * 0.5;
    const mz = (a[2] + b[2]) * 0.5;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    // Capsule transform: Y-up length along segment (WorldDocumentRt4d.capsuleEndpoints).
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz) || 1e-8);
    objects.push(
      createWorldObject({
        id: `mandala-tube-${i}`,
        kind: "primitive",
        geometry: { primitiveType: "capsule" },
        material: { materialId: "glass_tube" },
        transform: {
          position: [mx, my, mz],
          rotation: [pitch, yaw, 0],
          scale: [tubeR * 2, len, tubeR * 2],
        },
      }),
    );
  }

  const camera = createWorldObject({
    id: "camera-main",
    kind: "camera",
    geometry: null,
    material: null,
    camera: { type: "perspective", target: [0, 0.5, 0], exposure: 1 },
    transform: { position: [0, 3, 8], rotation: [0, 0, 0], scale: [1, 1, 1] },
  });

  return {
    schemaVersion: "engine3d-world/1.0",
    id: `mandala-world-${generator.seed}`,
    objects,
    materials,
    environment: createEnvironmentPreset("mandala", generator.seed),
    generator,
    assets: [{
      id: generator.id,
      kind: "world",
      version: "1.0.0",
      contentHash: `sha256:${hashCanonical(generator).slice(0, 32)}`,
      provenance: { source: "Engine3D WorldGenerator mandala-lattice" },
      tags: ["mandala", "lattice", "generated"],
    }],
    lights: createLightingPreset("mandala-glow"),
    cameras: [camera],
    activeCameraId: camera.id,
  };
}

export function createWorldGenerator(type: EnvironmentPreset, seed: number, params: Readonly<Record<string, number>> = {}): WorldGeneratorParams {
  return { id: `${type}-generator`, type, seed: seed >>> 0, params };
}

export function generateWorldFromGenerator(generator: WorldGeneratorParams): Engine3DWorldDocument {
  if (generator.type === "star") {
    const includeHalo = (generator.params["includeHalo"] ?? 1) !== 0;
    const world = create4dStarWorld({
      seed: generator.seed,
      armCount: generator.params["armCount"],
      armLength: generator.params["armLength"],
      armRadius: generator.params["armRadius"],
      coreRadius: generator.params["coreRadius"],
      includeHalo,
    });
    return {
      ...world,
      generator,
      id: `${generator.type}-world-${generator.seed}`,
    };
  }

  if (generator.type === "mandala") {
    return createMandalaLatticeWorld(generator);
  }

  const rng = mulberry32(generator.seed);
  const count = Math.max(1, Math.min(64, Math.round(generator.params["count"] ?? (generator.type === "city" ? 12 : 5))));
  const material = createUniversalMaterial({
    id: `${generator.type}-mat`,
    type: generator.type === "void" ? "sovereign-glyph" : "basic",
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
  const lights = createLightingPreset(generator.type === "void" ? "void-rim" : "studio-softbox");
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
