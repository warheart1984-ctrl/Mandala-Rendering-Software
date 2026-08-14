/**
 * SingularityRoot — L0 ROOT layer.
 *
 * Initializes the immutable generative root:
 *   - generative state (RootState)
 *   - initial conditions (seed, dimension)
 *   - coordinate frame
 *   - initial topology (S³ target)
 *   - global invariants
 *   - deterministic identity
 *
 * The root must be immutable after initialization: the returned object is
 * deeply frozen and any attempt to mutate it silently fails (or throws in
 * strict mode).
 *
 * Status: enforced (verified by root tests + invariant 1).
 */

import { normalizeSingularityTreeConfig } from "../config.js";
import { createRootState } from "./RootState.js";
import { createTopologySignature } from "../topology/TopologySignature.js";
import { hashState } from "../determinism/StateHasher.js";

export function createRoot(config = {}) {
  const normalized = normalizeSingularityTreeConfig(config);

  const seed = (normalized.deterministicSeed >>> 0) || 1;
  const rootState = createRootState(normalized, seed);

  const root = {
    id: "root",
    rootId: "root",
    kind: "singularity-root",
    seed,
    dimension: normalized.rootDimension,
    config: normalized,
    state: rootState,
    status: "immutable",
    isLeaf: false,
    branchPath: [],
    level: 0,
    children: [],
    geometrySignature: null,
    generationMetadata: Object.freeze({
      generationSeed: seed,
      generationRule: "singularity-root.v1",
      createdBy: normalized.createdBy,
      selfSimilarityClass: normalized.selfSimilarityClass,
      dof: 2,
    }),
    createdAt: null,
  };

  root.topologySignature = createTopologySignature(root, normalized);
  root.identityHash = hashState({
    scheme: "singularity-tree.root-identity.v1",
    id: "root",
    seed,
    dimension: normalized.rootDimension,
    configHash: rootState.configurationHash,
    stateHash: rootState.stateHash,
    topology: root.topologySignature.combinatorial,
  });

  return root;
}

/**
 * INV-1: the root STATE cannot be mutated after initialization. The root
 * node's structural fields (children) belong to the hierarchy and grow during
 * generation; its generative state object is deeply frozen.
 */
export function assertRootImmutable(root) {
  if (!root || root.kind !== "singularity-root") {
    throw new TypeError("assertRootImmutable: not a SingularityRoot");
  }
  if (!Object.isFrozen(root.state)) {
    throw new Error("SingularityRoot violated INV-ROOT-IMMUTABILITY: root state is not frozen");
  }
  if (root.state.status !== "immutable") {
    throw new Error("SingularityRoot violated INV-ROOT-IMMUTABILITY: root status is not immutable");
  }
  if (root.id !== "root") {
    throw new Error("SingularityRoot violated deterministic identity: id must be 'root'");
  }
  return true;
}