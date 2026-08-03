import { createHash } from "node:crypto";

/**
 * Deterministic hashing helpers for evolution law / state / trajectory.
 * No wall-clock. Status: substrate_verified for Phase-2A toy path.
 */

/**
 * Stable JSON stringify with sorted object keys (arrays preserve order).
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalStringify(value) {
  return JSON.stringify(value, replacer);
}

/**
 * @param {string} _key
 * @param {unknown} val
 */
function replacer(_key, val) {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const sorted = {};
    for (const k of Object.keys(val).sort()) {
      sorted[k] = /** @type {Record<string, unknown>} */ (val)[k];
    }
    return sorted;
  }
  return val;
}

/**
 * @param {unknown} value
 * @returns {string} hex sha256
 */
export function sha256Canonical(value) {
  return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

/**
 * @param {string[]} hexHashes ordered per-step (or merkle leaves)
 * @returns {string}
 */
export function trajectoryRootFromStepHashes(hexHashes) {
  return sha256Canonical({ kind: "trajectoryRoot.v1", steps: hexHashes });
}
