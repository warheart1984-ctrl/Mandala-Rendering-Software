/**
 * Engine3DSceneBridge — read-only capture of World3D (+ optional VisualMod /
 * MandalaLattice) into a typed bridge scene document for RT4D still adapters.
 *
 * Adapts EXISTING types: World3D, Body, WorldMesh, VisualMod, MandalaLattice.
 * Does NOT invent Engine3DWorld / Engine3DBody.getMeshes() / Rt4dRenderer.
 *
 * Status: **partial**
 *   - Body → hypersphere (radius from mass): enforced by tests
 *   - Mesh vertices → capped point hyperspheres: enforced by tests
 *   - Triangle mesh path-trace: implemented (when indices available)
 *   - Deterministic hashes: enforced by tests
 */

import type { World3D } from "../world/World3D.js";
import type { Body } from "../world/Body.js";
import type { VisualMod } from "../substrate/VisualMod.js";
import type { MandalaLattice } from "../mandala/MandalaMapping.js";
import { hashCanonical } from "./hash.js";
import {
  ENGINE3D_BRIDGE_SCENE_SCHEMA,
  type BridgeCameraDescriptor,
  type BridgeLatticeDescriptor,
  type BridgePrimitive,
  type Engine3DBridgeScene,
  type SceneBridgeCaptureOptions,
  type SceneBridgeCaptureResult,
  type SceneBridgeEvidence,
  type Vec4Tuple,
} from "./types.js";

const DEFAULT_MAX_MESH_SAMPLES = 64;
const DEFAULT_BASE_BODY_RADIUS = 0.35;
const DEFAULT_MESH_SAMPLE_RADIUS = 0.08;
const DEFAULT_MAX_MANDALA_NODES = 32;
const DEFAULT_MAX_MESH_TRIANGLES = 128;

export const DEFAULT_BRIDGE_CAMERA: BridgeCameraDescriptor = Object.freeze({
  eye: [0, 1.6, 4.5, 0] as Vec4Tuple,
  lookAt: [0, 0.2, 0, 0] as Vec4Tuple,
  up: [0, 1, 0, 0] as Vec4Tuple,
  fovY: 0.9,
});

export interface SceneBridgeCaptureInput {
  world: World3D;
  frameIndex: number;
  seed: number;
  visualMod?: VisualMod | null;
  mandalaLattice?: MandalaLattice | null;
  camera?: BridgeCameraDescriptor | null;
  options?: SceneBridgeCaptureOptions;
}

function radiusFromMass(mass: number, base: number): number {
  const r = base * Math.cbrt(Math.max(mass, 1e-6));
  return Math.min(2, Math.max(0.05, r));
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function vec4(
  x: number,
  y: number,
  z: number,
  w: number,
): Vec4Tuple {
  return [round6(x), round6(y), round6(z), round6(w)];
}

/** Stable world snapshot for hashing — does not mutate world. */
export function snapshotWorldForHash(world: World3D): unknown {
  const bodies = world.bodies.map((b) => ({
    id: b.id,
    mass: round6(b.mass),
    position: {
      x: round6(b.position.x),
      y: round6(b.position.y),
      z: round6(b.position.z),
    },
    velocity: {
      x: round6(b.velocity.x),
      y: round6(b.velocity.y),
      z: round6(b.velocity.z),
    },
  }));
  const verts = world.mesh.vertices;
  const meshSample: number[] = [];
  const stride = 3;
  const count = Math.floor(verts.length / stride);
  const step = count <= 32 ? 1 : Math.ceil(count / 32);
  for (let i = 0; i < count; i += step) {
    const o = i * stride;
    meshSample.push(
      round6(verts[o] ?? 0),
      round6(verts[o + 1] ?? 0),
      round6(verts[o + 2] ?? 0),
    );
  }
  return {
    bodyCount: bodies.length,
    bodies,
    meshVertexCount: count,
    meshSample,
    meshIndexCount: world.mesh.indices.length,
  };
}

function mapBodies(
  bodies: readonly Body[],
  seed: number,
  frameIndex: number,
  baseRadius: number,
): BridgePrimitive[] {
  const out: BridgePrimitive[] = [];
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i]!;
    const wJitter = (((seed + frameIndex * 17 + i * 31) >>> 0) % 1001) / 1000 - 0.5;
    out.push({
      kind: "hypersphere",
      id: `body:${b.id}`,
      center: vec4(b.position.x, b.position.y, b.position.z, wJitter * 0.25),
      radius: round6(radiusFromMass(b.mass, baseRadius)),
      source: "body",
      sourceId: b.id,
      materialHint: "surf",
    });
  }
  return out;
}

