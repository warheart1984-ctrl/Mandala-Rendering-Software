/**
 * State Hashing Utilities
 * Deterministic SHA-256 hashing for 4D state certification
 * Status: enforced
 */

import { createHash } from 'crypto';
import { stableStringify } from '../../../fmce/core/hash.js';

/**
 * Compute deterministic SHA-256 hash of state fields
 * @param {Object} fields - 4D state fields
 * @returns {string} hex hash
 */
export function hashStateFields(fields) {
  const canonical = stableStringify(fields);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Compute hash of state proposal
 * @param {Object} proposal - state proposal
 * @returns {string} hex hash
 */
export function hashStateProposal(proposal) {
  const canonical = stableStringify({
    intent_id: proposal.intent_id,
    world_id: proposal.world_id,
    previous_state_id: proposal.previous_state_id,
    simulation_step: proposal.simulation_step,
    fields: proposal.fields,
    conserved_quantities: proposal.conserved_quantities
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Compute render hash from render artifact
 * @param {Object} render - render artifact
 * @returns {string} hex hash
 */
export function hashRenderArtifact(render) {
  const canonical = stableStringify({
    state_id: render.state_id,
    observation_params: render.observation_params,
    pixels: render.pixels,
    provenance: render.provenance
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Verify state hash matches fields
 * @param {Object} state - certified state
 * @returns {boolean}
 */
export function verifyStateHash(state) {
  const computedHash = hashStateFields(state.fields);
  return computedHash === state.certified_hash;
}

/**
 * Create deterministic state identifier
 * @param {string} worldId
 * @param {number} step
 * @returns {string}
 */
export function createStateId(worldId, step) {
  const input = `${worldId}:${step}`;
  return 'state-' + createHash('sha256').update(input).digest('hex').slice(0, 14);
}

/**
 * Short hash for display
 * @param {string} hash
 * @returns {string}
 */
export function shortHash(hash) {
  return hash.slice(0, 8);
}

export default {
  hashStateFields,
  hashStateProposal,
  hashRenderArtifact,
  verifyStateHash,
  createStateId,
  shortHash
};
