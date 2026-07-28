/**
 * create4dStarWorld — governed 4D star worldDocument (Draft 0.1).
 *
 * Core hypersphere + N oriented-capsule arms in deterministic 4D directions.
 * Compatible with renderEngine3dStill({ worldDocument }) and
 * worldDocumentToRt4dPrimitives / worldDocumentToRt4dStar.
 *
 * Status: **enforced** by unit tests (determinism + RT4D emit).
 */

import { createHash } from "node:crypto";
import { createEnvironmentPreset } from "./EnvironmentSystem.js";
import { createLightingPreset } from "./LightingSystem.js";
import {
  createWorldObject,
  type Engine3DWorldDocument,
  type UniversalMaterial,
  type WorldObject,
} from "./WorldObject.js";
import { createDefaultMaterialCatalog } from "../renderer/raster/RasterMaterial.js";
import { hashCanonical } from "../scene/hash.js";
import {
  MATERIAL_CATALOG_VERSION,
  STAR_CONSTRUCTION_ALGORITHM_ID,
  starMaterialCatalog,
} from "../materials/StarMaterials.js";

export interface Create4dStarWorldOptions {
  readonly seed: number;
  readonly coreRadius?: number;
  readonly armRadius?: number;
  readonly armCount?: number;
  readonly armLength?: number;
  readonly includeHalo?: boolean;
  /** Core center in xyz (w stored on RT4D emit; world transform is xyz). */
  readonly center?: readonly [number, number, number];
}

export interface StarArmDescriptor {
  readonly id: string;
  readonly start: readonly [number, number, number, number];
  readonly end: readonly [number, number, number, number];
  readonly radius: number;
  readonly materialId: string;
  readonly latticeDescriptor: {
    readonly kind: "arm_wave";
    readonly pulse: number;
    readonly glyph: string;
  };
}

export interface Rt4dStarDescriptor {
  readonly kind: "rt4d_star";
  readonly id: string;
  readonly coreCenter: readonly [number, number, number, number];
  readonly coreRadius: number;
  readonly coreMaterialId: string;
  readonly arms: readonly StarArmDescriptor[];
  readonly halo?: {
    readonly center: readonly [number, number, number, number];
    readonly radius: number;
    readonly materialId: string;
  };
  readonly provenance: {
    readonly seed: number;
    readonly algorithmId: typeof STAR_CONSTRUCTION_ALGORITHM_ID;
    readonly catalogVersion: typeof MATERIAL_CATALOG_VERSION;
    readonly hash: string;
    readonly worldDocumentId: string;
  };
}

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

function normalize4(
  v: readonly [number, number, number, number],
): [number, number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2], v[3]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len, v[3] / len];
}

function dot4(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

/**
 * Deterministic quasi-orthogonal unit directions in R⁴ with angular separation.
 */
export function generateStarArmDirections(
  seed: number,
  armCount: number,
  minDot = 0.35,
): Array<[number, number, number, number]> {
  const rng = mulberry32(seed ^ 0x53544152);
  const out: Array<[number, number, number, number]> = [];
  const maxAttempts = armCount * 64;
  let attempts = 0;
  while (out.length < armCount && attempts < maxAttempts) {
    attempts += 1;
    const cand = normalize4([
      rng() * 2 - 1,
      rng() * 2 - 1,
      rng() * 2 - 1,
      rng() * 2 - 1,
    ]);
    if (out.every((d) => Math.abs(dot4(d, cand)) <= minDot)) {
      out.push(cand);
    }
  }
  // Fallback: fixed orthogonal / signed axes if sampling fails.
  const axes: Array<[number, number, number, number]> = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
    [1, 1, 0, 0],
    [1, 0, 1, 0],
    [1, 0, 0, 1],
    [0, 1, 1, 0],
    [0, 1, 0, 1],
    [0, 0, 1, 1],
    [-1, 1, 0, 0],
    [1, -1, 1, 0],
  ].map((v) => normalize4(v as [number, number, number, number]));
  let i = 0;
  while (out.length < armCount) {
    out.push(axes[i % axes.length]!);
    i += 1;
  }
  return out;
}

function cloneMaterials(mats: readonly UniversalMaterial[]): UniversalMaterial[] {
  return mats.map((m) => ({
    ...m,
    baseColor: [...m.baseColor] as [number, number, number],
    emissive: [...m.emissive] as [number, number, number],
    textureRefs: [...m.textureRefs],
  }));
}

function orientationFromDirection(
  dir: readonly [number, number, number],
): [number, number, number] {
  // Map local +Y capsule axis toward (dx,dy,dz) via Euler approx (yaw, pitch).
  const [dx, dy, dz] = dir;
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz) || 1e-8);
  return [pitch, yaw, 0];
}

/**
 * Build Engine3DWorldDocument for a 4D star (xyz projection for soft-raster;
 * full 4D endpoints retained in Rt4dStarDescriptor / RT4D emit).
 */
