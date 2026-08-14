/**
 * ComputeABI — the Compute ABI between the world generator and the Axiom-X
 * deterministic compute substrate.
 *
 * World state is exported as flat typed-array buffers (Float64Array
 * vertices/edges, Uint32Array edges) plus a JSON header describing the exact
 * byte layout, so a deterministic kernel substrate (Axiom-X: Q16.16
 * fixed-point kernels, GPU/CPU/JS mirrors) can consume the world without
 * touching generator internals.
 *
 * ABI version: "compute.v1"
 * Status: partial — JS side enforced (descriptor export is deterministic and
 * tested); no Axiom-X kernel consumes it yet (kernel wiring is a separate
 * sovereignty track).
 */

import { WORLD_ABI_VERSION, getWorldManifold, getWorldMesh } from "./WorldABI.js";

export const COMPUTE_ABI_VERSION = "compute.v1";
export const COMPUTE_LAYOUT = Object.freeze({
  vertexStride: 4, // x, y, z, w (Float64)
  edgeStride: 2, // a, b (Uint32)
  headerBytes: 0, // header is JSON, side-channel
});

/**
 * Export the compiled world as a deterministic compute payload.
 * The payload is a pure function of (seed, config, hierarchy): identical
 * inputs produce byte-identical buffers.
 */
export function computeDescriptor(worldState) {
  const mesh = getWorldMesh(worldState);
  const vertices = new Float64Array(mesh.vertices.length * COMPUTE_LAYOUT.vertexStride);
  for (let i = 0; i < mesh.vertices.length; i++) {
    vertices.set(
      [mesh.vertices[i].x, mesh.vertices[i].y, mesh.vertices[i].z, mesh.vertices[i].w],
      i * COMPUTE_LAYOUT.vertexStride,
    );
  }
  const edges = new Uint32Array(mesh.edges.length * COMPUTE_LAYOUT.edgeStride);
  for (let i = 0; i < mesh.edges.length; i++) {
    edges.set([mesh.edges[i][0], mesh.edges[i][1]], i * COMPUTE_LAYOUT.edgeStride);
  }
  return {
    abi: COMPUTE_ABI_VERSION,
    worldAbi: WORLD_ABI_VERSION,
    layout: COMPUTE_LAYOUT,
    vertexCount: mesh.vertices.length,
    edgeCount: mesh.edges.length,
    vertices,
    edges,
  };
}

export function computePayloadToJSON(payload) {
  return {
    abi: payload.abi,
    worldAbi: payload.worldAbi,
    layout: payload.layout,
    vertexCount: payload.vertexCount,
    edgeCount: payload.edgeCount,
    vertices: Array.from(payload.vertices),
    edges: Array.from(payload.edges),
  };
}

export const ComputeABI = {
  VERSION: COMPUTE_ABI_VERSION,
  LAYOUT: COMPUTE_LAYOUT,
  computeDescriptor,
  computePayloadToJSON,
};