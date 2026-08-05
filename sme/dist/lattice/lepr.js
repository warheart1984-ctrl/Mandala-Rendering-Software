/**
 * Lattice Evidence Propagation Rules (LEPR).
 * Defines how evidence is generated, attached, and propagated across the lattice
 * for every routed operation.
 *
 * Evidence bundle structure (per operation):
 *   authorityEvidence   — who authorized the action (actor, policy, MRI scores).
 *   validationEvidence  — resource floors, preconditions, CEN checks.
 *   decisionEvidence    — decision rationale (model outputs, thresholds, rules).
 *   outputEvidence      — actual result (classification, transcription, completion, render).
 *   verificationEvidence— post-checks (consistency, invariants, secondary models).
 *   replayEvidence      — seeds, parameters, inputs, configs.
 *   auditEvidence       — log references, timestamps, ledger entries.
 */

const { createHash } = require('crypto');

const EVIDENCE_SEGMENTS = [
  'authorityEvidence',
  'validationEvidence',
  'decisionEvidence',
  'outputEvidence',
  'verificationEvidence',
  'replayEvidence',
  'auditEvidence',
];

function stableStringify(value) {
  if (value === null || typeof value !== 'object') { return JSON.stringify(value); }
  if (Array.isArray(value)) { return `[${value.map(stableStringify).join(',')}]`; }
  return `{${Object.keys(value)
    .filter((k) => typeof value[k] !== 'undefined')
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(',')}}`;
}

function hashSegment(value) {
  return createHash('sha256').update(stableStringify(value ?? null), 'utf8').digest('hex');
}

class EvidenceBundle {
  constructor() {
    this.bundleId = null;
    this.segments = {};
    this.bundleHash = null;
    this.hops = [];
  }

  set(segmentName, value) {
    if (!EVIDENCE_SEGMENTS.includes(segmentName)) {
      throw new Error(`LEPR unknown evidence segment: '${segmentName}'`);
    }
    this.segments[segmentName] = value;
    return this;
  }

  addHop(hop) {
    this.hops.push({ nodeId: hop.nodeId, at: hop.at, segment: hop.segment });
    return this;
  }

  seal(requestId) {
    this.bundleId = `evb-${createHash('sha256').update(requestId).digest('hex').slice(0, 16)}`;
    const hashes = EVIDENCE_SEGMENTS.map((name) => hashSegment(this.segments[name]));
    this.bundleHash = createHash('sha256').update(hashes.join('|'), 'utf8').digest('hex');
    return this;
  }

  toJSON() {
    return {
      bundleId: this.bundleId,
      bundleHash: this.bundleHash,
      segments: this.segments,
      hops: this.hops,
    };
  }

  verify() {
    if (!this.bundleHash) { return false; }
    const hashes = EVIDENCE_SEGMENTS.map((name) => hashSegment(this.segments[name]));
    const computed = createHash('sha256').update(hashes.join('|'), 'utf8').digest('hex');
    return computed === this.bundleHash;
  }
}

/**
 * Build an empty but structurally complete LEPR evidence bundle.
 */
function createEvidenceBundle() {
  return new EvidenceBundle();
}

/**
 * Build a bundle from explicit segment inputs (shorthand).
 */
function buildEvidenceBundle({ requestId, authority, validation, decision, output, verification, replay, audit, hops = [] }) {
  const bundle = createEvidenceBundle();
  bundle.set('authorityEvidence', authority);
  bundle.set('validationEvidence', validation);
  bundle.set('decisionEvidence', decision);
  bundle.set('outputEvidence', output);
  bundle.set('verificationEvidence', verification);
  bundle.set('replayEvidence', replay);
  bundle.set('auditEvidence', audit);
  for (const hop of hops) { bundle.addHop(hop); }
  bundle.seal(requestId);
  return bundle;
}

module.exports = {
  EVIDENCE_SEGMENTS,
  EvidenceBundle,
  createEvidenceBundle,
  buildEvidenceBundle,
  stableStringify,
  hashSegment,
};
