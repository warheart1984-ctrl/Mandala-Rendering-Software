/**
 * Lattice Replay Determinism Model (LRDM).
 * Defines how any lattice operation can be deterministically reconstructed
 * for audit, verification, or simulation.
 *
 * Replay record:
 *   requestId, nodePath, inputs, parameters, environment, randomSources,
 *   outputs, evidenceBundle.
 *
 * Determinism requirements:
 *   - Seeded randomness: all stochastic components must be seed-controlled and recorded.
 *   - Version pinning: model and binary versions must be captured in environment.
 *   - Path stability: nodePath must be reproducible given the same inputs and policies.
 *   - Failure replay: refusals must be replayable with the same violation outcome.
 */

const { createHash } = require('crypto');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') { return JSON.stringify(value); }
  if (Array.isArray(value)) { return `[${value.map(stableStringify).join(',')}]`; }
  return `{${Object.keys(value)
    .filter((k) => typeof value[k] !== 'undefined')
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(',')}}`;
}

class ReplayRecord {
  constructor(input) {
    this.requestId = input.requestId;
    this.nodePath = input.nodePath || [];
    this.inputs = input.inputs;
    this.parameters = input.parameters;
    this.environment = input.environment;
    this.randomSources = input.randomSources;
    this.outputs = input.outputs;
    this.evidenceBundle = input.evidenceBundle;
    this.recordedAt = input.recordedAt ?? Date.now();
  }

  canonical() {
    return {
      requestId: this.requestId,
      nodePath: this.nodePath,
      inputs: this.inputs,
      parameters: this.parameters,
      environment: this.environment,
      randomSources: this.randomSources,
      outputs: this.outputs,
      evidenceBundle: this.evidenceBundle,
    };
  }

  /**
   * Deterministic identity of the replay record (independent of wall-clock).
   */
  recordHash() {
    return createHash('sha256').update(stableStringify(this.canonical()), 'utf8').digest('hex');
  }
}

class ReplayStore {
  constructor() {
    this.records = new Map();
  }

  save(record) {
    const rec = record instanceof ReplayRecord ? record : new ReplayRecord(record);
    this.records.set(rec.requestId, rec);
    return rec;
  }

  get(requestId) { return this.records.get(requestId) ?? null; }

  list() { return [...this.records.values()]; }

  clear() { this.records.clear(); }
}

/**
 * Replay operations.
 */
class ReplayService {
  constructor(store) {
    this.store = store || new ReplayStore();
  }

  /**
   * replay(requestId) — reconstructs the full operation (re-runs node path with
   * the same inputs, parameters, and randomSources through the given executor).
   * @param {string} requestId
   * @param {(record: ReplayRecord) => Promise<object>} executor
   * @returns {Promise<{ ok: boolean, output: object, recordHash: string, differences?: string[] }>}
   */
  async replay(requestId, executor) {
    const record = this.store.get(requestId);
    if (!record) {
      return { ok: false, error: `replay record not found: ${requestId}` };
    }
    const originalHash = record.recordHash();
    const output = await executor(record);
    return { ok: true, output, recordHash: originalHash };
  }

  /**
   * simulate(requestId, overrides) — replays with modified parameters for analysis.
   */
  async simulate(requestId, overrides, executor) {
    const record = this.store.get(requestId);
    if (!record) {
      return { ok: false, error: `replay record not found: ${requestId}` };
    }
    const simulated = new ReplayRecord({
      ...record.canonical(),
      requestId: `${requestId}-sim`,
      parameters: { ...record.parameters, ...(overrides.parameters || {}) },
      randomSources: { ...record.randomSources, ...(overrides.randomSources || {}) },
      inputs: overrides.inputs ?? record.inputs,
    });
    const output = await executor(simulated);
    return { ok: true, simulated, output };
  }

  /**
   * verify(requestId) — checks that replay matches original evidence and outputs.
   * @param {string} requestId
   * @param {(record: ReplayRecord) => Promise<object>} executor
   * @returns {Promise<{ verified: boolean, differences: string[], output: object, recordHash: string }>}
   */
  async verify(requestId, executor) {
    const record = this.store.get(requestId);
    if (!record) {
      return { verified: false, differences: [`replay record not found: ${requestId}`], output: null, recordHash: '' };
    }
    const originalHash = record.recordHash();
    const originalOutputs = record.outputs;
    const replayOutput = await executor(record);
    const differences = [];
    for (const key of Object.keys(originalOutputs || {})) {
      const a = stableStringify(originalOutputs[key]);
      const b = stableStringify(replayOutput?.[key]);
      if (a !== b) { differences.push(`output.${key} differs`); }
    }
    return { verified: differences.length === 0, differences, output: replayOutput, recordHash: originalHash };
  }
}

module.exports = {
  ReplayRecord,
  ReplayStore,
  ReplayService,
  stableStringify,
};
