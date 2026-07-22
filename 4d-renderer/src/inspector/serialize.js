import { emptyInspectorResult } from "./types.js";

export function resultToJSON(result) {
  return JSON.stringify({ type: "inspect_result", ...result }, null, 2);
}

export function resultToWire(result) {
  return { type: "inspect_result", ...result };
}

/** Non-crypto fingerprint for skeleton bundles (portable). */
export function fingerprintHex(text) {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `fnv1a64:${h.toString(16)}`;
}

export function buildInspectorEvidenceBundle(result, meta = {}) {
  const body = {
    schemaVersion: "1.1",
    frameIndex: meta.frameIndex ?? 0,
    rayInput: meta.rayInput ?? null,
    screenInput: meta.screenInput ?? null,
    bvhPath: result?.provenance?.bvhPath ?? [],
    primitiveId: result?.provenance?.primitiveId ?? -1,
    result: result ?? emptyInspectorResult(),
  };
  const canonical = JSON.stringify(body);
  return { ...body, hash: fingerprintHex(canonical) };
}
