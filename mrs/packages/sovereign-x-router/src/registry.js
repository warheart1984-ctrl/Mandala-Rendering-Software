/**
 * Sovereign X vendor capability registry loader.
 *
 * STATUS: **declared** registration surface + **partial** lookup API.
 * Does not invoke NVIDIA/AMD runtimes. Drive-G-1: skills ≠ print SoT.
 *
 * Aliases (user SoT §A): gpu.gen.nvidia.nim_flux ↔ ai.gen.nvidia.flux
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REGISTRY_PATH = join(
  __dirname,
  "..",
  "data",
  "vendor-capability-registry.json",
);

/** @type {object | null} */
let cached = null;

/**
 * @returns {object} registry document
 */
export function loadVendorCapabilityRegistry(options = {}) {
  if (!options.reload && cached) return cached;
  const raw = readFileSync(REGISTRY_PATH, "utf8");
  const doc = JSON.parse(raw);
  if (doc.kind !== "SovereignXVendorCapabilityRegistry") {
    throw new Error(
      `unexpected registry kind: ${doc.kind ?? "(missing)"}`,
    );
  }
  cached = doc;
  return doc;
}

/**
 * Resolve alias → canonical capability id (identity if no alias).
 * @param {string} capabilityId
 * @returns {string}
 */
export function resolveCapabilityId(capabilityId) {
  if (typeof capabilityId !== "string" || !capabilityId.trim()) {
    return String(capabilityId ?? "");
  }
  const id = capabilityId.trim();
  const doc = loadVendorCapabilityRegistry();
  const aliases = doc.aliases ?? {};
  if (typeof aliases[id] === "string") return aliases[id];
  const cap = doc.capabilities.find((c) => c.id === id);
  if (cap?.aliasOf) return cap.aliasOf;
  return id;
}

/**
 * @param {string} capabilityId
 * @returns {object | undefined}
 */
export function getCapability(capabilityId) {
  const doc = loadVendorCapabilityRegistry();
  const resolved = resolveCapabilityId(capabilityId);
  return (
    doc.capabilities.find((c) => c.id === resolved) ??
    doc.capabilities.find((c) => c.id === capabilityId)
  );
}

/**
 * @returns {ReadonlySet<string>}
 */
export function getForbiddenPrintCapabilityIds() {
  const doc = loadVendorCapabilityRegistry();
  return new Set(
    (doc.forbiddenPrintCapabilityIds ?? []).map((row) => row.id),
  );
}

/**
 * @returns {ReadonlyMap<string, object>}
 */
export function indexCapabilitiesById() {
  const doc = loadVendorCapabilityRegistry();
  return new Map(doc.capabilities.map((c) => [c.id, c]));
}

/**
 * User SoT §A canonical classes (including aliases).
 * @returns {string[]}
 */
export function listCanonicalCapabilityClasses() {
  const doc = loadVendorCapabilityRegistry();
  return [...(doc.canonicalCapabilityClasses ?? [])];
}

/**
 * Clear module cache (tests only).
 */
export function clearRegistryCache() {
  cached = null;
}
