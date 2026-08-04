// @mrs/rt4d-engine renderer — THE MATH BOUNDARY — status: live
// Wraps @mrs/renderer-core CPU path tracer; all randomness derives from the seeded
// mulberry32 rng (P4 replayable reality). Mirrors scripts/render-still.mjs.
import {
  Camera4D,
  Scene4D,
  Hypersphere,
  Hyperplane,
  PathTracer4D,
  vec4,
  EUCLIDEAN_METRIC_4D,
  DEFAULT_METRIC_ID,
  DEFAULT_METRIC_VERSION,
  renderIdentityHash,
  deriveGeometryEvidenceId,
} from "@mrs/renderer-core/rt4d";
import { getSurface, listSurfaces, sampleSurface } from "@mrs/renderer-core/surfaces";
import { composeRotations } from "@mrs/renderer-core/math";
// NOTE: exports map has NO "./rt4d/proton" entry and directory targets throw
// ERR_UNSUPPORTED_DIR_IMPORT; the "./render/*" wildcard + explicit index.js file
// target is the only specifier that resolves (probe-verified on Node v24.18.0).
import { encodePngRgba } from "@mrs/renderer-core/render/rt4d/proton/index.js";
import { createHash } from "node:crypto";
import { versions } from "node:process";
import type { SceneSpec } from "./store.js";

export type RenderParams = {
  seed?: number;
  maxDepth?: number;
  samplesPerPixel?: number;
  width?: number;
  height?: number;
  timeSeconds?: number;
};

export type RuntimeFingerprint = {
  node: string;
  zlib: string;
  platform: string;
  arch: string;
};

export type RenderResult = {
  png: Buffer;
  sha256: string;
  pixelHash: string;
  width: number;
  height: number;
  sampleCount: number;
  renderId: string;
  renderIdentityHash: string;
  runtimeFingerprint: RuntimeFingerprint;
};

export type RenderIdentity = {
  surfaceId: string;
  geometryEvidenceId: string;
  geometryHash: string;
  metricId: string;
  metricVersion: string;
  timeSeconds: number;
  projectionId: string;
};

export type GeometryOptions = {
  resolution?: number;
  timeSeconds?: number;
};

export type GeometryResult = {
  vertices: Array<{ x: number; y: number; z: number; w: number }>;
  indices: Array<[number, number, number]>;
  edges: Array<[number, number]>;
};

/** Deterministic seeded PRNG (mulberry32, by Tommy Ettinger). All render randomness flows from this rng (P4). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampInt(value: number | undefined, lo: number, hi: number, fallback: number): number {
  const n = Math.round(Number(value ?? fallback));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Resolve the deterministic ordered param object shared by deriveRenderKey so the
 * same seed + params always yields the same renderKey (cache lookup must be stable).
 */
export function resolveOrderedParams(params: RenderParams): Record<string, unknown> {
  return {
    seed: Number(params.seed),
    maxDepth: clampInt(params.maxDepth, 1, 12, 5),
    samplesPerPixel: clampInt(params.samplesPerPixel, 1, 128, 16),
    width: clampInt(params.width, 16, 1024, 128),
    height: clampInt(params.height, 16, 1024, 128),
    timeSeconds: params.timeSeconds == null ? 0 : Number(params.timeSeconds),
  };
}

const PLANE_SET = new Set(["xy", "xz", "xw", "yz", "yw", "zw"]);
const DEFAULT_FOV = { fovX: 52, fovY: 52, fovZ: 8, fovW: 8 };

/** Surfaces supported by renderer-core (capability gate — AC-R6). */
const SUPPORTED_SURFACES = new Set<string>(
  listSurfaces().map((s: unknown) => String((s as { id?: unknown }).id ?? "")),
);

