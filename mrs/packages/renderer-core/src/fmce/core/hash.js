/**
 * Shared canonical hashing utilities for the FMCE subsystem.
 * Deterministic SHA-256 hashing for constitutional evidence and replay traces.
 */

import { createHash } from "node:crypto";

export function sha256Hex(data) {
  return createHash("sha256").update(String(data)).digest("hex");
}

export function sha256Prefixed(data) {
  return "sha256:" + sha256Hex(data);
}

export function stableStringify(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
}

export function canonicalHash(value) {
  return sha256Prefixed(stableStringify(value));
}