export function create4dStarWorld(
  options: Create4dStarWorldOptions,
): Engine3DWorldDocument {
  const seed = options.seed >>> 0;
  const coreRadius = Math.max(0.05, options.coreRadius ?? 0.35);
  const armRadius = Math.max(0.02, options.armRadius ?? 0.08);
  const armCount = Math.max(3, Math.min(16, Math.round(options.armCount ?? 8)));
  const armLength = Math.max(0.2, options.armLength ?? 1.8);
  const includeHalo = options.includeHalo !== false;
  const [cx, cy, cz] = options.center ?? [0, 0.6, 0];
  const center4: [number, number, number, number] = [cx, cy, cz, 0];

  const directions = generateStarArmDirections(seed, armCount);
  const materialsById = new Map<string, UniversalMaterial>();
  for (const m of createDefaultMaterialCatalog()) materialsById.set(m.id, m);
  for (const m of starMaterialCatalog()) materialsById.set(m.id, m);
  const materials = cloneMaterials([...materialsById.values()]);

  const objects: WorldObject[] = [
    createWorldObject({
      id: "star-core",
      kind: "primitive",
      geometry: { primitiveType: "sphere" },
      material: { materialId: "um_star_core" },
      transform: {
        position: [cx, cy, cz],
        rotation: [0, 0, 0],
        scale: [coreRadius * 2, coreRadius * 2, coreRadius * 2],
      },
    }),
  ];

  const arms: StarArmDescriptor[] = [];
  for (let i = 0; i < armCount; i++) {
    const d = directions[i]!;
    const end4: [number, number, number, number] = [
      center4[0] + d[0] * armLength,
      center4[1] + d[1] * armLength,
      center4[2] + d[2] * armLength,
      center4[3] + d[3] * armLength,
    ];
    // Soft-raster / Engine3D transform uses xyz midpoint + orientation.
    const mid: [number, number, number] = [
      (center4[0] + end4[0]) * 0.5,
      (center4[1] + end4[1]) * 0.5,
      (center4[2] + end4[2]) * 0.5,
    ];
    const xyzDir: [number, number, number] = [
      end4[0] - center4[0],
      end4[1] - center4[1],
      end4[2] - center4[2],
    ];
    const xyzLen = Math.hypot(xyzDir[0], xyzDir[1], xyzDir[2]) || armLength;
    objects.push(
      createWorldObject({
        id: `star-arm-${i}`,
        kind: "primitive",
        geometry: { primitiveType: "capsule" },
        material: { materialId: "um_star_arm" },
        transform: {
          position: mid,
          rotation: orientationFromDirection(xyzDir),
          scale: [armRadius * 2, xyzLen * 0.5, armRadius * 2],
        },
      }),
    );
    arms.push({
      id: `star-arm-${i}`,
      start: [...center4],
      end: end4,
      radius: armRadius,
      materialId: "um_star_arm",
      latticeDescriptor: {
        kind: "arm_wave",
        pulse: 0.35 + (i % 5) * 0.08,
        glyph: "sovereign-ray",
      },
    });
  }

  if (includeHalo) {
    const haloR = coreRadius + armLength * 0.55;
    objects.push(
      createWorldObject({
        id: "star-halo",
        kind: "primitive",
        geometry: { primitiveType: "torus" },
        material: { materialId: "um_star_halo" },
        transform: {
          position: [cx, cy, cz],
          rotation: [Math.PI / 2, 0, 0],
          scale: [haloR, haloR, armRadius * 1.2],
        },
      }),
    );
  }

  const camera = createWorldObject({
    id: "camera-main",
    kind: "camera",
    geometry: null,
    material: null,
    camera: { type: "perspective", target: [cx, cy, cz], exposure: 1 },
    transform: {
      position: [cx, cy + 2.4, cz + 6.5],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  });

  const generator = {
    id: "star-generator",
    type: "star" as const,
    seed,
    params: {
      coreRadius,
      armRadius,
      armCount,
      armLength,
      includeHalo: includeHalo ? 1 : 0,
    },
  };

  const worldId = `star-world-${seed}`;
  const primitiveHash = createHash("sha256")
    .update(
      JSON.stringify({
        center4,
        coreRadius,
        armRadius,
        arms: arms.map((a) => ({ id: a.id, end: a.end, radius: a.radius })),
        includeHalo,
        catalogVersion: MATERIAL_CATALOG_VERSION,
        algorithmId: STAR_CONSTRUCTION_ALGORITHM_ID,
      }),
    )
    .digest("hex")
    .slice(0, 32);

  const lights = createLightingPreset("mandala-glow");
  return {
    schemaVersion: "engine3d-world/1.0",
    id: worldId,
    objects,
    materials,
    environment: createEnvironmentPreset("star", seed),
    generator,
    assets: [
      {
        id: generator.id,
        kind: "world",
        version: MATERIAL_CATALOG_VERSION,
        contentHash: `sha256:${hashCanonical(generator).slice(0, 32)}`,
        provenance: {
          source: "Engine3D create4dStarWorld",
          algorithmId: STAR_CONSTRUCTION_ALGORITHM_ID,
          integrityHash: `sha256:${primitiveHash}`,
          catalogVersion: MATERIAL_CATALOG_VERSION,
        },
        tags: ["rt4d_star", "4d-star", "star", "generated"],
      },
    ],
    lights,
    cameras: [camera],
    activeCameraId: camera.id,
  };
}

/** Extract composite Rt4dStar from a star world (or rebuild from generator params). */
export function worldDocumentToRt4dStar(
  world: Engine3DWorldDocument,
): Rt4dStarDescriptor | null {
  const g = world.generator;
  if (!g || g.type !== "star") {
    // Heuristic: star-core object present
    if (!world.objects.some((o) => o.id === "star-core")) return null;
  }
  const seed = g?.seed ?? 0;
  const coreRadius = g?.params["coreRadius"] ?? 0.35;
  const armRadius = g?.params["armRadius"] ?? 0.08;
  const armCount = Math.round(g?.params["armCount"] ?? 8);
  const armLength = g?.params["armLength"] ?? 1.8;
  const includeHalo = (g?.params["includeHalo"] ?? 1) !== 0;
  const core = world.objects.find((o) => o.id === "star-core");
  const [cx, cy, cz] = core?.transform.position ?? [0, 0.6, 0];
  const center4: [number, number, number, number] = [cx, cy, cz, 0];
  const directions = generateStarArmDirections(seed, armCount);
  const arms: StarArmDescriptor[] = directions.map((d, i) => {
    const end4: [number, number, number, number] = [
      center4[0] + d[0] * armLength,
      center4[1] + d[1] * armLength,
      center4[2] + d[2] * armLength,
      center4[3] + d[3] * armLength,
    ];
    return {
      id: `star-arm-${i}`,
      start: [...center4],
      end: end4,
      radius: armRadius,
      materialId: "um_star_arm",
      latticeDescriptor: {
        kind: "arm_wave" as const,
        pulse: 0.35 + (i % 5) * 0.08,
        glyph: "sovereign-ray",
      },
    };
  });
  const hash = createHash("sha256")
    .update(JSON.stringify({ worldId: world.id, seed, arms: arms.map((a) => a.end) }))
    .digest("hex")
    .slice(0, 32);
  return {
    kind: "rt4d_star",
    id: `rt4d-star:${world.id}`,
    coreCenter: center4,
    coreRadius,
    coreMaterialId: "um_star_core",
    arms,
    ...(includeHalo
      ? {
          halo: {
            center: center4,
            radius: coreRadius + armLength * 0.55,
            materialId: "um_star_halo",
          },
        }
      : {}),
    provenance: {
      seed,
      algorithmId: STAR_CONSTRUCTION_ALGORITHM_ID,
      catalogVersion: MATERIAL_CATALOG_VERSION,
      hash: `sha256:${hash}`,
      worldDocumentId: world.id,
    },
  };
}

/** Decompose Rt4dStar into flat WorldRt4d-compatible primitive records. */
export function decomposeRt4dStar(star: Rt4dStarDescriptor): Array<{
  kind: "oriented-capsule" | "hypersphere";
  id: string;
  a?: readonly [number, number, number, number];
  b?: readonly [number, number, number, number];
  center?: readonly [number, number, number, number];
  radius: number;
  materialId: string;
  materialRole: string;
  originNode: string;
  generatorSeed: number;
  integrityHash: string;
}> {
  const out: ReturnType<typeof decomposeRt4dStar> = [
    {
      kind: "hypersphere",
      id: `${star.id}:core`,
      center: star.coreCenter,
      radius: star.coreRadius,
      materialId: star.coreMaterialId,
      materialRole: "emissive_capsule",
      originNode: "star-core",
      generatorSeed: star.provenance.seed,
      integrityHash: star.provenance.hash,
    },
  ];
  for (const arm of star.arms) {
    out.push({
      kind: "oriented-capsule",
      id: `${star.id}:${arm.id}`,
      a: arm.start,
      b: arm.end,
      radius: arm.radius,
      materialId: arm.materialId,
      materialRole: "glass_capsule",
      originNode: arm.id,
      generatorSeed: star.provenance.seed,
      integrityHash: star.provenance.hash,
    });
  }
  if (star.halo) {
    out.push({
      kind: "hypersphere",
      id: `${star.id}:halo`,
      center: star.halo.center,
      radius: star.halo.radius,
      materialId: star.halo.materialId,
      materialRole: "emissive_capsule",
      originNode: "star-halo",
      generatorSeed: star.provenance.seed,
      integrityHash: star.provenance.hash,
    });
  }
  return out;
}