/** Runtime fingerprint: distinguishes certified-runtime byte-identity from cross-environment pixel equivalence. */
export function runtimeFingerprint(): RuntimeFingerprint {
  const nodeZlib = typeof (process as { versions?: { zlib?: string } }).versions?.zlib === "string"
    ? (process.versions.zlib as string)
    : "builtin";
  return {
    node: versions.node,
    zlib: nodeZlib,
    platform: versions.platform ?? process.platform,
    arch: versions.arch ?? process.arch,
  };
}

/**
 * Canonical hash of the projection transform state: projection + camera +
 * rotations + resolution + seed + dims. Camera change (AC-R3) changes this.
 */
export function computeProjectionHash(
  spec: SceneSpec,
  params: RenderParams,
  orderedParams: Record<string, unknown>,
): string {
  const canonical = {
    surface: spec.surface,
    projection: {
      type: spec.projection?.type,
      distance4d: Number(spec.projection?.distance4d),
      distance3d: Number(spec.projection?.distance3d),
    },
    camera: {
      fovX: Number(spec.camera?.fovX),
      fovY: Number(spec.camera?.fovY),
      fovZ: Number(spec.camera?.fovZ),
      fovW: Number(spec.camera?.fovW),
    },
    rotations: (spec.rotations ?? []).map((r) => ({
      plane: r.plane,
      speed: Number(r.speed),
    })),
    resolution: spec.resolution,
    seed: orderedParams.seed,
    width: orderedParams.width,
    height: orderedParams.height,
    maxDepth: orderedParams.maxDepth,
    samplesPerPixel: orderedParams.samplesPerPixel,
    timeSeconds: orderedParams.timeSeconds,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** Content-addressed render id (deterministic replay gate). */
export function computeRenderId(
  sceneSpecHash: string,
  seed: number,
  projectionHash: string,
): string {
  const digest = createHash("sha256")
    .update(`${sceneSpecHash}:${seed >>> 0}:${projectionHash}`)
    .digest("hex");
  return `rt4d-render-${digest.slice(0, 16)}`;
}

/** Validate the scene is within the engine's capability surface (AC-R6 gate). */
export function validateSceneSpec(spec: SceneSpec): void {
  if (typeof spec.surface !== "string") throw new Error("SceneSpec.surface must be a string");
  if (!SUPPORTED_SURFACES.has(spec.surface)) {
    throw new Error(
      `CAPABILITY_UNSUPPORTED: surface "${spec.surface}" is not supported. Available: ${Array.from(SUPPORTED_SURFACES).join(", ")}`,
    );
  }
  if (!Number.isFinite(spec.resolution)) throw new Error("SceneSpec.resolution must be a number");
  if (!Array.isArray(spec.rotations)) throw new Error("SceneSpec.rotations must be an array");
  for (const r of spec.rotations) {
    if (!PLANE_SET.has(r.plane)) {
      throw new Error(`SceneSpec.rotations: unknown plane "${r.plane}"`);
    }
    if (typeof r.speed !== "number") throw new Error("SceneSpec.rotations[].speed must be a number");
  }
  if (!spec.projection || typeof spec.projection !== "object") {
    throw new Error("SceneSpec.projection must be an object");
  }
  if (!spec.camera || typeof spec.camera !== "object") {
    throw new Error("SceneSpec.camera must be an object");
  }
}

/** Bake the rotation (at a fixed time) into vertices and return nested-array verts. */
function bakeVertices(
  vertices: Array<{ x: number; y: number; z: number; w: number }>,
  rotations: Array<{ plane: string; speed: number }>,
  timeSeconds: number,
): Array<[number, number, number, number]> {
  if (rotations.length === 0) {
    return vertices.map((v) => [v.x, v.y, v.z, v.w] as [number, number, number, number]);
  }
  const rot = composeRotations(
    rotations.map((r) => ({ plane: r.plane as "xy", angle: r.speed * timeSeconds })),
  );
  return vertices.map((v) => {
    const p = rot({ x: v.x, y: v.y, z: v.z, w: v.w });
    return [p.x, p.y, p.z, p.w] as [number, number, number, number];
  });
}

/** Baked (rotation-applied) vertex buffer hash — the geometry actually rendered. */
function bakeGeometryHash(verts: Array<[number, number, number, number]>): string {
  const data = verts.map((v) => v.join(",")).join("|");
  return createHash("sha256").update(data).digest("hex");
}

/** Canonical projection identity consumed by the render cache key. */
function projectionIdOf(spec: SceneSpec): string {
  return `${spec.projection?.type ?? "perspective"}:${Number(spec.projection?.distance4d ?? 0)}:${Number(spec.projection?.distance3d ?? 0)}`;
}

function buildScene(spec: SceneSpec, timeSeconds: number) {
  validateSceneSpec(spec);
  const surface = getSurface(spec.surface);
  const mesh = sampleSurface(surface, spec.resolution);
  const verts = bakeVertices(mesh.vertices, spec.rotations ?? [], timeSeconds);
  const geometryHash = bakeGeometryHash(verts);
  const surfaceHash = mesh.surfaceHash ?? mesh.geometryHash ?? "";
  const projectionId = projectionIdOf(spec);
  const geometryEvidenceId = deriveGeometryEvidenceId({
    surfaceId: spec.surface,
    resolution: spec.resolution,
    timeSeconds,
    surfaceHash,
    projectionId,
  });
  const identity: RenderIdentity = {
    surfaceId: spec.surface,
    geometryEvidenceId,
    geometryHash,
    metricId: DEFAULT_METRIC_ID,
    metricVersion: DEFAULT_METRIC_VERSION,
    timeSeconds,
    projectionId,
  };

  const scene = new Scene4D({ metric: EUCLIDEAN_METRIC_4D });
  scene.materials.createMaterial("surf", "lambertian", { albedo: vec4(0.72, 0.85, 0.98, 1) });
  scene.materials.createMaterial("ground", "lambertian", { albedo: vec4(0.16, 0.17, 0.22, 1) });
  scene.materials.createMaterial("keylight", "light", {
    emission: vec4(90, 84, 76, 0),
    albedo: vec4(1, 1, 1, 1),
  });
  scene.materials.createMaterial("filllight", "light", {
    emission: vec4(32, 36, 42, 0),
    albedo: vec4(1, 1, 1, 1),
  });

  scene.addTriangleMesh(
    {
      kind: "triangle-mesh",
      vertices: verts,
      indices: mesh.faces.flat(),
      surfaceId: spec.surface,
      surfaceHash,
      geometryHash,
      geometryEvidenceId,
    },
    "surf",
  );
  scene.addPrimitive(new Hyperplane(vec4(0, 1, 0, 0), -1.4), "ground");
  scene.addLight(new Hypersphere(vec4(4.2, 7.2, -3.8, 0), 0.7), "keylight");
  scene.addLight(new Hypersphere(vec4(-5.0, 5.8, 4.2, 0), 0.55), "filllight");
  scene.setRenderIdentity(identity);
  scene.build();

  // Fail-fast boundary (AC-R10 / RendererSurfaceDispatch): the scene's bound
  // geometry evidence must match the render intent before any ray is traced.
  scene.verifyRenderIdentity({
    surfaceId: spec.surface,
    geometryEvidenceId,
    metricId: DEFAULT_METRIC_ID,
  });

  return { scene, mesh, verts, identity };
}

function toByte(c: number, exposure: number): number {
  let v = c * exposure;
  v = v / (1 + v);
  v = Math.pow(Math.max(0, v), 1 / 2.2);
  return Math.min(255, Math.max(0, Math.round(v * 255)));
}

const EXPOSURE = 2.4;

export async function renderScene(
  spec: SceneSpec,
  params: RenderParams,
  sceneSpecHash: string,
): Promise<RenderResult> {
  if (params.seed === undefined) {
    throw new Error("seed is required for deterministic replay");
  }
  const seed = params.seed >>> 0;
  const maxDepth = clampInt(params.maxDepth, 1, 12, 5);
  const samples = clampInt(params.samplesPerPixel, 1, 128, 16);
  const width = clampInt(params.width, 16, 1024, 128);
  const height = clampInt(params.height, 16, 1024, 128);
  const timeSeconds = params.timeSeconds ?? 0;

  const orderedParams = {
    seed: Number(params.seed),
    maxDepth,
    samplesPerPixel: samples,
    width,
    height,
    timeSeconds,
  };
  const projectionHash = computeProjectionHash(spec, params, orderedParams);
  const renderId = computeRenderId(sceneSpecHash, seed, projectionHash);

  const { scene, identity } = buildScene(spec, timeSeconds);
  const cam = spec.camera;
  const camera = new Camera4D({
    x: 0,
    y: 0,
    z: -4.4,
    w: 0,
    lx: 0,
    ly: 0,
    lz: 0,
    lw: 0,
    fovX: cam?.fovX ?? DEFAULT_FOV.fovX,
    fovY: cam?.fovY ?? DEFAULT_FOV.fovY,
    fovZ: cam?.fovZ ?? DEFAULT_FOV.fovZ,
    fovW: cam?.fovW ?? DEFAULT_FOV.fovW,
    width,
    height,
    lensRadius: 0,
  });

  // Constitutional tracing context — the render identity drives evidence
  // binding at every boundary (surface → mesh → BVH → intersector → trace).
  const constitutionalContext = {
    geometryHash: identity.geometryHash,
    sceneHash: sceneSpecHash,
    surfaceId: identity.surfaceId,
    geometryEvidenceId: identity.geometryEvidenceId,
    metricId: identity.metricId,
    rngSeed: params.seed,
    prevSceneHash: "", // would be set from previous render if chaining
  };

  const rng = mulberry32(seed);
  const tracer = new PathTracer4D({ maxDepth, samplesPerPixel: samples, rng });

  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let s = 0; s < samples; s++) {
        const u1 = rng();
        const u2 = rng();
        // Fix the hyperplane sample at the central 4D slice (render-still audited
        // fix) — randomizing u3/u4 sprays finite hyperspheres into speckle.
        const ray = camera.generateRay(x, y, u1, u2, 0.5, 0.5);
        const L = tracer.trace(ray, scene, 0, constitutionalContext);
        r += L.x;
        g += L.y;
        b += L.z;
      }
      const inv = 1 / samples;
      const idx = (y * width + x) * 4;
      rgba[idx] = toByte(r * inv, EXPOSURE);
      rgba[idx + 1] = toByte(g * inv, EXPOSURE);
      rgba[idx + 2] = toByte(b * inv, EXPOSURE);
      rgba[idx + 3] = 255;
    }
  }

  const png = encodePngRgba(width, height, new Uint8ClampedArray(rgba));
  const sha256 = createHash("sha256").update(png).digest("hex");
  const pixelHash = createHash("sha256").update(rgba).digest("hex");
  return {
    png,
    sha256,
    pixelHash,
    width,
    height,
    sampleCount: samples,
    renderId,
    renderIdentityHash: renderIdentityHash(identity),
    runtimeFingerprint: runtimeFingerprint(),
  };
}

export function computeGeometry(spec: SceneSpec, opts: GeometryOptions): GeometryResult {
  const surface = getSurface(spec.surface);
  const resolution = opts.resolution ?? spec.resolution;
  const mesh = sampleSurface(surface, resolution);
  const verts = bakeVertices(mesh.vertices, spec.rotations ?? [], opts.timeSeconds ?? 0);
  return {
    vertices: verts.map((v) => ({ x: v[0], y: v[1], z: v[2], w: v[3] })),
    indices: mesh.faces,
    edges: mesh.edges,
  };
}
