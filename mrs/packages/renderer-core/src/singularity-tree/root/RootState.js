/**
 * RootState — the immutable 4D singularity seed χ₀ ∈ M₄.
 *
 * The root defines the rules and initial conditions; geometry is emergent
 * (never present at the root). RootState is frozen after construction and
 * carries:
 *   - the initial generative state (a unit 4-vector)
 *   - the coordinate frame (fixed orthonormal basis)
 *   - the initial topology signature (S³)
 *   - the global invariants declared at genesis
 *   - deterministic identity hashes
 *
 * Status: enforced (verified by root + invariant tests).
 */

import { vec4, normalize } from "../../render/rt4d/math/vec4.js";
import { hashState, configurationHash } from "../determinism/StateHasher.js";

export function createRootState(config, seed) {
  const dim = config.rootDimension;

  // Singularity seed: deterministic unit vector in M4 (dimension 4 default).
  // Tuned constants keep the direction away from coordinate axes so the
  // hierarchy explores all four planes of the substrate.
  const raw = vec4(
    Math.cos(seed * 0.017453292519943295) * 0.62,
    Math.sin(seed * 0.02314069263277927) * 0.51,
    Math.cos(seed * 0.0290888208665721) * 0.41,
    Math.sin(seed * 0.013089969389957472) * 0.44,
  );
  const state = normalize(raw);

  // Initial topology: the global invariant target (S³).
  const topologySignature = {
    class: config.topologyTarget,
    combinatorial: hashState({
      kind: "singularity-root",
      target: config.topologyTarget,
      dim,
    }).slice(0, 16),
  };

  const rootState = Object.freeze({
    id: "root",
    seed: seed >>> 0,
    dimension: dim,
    state,
    potential: 1.0,
    topologySignature,
    globalInvariants: Object.freeze([
      "INV-ROOT-IMMUTABILITY",
      "INV-LINEAGE",
      "INV-MONOTONIC-REFINEMENT",
      "INV-THRESHOLDED-DIFFERENTIATION",
      "INV-TOPOLOGY-PRESERVATION",
      "INV-DETERMINISM",
      "INV-SELF-SIMILARITY",
      "INV-BOUNDED-EXECUTION",
      "INV-TRACEABILITY",
      "INV-SEPARATION-OF-CONCERNS",
    ]),
    coordinateFrame: Object.freeze([
      vec4(1, 0, 0, 0),
      vec4(0, 1, 0, 0),
      vec4(0, 0, 1, 0),
      vec4(0, 0, 0, 1),
    ]),
    configurationHash: configurationHash(config),
    stateHash: hashState({ state, seed, dim }),
    status: "immutable",
    createdAt: null,
  });

  return Object.freeze(rootState);
}

export function freezeRootState(rootState) {
  return Object.freeze(rootState);
}