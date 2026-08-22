/**
 * Canonical CPO / SPO / CPF-4D envelope builder for HoloRT4D.
 *
 * Float32Array snapshot -> chamber envelope with zero ambiguity.
 * RawSnapshot -> buildCanonicalEnvelope -> CanonicalSnapshotEnvelope.
 *
 * Step 4 canonical version: 1.0.0
 * Self-contained within renderer-core. Mirrors cpo-types.js typedefs.
 *
 * Status: partial - format conversion enforced; live chamber roundtrip skeleton.
 */

import { createHash } from "node:crypto";
import { SNAPSHOT_LEVELS, perceptualFeatures } from "./snapshot.js";

export const CANONICAL_STATUS = Object.freeze({
  envelope: "enforced",
  cpo: "enforced",
  spo: "enforced",
  cpf4d: "partial",
  chamberRoundtrip: "declared",
  artDirectionProvenance: "declared",
});

export const CANONICAL_VERSION = "1.0.0";

export const STATUS_TAGS = Object.freeze({
  PUBLISHED: "snapshot-published",
  DRAFT: "snapshot-draft",
  ERROR: "snapshot-error",
});

export const PIPELINE_STAGES = Object.freeze({
  DEPTH_RECONSTRUCT: "depth-reconstruct",
  VISION_BRIDGE: "vision-bridge",
  POST_PROCESS: "post-process",
});

// Hash helpers

export function hashFloat32Array(arr) {
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  return createHash("sha256").update(buf).digest("hex");
}

export function hashUint8Array(arr) {
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  return createHash("sha256").update(buf).digest("hex");
}

export function hashJson(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

// ---------------------------------------------------------------------------
// Core: buildCanonicalEnvelope
// ---------------------------------------------------------------------------

/**
 * Build a canonical CPO/SPO/CPF-4D envelope from a raw snapshot.
 *
 * @param {object} snapshot
 * @param {"CPO"|"SPO"|"CPF-4D"} snapshot.kind
 * @param {string} snapshot.fieldId
 * @param {{width:number,height:number}} snapshot.pixelGrid
 * @param {Float32Array} snapshot.data
 * @param {Uint8Array|null} [snapshot.palette]
 * @param {object} options
 * @param {string} options.briefId
 * @param {string} options.waveFieldId
 * @param {"depth-reconstruct"|"vision-bridge"|"post-process"} options.pipelineStage
 * @param {"row-major"|"col-major"} [options.layout]
 * @param {number} [options.channels]
 * @param {"snapshot-published"|"snapshot-draft"|"snapshot-error"} [options.statusTag]
 * @param {string} [options.notes]
 * @param {string} [options.author]
 * @param {string} [options.sceneId]
 * @param {string} [options.revision]
 */
export function buildCanonicalEnvelope(snapshot, options) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("buildCanonicalEnvelope: snapshot required");
  if (!snapshot.kind) throw new Error("buildCanonicalEnvelope: snapshot.kind required");
  if (!snapshot.data || !(snapshot.data instanceof Float32Array)) {
    throw new Error("buildCanonicalEnvelope: snapshot.data must be Float32Array");
  }

  const layout = options.layout ?? "row-major";
  const channels = options.channels ?? 1;
  const statusTag = options.statusTag ?? STATUS_TAGS.PUBLISHED;

  const dataHash = hashFloat32Array(snapshot.data);
  const paletteHash = snapshot.palette ? hashUint8Array(snapshot.palette) : undefined;

  const envelopeBase = {
    protocol: snapshot.kind,
    version: CANONICAL_VERSION,
    fieldId: snapshot.fieldId,
    grid: { width: snapshot.pixelGrid.width, height: snapshot.pixelGrid.height },
    payload: { bufferRef: dataHash, layout, channels },
    palette: snapshot.palette ? { bufferRef: paletteHash, kind: "labels" } : null,
    status: { stage: "vision-bridge", tag: statusTag },
    provenance: {
      briefId: options.briefId,
      source: "vision-bridge",
      createdAt: new Date().toISOString(),
      waveFieldId: options.waveFieldId,
      pipelineStage: options.pipelineStage,
      notes: options.notes,
      author: options.author,
      sceneId: options.sceneId,
      revision: options.revision,
    },
  };

  return {
    ...envelopeBase,
    hashes: { dataHash, paletteHash, envelopeHash: hashJson(envelopeBase) },
  };
}

// ---------------------------------------------------------------------------
// Convenience builders for known snapshot kinds
// ---------------------------------------------------------------------------

/**
 * Build a CPO envelope from a Float32Array snapshot (snapshot.js format).
 */
