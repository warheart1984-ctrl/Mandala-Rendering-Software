/**
 * spo.mjs — Semantic Perception Object (SPO): a SEPARATE, certified overlay that
 * attaches semantic labels to a CPO by HASH.
 *
 * ── MEASUREMENT vs PERCEPTION vs INTERPRETATION ──────────────────────────────
 *   - CPO (measurement): byte-deterministic, lossless pixel truth. No model.
 *   - SPO (perception):  what a perception provider *claims* is in the image.
 *   - LLM (interpretation): downstream reasoning over CPO + SPO.
 *   The SPO references the CPO only by its `payload_hash` (source_hash =
 *   "sha256:<CPO payload_hash>"). Perception can therefore never contaminate the
 *   measurement: the CPO is provable on its own, and an SPO is only trusted if its
 *   source_hash matches the CPO it is presented against.
 *
 * ── STATUS: perception provider is SKELETON / declared ───────────────────────
 *   There is NO real vision model here. This module defines the overlay SCHEMA,
 *   the hash link, and validation. `makeSPO` stamps the provider status as
 *   "skeleton" unless a caller explicitly supplies a provider — and even then the
 *   regions are caller-supplied claims, not model output.
 *
 * Determinism: schema + validation are pure functions. No Math.random, no Date.now.
 */

export const SPO_TYPE = "semantic-overlay";
export const SPO_SCHEMA_VERSION = "1.0.0";

/**
 * The default perception provider descriptor. Honest status: no model wired.
 */
export function skeletonProvider() {
  return {
    name: "mandala-cpf/perception",
    status: "skeleton",
    model: null,
    note: "No perception model integrated. Schema, hash-linking and validation only.",
  };
}

/**
 * Build a Semantic Perception Object that references a CPO by hash.
 * @param {{ cpo?:object, sourceHash?:string, regions?:Array, provider?:object }} args
 *   Provide either `cpo` (its payload_hash is used) or an explicit `sourceHash`
 *   ("sha256:<hex>"). `regions` is an array of caller-supplied claims.
 * @returns {object} the SPO overlay packet
 */
export function makeSPO(args = {}) {
  let sourceHash = args.sourceHash;
  if (!sourceHash) {
    if (!args.cpo || !args.cpo.payload_hash) {
      throw new Error("makeSPO: provide either { cpo } or { sourceHash }");
    }
    sourceHash = `sha256:${args.cpo.payload_hash}`;
  }
  const regions = (args.regions ?? []).map(normalizeRegion);
  return {
    type: SPO_TYPE,
    schema_version: SPO_SCHEMA_VERSION,
    source_hash: sourceHash,
    regions,
    provider: args.provider ?? skeletonProvider(),
  };
}

function normalizeRegion(r) {
  return {
    region: r.region,
    label: r.label,
    confidence: r.confidence,
    bbox: r.bbox,
  };
}

/**
 * Validate an SPO's structure and, when a CPO is supplied, its hash link.
 * @param {object} spo
 * @param {object} [cpo] optional CPO to check source_hash against
 * @returns {{ valid:boolean, errors:string[] }}
 */
export function validateSPO(spo, cpo = null) {
  const errors = [];
  if (!spo || typeof spo !== "object") return { valid: false, errors: ["spo is not an object"] };
  if (spo.type !== SPO_TYPE) errors.push(`type != ${SPO_TYPE}`);
  if (typeof spo.source_hash !== "string" || !/^sha256:[0-9a-f]{64}$/.test(spo.source_hash)) {
    errors.push("source_hash must be 'sha256:<64 hex chars>'");
  }
  if (!Array.isArray(spo.regions)) {
    errors.push("regions must be an array");
  } else {
    spo.regions.forEach((r, i) => {
      if (!r || typeof r !== "object") {
        errors.push(`regions[${i}] is not an object`);
        return;
      }
      if (typeof r.label !== "string" || r.label.length === 0) errors.push(`regions[${i}].label must be a non-empty string`);
      if (typeof r.confidence !== "number" || r.confidence < 0 || r.confidence > 1) {
        errors.push(`regions[${i}].confidence must be a number in [0,1]`);
      }
      if (!Array.isArray(r.bbox) || r.bbox.length !== 4 || r.bbox.some((v) => typeof v !== "number" || v < 0 || v > 1)) {
        errors.push(`regions[${i}].bbox must be [x,y,w,h] with each in [0,1]`);
      }
    });
  }
  if (!spo.provider || typeof spo.provider !== "object" || typeof spo.provider.status !== "string") {
    errors.push("provider must be an object with a status");
  }

  if (cpo) {
    const expected = `sha256:${cpo.payload_hash}`;
    if (spo.source_hash !== expected) {
      errors.push(`source_hash ${spo.source_hash} does not match CPO ${expected}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** True when the SPO's source_hash matches the given CPO's payload_hash. */
export function spoMatchesCPO(spo, cpo) {
  return !!spo && !!cpo && spo.source_hash === `sha256:${cpo.payload_hash}`;
}
