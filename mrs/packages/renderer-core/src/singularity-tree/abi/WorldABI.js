/**
 * WorldABI — the 4D World ABI between the Yggdrasil world generator and the
 * RT4D geometry engine.
 *
 * The world generator exposes compiled world state through this stable
 * contract; the RT4D engine (and any other consumer) reads it without
 * reaching into generator internals. The generator never depends on the
 * renderer — rendering is always a consumer (INV-10).
 *
 * ABI version: "4d-world.v1"
 * Status: enforced (verified by ABI tests).
 */

import { normalize } from "../../render/rt4d/math/vec4.js";
import { assembleContinuum, sampleManifoldMesh } from "../continuum/ContinuumAssembler.js";

export const WORLD_ABI_VERSION = "4d-world.v1";

const manifoldCache = new WeakMap();
const meshCache = new WeakMap();

/**
 * Compile a root into the world state record consumed by the geometry
 * engine. `worldState.hierarchy` is the generated hierarchy; `worldState`
 * exposes stable accessors only.
 */
export function compileWorldState(root, hierarchy, config, options = {}) {
  const state = {
    abi: WORLD_ABI_VERSION,
    rootId: root.id,
    seed: root.seed,
    hierarchy,
    config,
  };
  return Object.freeze({ ...state });
}

export function getWorldManifold(worldState) {
  if (manifoldCache.has(worldState)) return manifoldCache.get(worldState);
  const { hierarchy, config } = worldState;
  const manifold = assembleContinuum(hierarchy, config);
  manifoldCache.set(worldState, manifold);
  return manifold;
}

export function getWorldMesh(worldState) {
  if (meshCache.has(worldState)) return meshCache.get(worldState);
  const manifold = getWorldManifold(worldState);
  const mesh =
    manifold.mesh ||
    sampleManifoldMesh(
      manifold.charts,
      worldState.config.leafSampleResolution,
      worldState.config.weldDistance,
    );
  meshCache.set(worldState, mesh);
  return mesh;
}

export function getNodeById(worldState, id) {
  return worldState.hierarchy.getNode(id);
}

export function getLeafGeometry(worldState, nodeId) {
  const node = worldState.hierarchy.getNode(nodeId);
  return node && node.geometry ? node.geometry : null;
}

export function getLeaves(worldState) {
  return worldState.hierarchy.leaves();
}

export function worldDescriptor(worldState) {
  const nodes = [];
  for (const node of worldState.hierarchy.allNodes()) {
    const d = normalize(node.state.state);
    nodes.push({
      id: node.id,
      parentId: node.parentId,
      level: node.level,
      state: { x: d.x, y: d.y, z: d.z, w: d.w },
      potential: node.state.potential,
      branchPath: node.branchPath || [],
      isLeaf: node.isLeaf,
    });
  }
  return {
    abi: WORLD_ABI_VERSION,
    nodes,
  };
}

export const WorldABI = {
  VERSION: WORLD_ABI_VERSION,
  compileWorldState,
  getWorldManifold,
  getWorldMesh,
  getNodeById,
  getLeafGeometry,
  getLeaves,
  worldDescriptor,
};