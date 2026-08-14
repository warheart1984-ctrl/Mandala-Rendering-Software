/**
 * StateHasher — deterministic canonical hashing for the Singularity Tree.
 *
 * Pure JS (FNV-1a 64-bit + canonical JSON with sorted keys), so hashing works
 * identically in Node and browsers without crypto dependencies.
 *
 * Used for:
 *   - node identity / geometry signatures
 *   - evidence input/output state hashes
 *   - configuration hashes
 *   - determinism verification (same seed → same hashes)
 *
 * Status: enforced (verified by determinism tests).
 */

function sortKeys(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number") {
      if (Object.is(value, -0)) return 0;
      if (!Number.isFinite(value)) return String(value);
      return value;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(sortKeys);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
  return out;
}

export function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

const FNV_OFFSET = 14695981039346656037n;
const FNV_PRIME = 1099511628211n;

/** FNV-1a 64-bit hex over a string (BigInt-based, deterministic). */
export function fnv1a64(str) {
  let h = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    h ^= BigInt(str.charCodeAt(i));
    h = (h * FNV_PRIME) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

/** FNV-1a 64-bit hex over an array of bytes. */
export function fnv1a64Bytes(bytes) {
  let h = FNV_OFFSET;
  for (let i = 0; i < bytes.length; i++) {
    h ^= BigInt(bytes[i]);
    h = (h * FNV_PRIME) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

/** Canonical hash of any JSON-serializable value. */
export function hashState(value) {
  return fnv1a64(canonicalJson(value));
}

/** Compact numeric signature (unsigned 32-bit) of a value. */
export function stateSignature(value) {
  const hex = hashState(value);
  return parseInt(hex.slice(0, 8), 16) >>> 0;
}

/** Hash of a configuration object (used for evidence + replayability). */
export function configurationHash(config) {
  return hashState({ config, scheme: "singularity-tree.config.v1" });
}

/** Combine several hashes into one (order-sensitive). */
export function combineHashes(hashes) {
  return fnv1a64(hashes.join("|"));
}

export const STATE_HASHER_BANNER = "singularity-tree.state-hasher.v1";