function mapMeshVertices(
  vertices: Float32Array,
  seed: number,
  maxSamples: number,
  sampleRadius: number,
): BridgePrimitive[] {
  const out: BridgePrimitive[] = [];
  const count = Math.floor(vertices.length / 3);
  if (count === 0 || maxSamples <= 0) return out;
  const step = Math.max(1, Math.ceil(count / maxSamples));
  let emitted = 0;
  for (let i = 0; i < count && emitted < maxSamples; i += step) {
    const o = i * 3;
    const x = vertices[o] ?? 0;
    const y = vertices[o + 1] ?? 0;
    const z = vertices[o + 2] ?? 0;
    const w = ((((seed ^ (i * 0x9e3779b9)) >>> 0) % 1001) / 1000 - 0.5) * 0.15;
    out.push({
      kind: "point_sample",
      id: `mesh:v${i}`,
      center: vec4(x, y, z, w),
      radius: round6(sampleRadius),
      source: "mesh_vertex",
      sourceId: `v${i}`,
      materialHint: "shadow",
    });
    emitted++;
  }
  return out;
}

function mapMeshTriangles(
  vertices: Float32Array,
  indices: Uint16Array | Uint32Array,
  seed: number,
  maxTriangles: number,
): BridgePrimitive[] {
  const out: BridgePrimitive[] = [];
  const vertexCount = Math.floor(vertices.length / 3);
  const indexCount = indices.length;
  
  if (vertexCount === 0 || indexCount === 0 || maxTriangles <= 0) return out;
  if (indexCount % 3 !== 0) return out; // Invalid triangle data
  
  const triangleCount = indexCount / 3;
  const step = Math.max(1, Math.ceil(triangleCount / maxTriangles));
  
  let emitted = 0;
  for (let i = 0; i < triangleCount && emitted < maxTriangles; i += step) {
    const i0 = indices[i * 3] ?? 0;
    const i1 = indices[i * 3 + 1] ?? 0;
    const i2 = indices[i * 3 + 2] ?? 0;
    
    if (i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount) continue;
    
    const v0x = vertices[i0 * 3] ?? 0;
    const v0y = vertices[i0 * 3 + 1] ?? 0;
    const v0z = vertices[i0 * 3 + 2] ?? 0;
    const v1x = vertices[i1 * 3] ?? 0;
    const v1y = vertices[i1 * 3 + 1] ?? 0;
    const v1z = vertices[i1 * 3 + 2] ?? 0;
    const v2x = vertices[i2 * 3] ?? 0;
    const v2y = vertices[i2 * 3 + 1] ?? 0;
    const v2z = vertices[i2 * 3 + 2] ?? 0;
    
    // Calculate triangle center
    const cx = (v0x + v1x + v2x) / 3;
    const cy = (v0y + v1y + v2y) / 3;
    const cz = (v0z + v1z + v2z) / 3;
    const w = ((((seed ^ (i * 0x9e3779b9)) >>> 0) % 1001) / 1000 - 0.5) * 0.1;
    
    // Calculate bounding radius
    const r0 = Math.sqrt((v0x - cx) ** 2 + (v0y - cy) ** 2 + (v0z - cz) ** 2);
    const r1 = Math.sqrt((v1x - cx) ** 2 + (v1y - cy) ** 2 + (v1z - cz) ** 2);
    const r2 = Math.sqrt((v2x - cx) ** 2 + (v2y - cy) ** 2 + (v2z - cz) ** 2);
    const radius = round6(Math.max(r0, r1, r2) * 1.1); // 10% padding
    
    const triVertices = new Float32Array([v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z]);
    const triIndices = new Uint32Array([0, 1, 2]);
    
    out.push({
      kind: "triangle",
      id: `mesh:t${i}`,
      center: vec4(cx, cy, cz, w),
      radius,
      source: "mesh_triangle",
      sourceId: `t${i}`,
      materialHint: "surf",
      triangle: {
        vertices: triVertices,
        indices: triIndices,
      },
    });
    emitted++;
  }
  return out;
}