export function buildCPOEnvelope(snapshot, opts = {}) {
  const raw = {
    kind: "CPO",
    fieldId: opts.fieldId ?? "holort4d-cpo",
    pixelGrid: { width: snapshot.width, height: snapshot.height },
    data: snapshot instanceof Float32Array ? snapshot : new Float32Array(snapshot),
    palette: opts.palette ?? null,
    stats: snapshot.perceptualFeatures
      ? { min: 0, max: snapshot.perceptualFeatures.max, mean: snapshot.perceptualFeatures.mean, stddev: 0 }
      : undefined,
  };
  return buildCanonicalEnvelope(raw, {
    briefId: opts.briefId ?? "holort4d-default",
    waveFieldId: opts.waveFieldId ?? raw.fieldId,
    pipelineStage: opts.pipelineStage ?? PIPELINE_STAGES.VISION_BRIDGE,
    channels: snapshot.channels ?? 1,
    statusTag: opts.statusTag,
    notes: opts.notes,
    author: opts.author,
    sceneId: opts.sceneId,
    revision: opts.revision,
  });
}

/**
 * Build an SPO envelope from a Vision Bridge result + parent CPO hash.
 */
export function buildSPOEnvelope(cpoHash, visionResult, opts = {}) {
  const regions = (visionResult?.observations ?? []).map((obs, i) => ({
    region_id: i,
    label: obs.type ?? "object",
    confidence: typeof obs.confidence === "number" ? obs.confidence : 0.5,
    bbox: obs.bbox ?? undefined,
    evidence_ref: obs.description ?? "",
  }));
  const envelopeHash = hashJson({ source_hash: cpoHash, regions });
  return {
    protocol: "SPO",
    version: CANONICAL_VERSION,
    type: "semantic-overlay",
    source_hash: cpoHash,
    regions,
    provider: {
      name: opts.providerName ?? "holort4d-vision-bridge",
      version: opts.providerVersion ?? "0.1.0",
      config: { detail: opts.detail ?? "medium" },
    },
    governance: {
      intent_confidence: opts.intentConfidence ?? 0.8,
      evidence_confidence: opts.evidenceConfidence ?? 0.7,
      conformance_score: opts.conformanceScore ?? 0.6,
      stewardship_score: opts.stewardshipScore ?? 0.7,
    },
    metadata: {
      created: new Date().toISOString(),
      content_hash: envelopeHash,
      provenance: {
        briefId: opts.briefId ?? "holort4d-default",
        source: "vision-bridge",
        waveFieldId: opts.waveFieldId ?? "unknown",
        pipelineStage: opts.pipelineStage ?? PIPELINE_STAGES.VISION_BRIDGE,
      },
    },
  };
}

/**
 * Build a CPF-4D envelope from a CPF-4D snapshot.
 */
export function buildCPF4DEnvelope(snapshot, opts = {}) {
  const bounceCount = snapshot.bounceCount ?? 1;
  const data = snapshot instanceof Float32Array ? snapshot : new Float32Array(snapshot);
  const fieldHash = hashFloat32Array(data);
  return {
    protocol: "CPF-4D",
    version: CANONICAL_VERSION,
    type: "field-4d",
    payload: {
      nx: snapshot.width,
      ny: snapshot.height,
      nz: opts.nz ?? 1,
      nt: bounceCount,
      fields: { amplitude: { encoding: "float32", hash: fieldHash } },
    },
    payload_hash: fieldHash,
    metadata: {
      created: new Date().toISOString(),
      source: opts.source ?? "holo-chamber",
      content_hash: fieldHash,
      provenance: {
        briefId: opts.briefId ?? "holort4d-default",
        source: "vision-bridge",
        waveFieldId: opts.waveFieldId ?? "unknown",
        pipelineStage: opts.pipelineStage ?? PIPELINE_STAGES.VISION_BRIDGE,
        meaning: snapshot.meaning,
        layout: snapshot.layout ?? null,
        bounceCount,
        cpuStatus: snapshot.cpuStatus,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Art direction provenance (Section 10 of art direction brief)
// ---------------------------------------------------------------------------

/**
 * Build art direction provenance per the art direction brief section 10.
 */
export function buildArtDirectionProvenance(opts = {}) {
  return {
    intent: opts.intent ?? "holographic-field-debug",
    honest: {
      holort4d: opts.holort4dHonest ?? "wave-optics",
      sdTurbo: opts.sdHonest ?? "did-not-run",
      chamberHolo: opts.chamberHonest ?? "did-not-run",
      photoreal: opts.photoreal ?? "not-claimed",
    },
    lighting: {
      key: opts.keyLight ?? "[0.35, -0.85, 0.40] warm 5600K intensity 2.4",
      fill: opts.fillLight ?? "[-0.50, -0.30, -0.20] cool 7000K intensity 0.35",
      ground: opts.ground ?? "y=0 contact shadow plane",
      exposure: opts.exposure ?? "2.2",
    },
    visuals: {
      engine: opts.engine ?? "holort4d-cpu",
      size: opts.size ?? "unknown",
      steps: opts.steps ?? 0,
      samples: opts.samples ?? 0,
    },
    pipeline: {
      stages: (opts.stages ?? []).map((s) => ({ stage: s.stage, status: s.status ?? "declared" })),
    },
  };
}
