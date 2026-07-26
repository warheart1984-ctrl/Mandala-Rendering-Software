/**
 * Deterministic hashing for SceneBridge evidence.
 *
 * Algorithm: FNV-1a 32-bit over UTF-16 code units of canonical JSON.
 * Canonical JSON:
 *   - objects: keys sorted lexicographically
 *   - arrays: element order preserved
 *   - numbers: JSON.stringify (no trailing zeros special-casing beyond JSON)
 *   - Float32Array / typed arrays: converted to number[] by callers before hash
 *
 * Status: **enforced** (unit tests for stability). Not cryptographic SHA-256.
 */

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && Object.is(value, -0)) return 0;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = canonicalize(obj[k]);
  }
  return out;
}

/** FNV-1a 32-bit → hex string (8 chars). Stable across Node platforms. */
export function fnv1a32Hex(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function hashCanonical(value: unknown): string {
  return fnv1a32Hex(canonicalStringify(value));
}