function mapMandalaNodes(
  lattice: MandalaLattice,
  maxNodes: number,
): BridgePrimitive[] {
  const out: BridgePrimitive[] = [];
  const n = Math.min(lattice.nodes.length, maxNodes);
  for (let i = 0; i < n; i++) {
    const node = lattice.nodes[i]!;
    out.push({
      kind: "hypersphere",
      id: `lattice:${node.id}`,
      center: vec4(node.position[0], node.position[1], 0, node.activation * 0.1),
      radius: round6(0.12 + Math.min(0.4, Math.abs(node.activation) * 0.05)),
      source: "lattice_node",
      sourceId: node.id,
      materialHint: "radiant-core",
    });
  }
  return out;
}

function buildLatticeDescriptor(
  visualMod: VisualMod | null | undefined,
  mandala: MandalaLattice | null | undefined,
): BridgeLatticeDescriptor {
  const shaderParams: Record<string, number> = {};
  if (visualMod?.shaderParams) {
    const keys = Object.keys(visualMod.shaderParams).sort();
    for (const k of keys) {
      const v = visualMod.shaderParams[k];
      if (typeof v === "number" && Number.isFinite(v)) {
        shaderParams[k] = round6(v);
      }
    }
  }
  return {
    nodeCount: mandala?.nodes.length ?? 0,
    glyphIntensity: round6(shaderParams["glyphIntensity"] ?? 0),
    glyphCount: round6(shaderParams["glyphCount"] ?? 0),
    shaderParams,
  };
}

/**
 * Pure capture: reads world/visualMod/lattice; never mutates body positions.
 */
export function captureEngine3DScene(
  input: SceneBridgeCaptureInput,
): SceneBridgeCaptureResult {
  const {
    world,
    frameIndex,
    seed,
    visualMod = null,
    mandalaLattice = null,
    camera = null,
    options = {},
  } = input;

  const maxMesh = options.maxMeshSamples ?? DEFAULT_MAX_MESH_SAMPLES;
  const baseR = options.baseBodyRadius ?? DEFAULT_BASE_BODY_RADIUS;
  const meshR = options.meshSampleRadius ?? DEFAULT_MESH_SAMPLE_RADIUS;
  const maxMandala = options.maxMandalaNodes ?? DEFAULT_MAX_MANDALA_NODES;
  const includeMandala = options.includeMandalaNodes !== false;
  const includeTriangles = options.includeMeshTriangles !== false;
  const maxTriangles = options.maxMeshTriangles ?? DEFAULT_MAX_MESH_TRIANGLES;

  const primitives: BridgePrimitive[] = [
    ...mapBodies(world.bodies, seed >>> 0, frameIndex | 0, baseR),
    ...mapMeshVertices(world.mesh.vertices, seed >>> 0, maxMesh, meshR),
  ];
  
  // Add triangle primitives when indices are available
  if (includeTriangles && world.mesh.indices && world.mesh.indices.length > 0) {
    primitives.push(...mapMeshTriangles(world.mesh.vertices, world.mesh.indices, seed >>> 0, maxTriangles));
  }
  
  if (includeMandala && mandalaLattice) {
    primitives.push(...mapMandalaNodes(mandalaLattice, maxMandala));
  }

  // Stable order for hashing
  primitives.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const cam: BridgeCameraDescriptor = camera
    ? {
        eye: vec4(...camera.eye),
        lookAt: vec4(...camera.lookAt),
        up: vec4(...camera.up),
        fovY: round6(camera.fovY),
      }
    : { ...DEFAULT_BRIDGE_CAMERA };

  const lattice = buildLatticeDescriptor(visualMod, mandalaLattice);

  const scene: Engine3DBridgeScene = {
    schemaVersion: ENGINE3D_BRIDGE_SCENE_SCHEMA,
    frameIndex: frameIndex | 0,
    seed: seed >>> 0,
    primitives,
    camera: cam,
    lattice,
    mappingNotes: {
      polyMeshTriangles: "implemented",
      bodyApproximation: "sphere_from_mass",
      meshVertices: "point_hypersphere_samples_capped",
      lattice: "visualMod_and_optional_mandala_nodes",
    },
  };

  const worldHash = hashCanonical(snapshotWorldForHash(world));
  const cameraHash = hashCanonical(cam);
  const latticeHash = hashCanonical(lattice);
  const sceneHash = hashCanonical(scene);

  const evidence: SceneBridgeEvidence = {
    frameIndex: scene.frameIndex,
    seed: scene.seed,
    worldHash,
    primitiveCount: primitives.length,
    cameraHash,
    latticeHash,
    sceneHash,
  };

  return { scene, evidence };
}

export class Engine3DSceneBridge {
  capture(input: SceneBridgeCaptureInput): SceneBridgeCaptureResult {
    return captureEngine3DScene(input);
  }
}
