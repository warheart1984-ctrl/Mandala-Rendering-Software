/**
 * Deterministic SHA-256 of canonical spatial token JSON.
 * Status: enforced.
 */

import { createHash } from "node:crypto";
import { canonicalTokenJson } from "./types.js";

/**
 * @param {import('./types.js').SpatialToken} token
 * @returns {string} hex sha256
 */
export function hashSpatialToken(token) {
  const json = canonicalTokenJson(token);
  return createHash("sha256").update(json, "utf8").digest("hex");
}
