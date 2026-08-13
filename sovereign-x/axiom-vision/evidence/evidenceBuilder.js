/**
 * Axiom Vision — Evidence Builder.
 * Constructs evidence objects with deterministic hashes and lineage.
 */

import { sha256Hex, canonicalJSON } from "./sha256.js";

let featureCounter = 0;

/**
 * Generate a unique feature ID.
 */
function nextFeatureId(prefix) {
  return `${prefix}_${(featureCounter++).toString(36).padStart(6, "0")}`;
}

/**
 * Compute the canonical feature hash.
 * Only includes the measurement fields — not provenance itself (to avoid circular hash).
 */
function computeFeatureHash(feature) {
  const canonical = {
    level: feature.level,
    type: feature.type,
    geometry: feature.geometry ?? null,
    magnitude: feature.magnitude ?? null,
    direction_degrees: feature.direction_degrees ?? null,
    area: feature.area ?? null,
    perimeter: feature.perimeter ?? null,
    label: feature.label ?? null,
    label_id: feature.label_id ?? null,
    method: feature.method,
    method_version: feature.method_version ?? null,
    tile: feature.tile ?? null,
    parent_features: feature.parent_features ?? [],
  };
  return sha256Hex(canonicalJSON(canonical));
}

/**
 * Compute the computation hash.
 * Includes method + params + parent hashes for full reproducibility verification.
 */
function computeComputationHash(method, params, parentHashes) {
  return sha256Hex(canonicalJSON({
    method,
    params,
    parent_hashes: [...parentHashes].sort(),
  }));
}

/**
 * Build a complete evidence object.
 *
 * @param {Object} opts
 * @param {number} opts.level - Pipeline level (0-5)
 * @param {string} opts.type - Feature type string
 * @param {Object} opts.geometry - Spatial extent
 * @param {string} opts.method - Algorithm name
 * @param {string} [opts.method_version] - Algorithm version
 * @param {number} [opts.tile] - Tile index
 * @param {Object} [opts.tile_grid] - Tile grid metadata
 * @param {string[]} [opts.parent_features] - Parent feature IDs
 * @param {string[]} [opts.parent_hashes] - Parent feature hashes
 * @param {Object} [opts.model_evidence] - Required for Level 3+
 * @param {number} [opts.magnitude] - Edge magnitude, gradient strength, etc.
 * @param {number} [opts.direction_degrees] - Edge/gradient direction
 * @param {number} [opts.area] - Region/contour area
 * @param {number} [opts.perimeter] - Contour perimeter
 * @param {string} [opts.label] - Object class label
 * @param {number} [opts.label_id] - Object class ID
 * @param {number} [opts.confidence] - Confidence (default 1.0 for deterministic)
 * @param {Object} [opts.extra] - Additional type-specific fields
 * @returns {Object} Complete evidence object with provenance
 */
export function buildEvidence(opts) {
  const level = opts.level;
  const isDeterministic = level <= 2;
  const isInterpretation = level === 5;

  const featureId = nextFeatureId(opts.type.split("_")[0]);

  const feature = {
    level,
    type: opts.type,
    feature_id: featureId,
  };

  if (opts.geometry) feature.geometry = opts.geometry;
  if (opts.magnitude != null) feature.magnitude = opts.magnitude;
  if (opts.direction_degrees != null) feature.direction_degrees = opts.direction_degrees;
  if (opts.area != null) feature.area = opts.area;
  if (opts.perimeter != null) feature.perimeter = opts.perimeter;
  if (opts.label != null) feature.label = opts.label;
  if (opts.label_id != null) feature.label_id = opts.label_id;
  if (opts.claim != null) feature.claim = opts.claim;

  feature.method = opts.method;
  if (opts.method_version) feature.method_version = opts.method_version;
  if (opts.tile != null) feature.tile = opts.tile;
  if (opts.tile_grid) feature.tile_grid = opts.tile_grid;
  if (opts.parent_features) feature.parent_features = opts.parent_features;
  if (opts.model_evidence) feature.model_evidence = opts.model_evidence;

  // Confidence: default 1.0 for deterministic, must be explicit for learned
  feature.confidence = opts.confidence ?? (isDeterministic ? 1.0 : 0.0);

  // Constitutional tag
  if (isInterpretation) {
    feature.constitutional_tag = "interpretation_not_fact";
  } else if (isDeterministic) {
    feature.constitutional_tag = "measurement";
  } else {
    feature.constitutional_tag = "inference";
  }

  // Compute hashes
  const parentHashes = opts.parent_hashes ?? [];
  const featureHash = computeFeatureHash(feature);
  const computationHash = computeComputationHash(opts.method, opts.extra ?? {}, parentHashes);

  feature.provenance = {
    feature_hash: featureHash,
    computation_hash: computationHash,
    deterministic: isDeterministic || !!opts.model_evidence?.deterministic_inference,
  };

  if (parentHashes.length > 0) {
    feature.provenance.parent_hash = parentHashes.length === 1
      ? parentHashes[0]
      : sha256Hex([...parentHashes].sort().join(""));
  }

  if (opts.model_evidence?.checksum_sha256) {
    feature.provenance.model_hash = opts.model_evidence.checksum_sha256;
  }

  // Merge any type-specific extra fields
  if (opts.extra) {
    for (const [k, v] of Object.entries(opts.extra)) {
      if (!(k in feature)) feature[k] = v;
    }
  }

  return feature;
}

/**
 * Reset feature counter (for testing / deterministic replay).
 */
export function resetFeatureCounter() {
  featureCounter = 0;
}
