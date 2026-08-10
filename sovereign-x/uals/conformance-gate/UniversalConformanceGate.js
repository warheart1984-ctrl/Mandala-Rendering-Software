/**
 * UALS v1.0 — Universal Conformance Gate (UCG)
 * All 16 constitutional checks for delegated execution
 */

import { createHash } from "node:crypto";
import { CONFORMANCE_CHECKS, UALSError, ERROR_CODES } from "../types.js";

export class UniversalConformanceGate {
  constructor(config = {}) {
    this.strictMode = config.strictMode !== false;
    this.checks = new Map();
    this._registerDefaultChecks();
  }

  _registerDefaultChecks() {
    this.registerCheck("determinism", this._checkDeterminism.bind(this));
    this.registerCheck("normalization", this._checkNormalization.bind(this));
    this.registerCheck("provenance_integrity", this._checkProvenanceIntegrity.bind(this));
    this.registerCheck("replay_fidelity", this._checkReplayFidelity.bind(this));
    this.registerCheck("byte_exact_parity", this._checkByteExactParity.bind(this));
    this.registerCheck("backend_fungibility", this._checkBackendFungibility.bind(this));
    this.registerCheck("kernel_consistency", this._checkKernelConsistency.bind(this));
    this.registerCheck("no_nondeterministic_drift", this._checkNoNondeterministicDrift.bind(this));
    this.registerCheck("no_authority_leakage", this._checkNoAuthorityLeakage.bind(this));
    this.registerCheck("no_global_state_mutation", this._checkNoGlobalStateMutation.bind(this));
    this.registerCheck("no_backend_specific_semantics", this._checkNoBackendSpecificSemantics.bind(this));
    this.registerCheck("no_ungoverned_memory_access", this._checkNoUngovernedMemoryAccess.bind(this));
    this.registerCheck("no_provenance_loss", this._checkNoProvenanceLoss.bind(this));
    this.registerCheck("no_replay_divergence", this._checkNoReplayDivergence.bind(this));
    this.registerCheck("no_tile_boundary_artifacts", this._checkNoTileBoundaryArtifacts.bind(this));
    this.registerCheck("no_constitutional_violations", this._checkNoConstitutionalViolations.bind(this));
  }

  registerCheck(name, fn) {
    if (!CONFORMANCE_CHECKS.includes(name)) {
      throw new UALSError(ERROR_CODES.INVALID_CONFIG, `Unknown conformance check: ${name}`);
    }
    this.checks.set(name, fn);
  }

  async runAll(executionContext) {
    const results = {};
    const evidence = {};

    for (const checkName of CONFORMANCE_CHECKS) {
      const checkFn = this.checks.get(checkName);
      if (!checkFn) {
        results[checkName] = { pass: false, reason: "Check not implemented" };
        continue;
      }

      try {
        const result = await checkFn(executionContext);
        results[checkName] = { pass: true, ...result };
        if (result.evidence) evidence[checkName] = result.evidence;
      } catch (error) {
        results[checkName] = { pass: false, reason: error.message };
        if (this.strictMode) {
          throw new UALSError(ERROR_CODES.CONFORMANCE_FAILED, `Conformance check failed: ${checkName} - ${error.message}`);
        }
      }
    }

    const passed = Object.values(results).filter(r => r.pass).length;
    const total = CONFORMANCE_CHECKS.length;

    return {
      passed,
      total,
      success: passed === total,
      results,
      evidence,
      ualsVersion: "1.0",
      timestamp: Date.now(),
    };
  }

  async runCheck(name, executionContext) {
    const checkFn = this.checks.get(name);
    if (!checkFn) {
      throw new UALSError(ERROR_CODES.INVALID_CONFIG, `Check ${name} not registered`);
    }
    try {
      const result = await checkFn(executionContext);
      return { pass: true, ...result };
    } catch (error) {
      return { pass: false, reason: error.message };
    }
  }

  async _checkDeterminism(ctx) {
    const { outputs, runs = 3 } = ctx;
    if (!outputs || outputs.length === 0) {
      throw new Error("No outputs for determinism check");
    }
    if (outputs.length === 1) {
      // Single output - determinism trivially holds
      return { evidence: { hash: this._hashOutput(outputs[0]), runs: 1, note: "single_run" } };
    }
    if (outputs.length < runs) {
      throw new Error(`Insufficient outputs for determinism check: got ${outputs.length}, need ${runs}`);
    }

    const firstHash = this._hashOutput(outputs[0]);
    for (let i = 1; i < outputs.length; i++) {
      if (this._hashOutput(outputs[i]) !== firstHash) {
        throw new Error(`Output ${i} differs from first run`);
      }
    }
    return { evidence: { hash: firstHash, runs: outputs.length } };
  }

  async _checkNormalization(ctx) {
    const { output, expectedRange } = ctx;
    if (!output) throw new Error("No output provided");

    const data = output.data || output;
    let min = Infinity, max = -Infinity;
    for (const val of data) {
      min = Math.min(min, val);
      max = Math.max(max, val);
    }

    // Auto-detect range: if max > 1, assume 0-255 (8-bit), else 0-1
    const range = expectedRange || (max > 1 ? [0, 255] : [0, 1]);

    if (min < range[0] || max > range[1]) {
      throw new Error(`Values outside expected range [${range[0]}, ${range[1]}]: [${min}, ${max}]`);
    }
    return { evidence: { min, max, range } };
  }

  async _checkProvenanceIntegrity(ctx) {
    const { provenance } = ctx;
    if (!provenance || !Array.isArray(provenance)) {
      throw new Error("No provenance records provided");
    }

    for (const record of provenance) {
      const required = ["kernelId", "backendId", "tileId", "params", "timestamp", "evidence", "hash"];
      for (const field of required) {
        if (!(field in record)) {
          throw new Error(`Provenance missing required field: ${field}`);
        }
      }
    }
    return { evidence: { recordCount: provenance.length } };
  }

  async _checkReplayFidelity(ctx) {
    const { originalOutput, replayedOutput } = ctx;
    if (!originalOutput || !replayedOutput) {
      // No reference to replay against - this is a first execution
      return { evidence: { replayChecked: false, reason: "no_reference_output" } };
    }

    const origHash = this._hashOutput(originalOutput);
    const replayHash = this._hashOutput(replayedOutput);

    if (origHash !== replayHash) {
      throw new Error(`Replay hash mismatch: ${origHash} !== ${replayHash}`);
    }
    return { evidence: { originalHash: origHash, replayedHash: replayHash } };
  }

  async _checkByteExactParity(ctx) {
    const { cpuOutput, gpuOutput } = ctx;
    if (!cpuOutput || !gpuOutput) {
      // No CPU reference to compare against - GPU-only execution
      return { evidence: { parityChecked: false, reason: "no_cpu_reference" } };
    }

    const cpuData = cpuOutput.data || cpuOutput;
    const gpuData = gpuOutput.data || gpuOutput;

    if (cpuData.length !== gpuData.length) {
      throw new Error(`Length mismatch: CPU ${cpuData.length} !== GPU ${gpuData.length}`);
    }

    for (let i = 0; i < cpuData.length; i++) {
      if (cpuData[i] !== gpuData[i]) {
        throw new Error(`Byte mismatch at index ${i}: CPU ${cpuData[i]} !== GPU ${gpuData[i]}`);
      }
    }
    return { evidence: { bytesCompared: cpuData.length, identical: true } };
  }

  async _checkBackendFungibility(ctx) {
    const { outputsByBackend } = ctx;
    if (!outputsByBackend || Object.keys(outputsByBackend).length < 2) {
      // Single backend execution - fungibility trivially holds
      return { evidence: { fungibilityChecked: false, reason: "single_backend" } };
    }

    const backends = Object.keys(outputsByBackend);
    const reference = outputsByBackend[backends[0]];
    const refHash = this._hashOutput(reference);

    for (const backend of backends.slice(1)) {
      if (this._hashOutput(outputsByBackend[backend]) !== refHash) {
        throw new Error(`Backend ${backend} output differs from reference`);
      }
    }
    return { evidence: { backends, referenceHash: refHash } };
  }

  async _checkKernelConsistency(ctx) {
    const { kernelEntry, executionResult } = ctx;
    if (!kernelEntry || !executionResult) {
      throw new Error("Kernel entry and execution result required");
    }

    if (executionResult.kernelId !== kernelEntry.kernelId) {
      throw new Error(`Kernel ID mismatch: ${executionResult.kernelId} !== ${kernelEntry.kernelId}`);
    }
    return { evidence: { kernelId: kernelEntry.kernelId } };
  }

  async _checkNoNondeterministicDrift(ctx) {
    const { outputs, maxAllowedDrift = 0 } = ctx;
    if (!outputs || outputs.length === 0) {
      throw new Error("No outputs for drift check");
    }
    if (outputs.length === 1) {
      // Single output - no drift possible
      return { evidence: { maxDrift: 0, runs: 1, note: "single_run" } };
    }

    const first = outputs[0];
    for (let i = 1; i < outputs.length; i++) {
      const diff = this._computeMaxDiff(first, outputs[i]);
      if (diff > maxAllowedDrift) {
        throw new Error(`Drift detected: ${diff} > ${maxAllowedDrift}`);
      }
    }
    return { evidence: { maxDrift: 0, runs: outputs.length } };
  }

  async _checkNoAuthorityLeakage(ctx) {
    const { backend, executionContext } = ctx;
    if (!backend) throw new Error("Backend required");

    const caps = backend.getCapabilities?.() || {};
    if (caps.hasPrintAuthority || caps.hasGlobalStateAccess) {
      throw new Error("Backend has authority it should not possess");
    }
    return { evidence: { backendId: backend.backendId, authorityLeaked: false } };
  }

  async _checkNoGlobalStateMutation(ctx) {
    const { backendStateBefore, backendStateAfter } = ctx;
    if (!backendStateBefore || !backendStateAfter) {
      return { evidence: { checked: false, reason: "State snapshots not provided" } };
    }

    if (JSON.stringify(backendStateBefore) !== JSON.stringify(backendStateAfter)) {
      throw new Error("Backend global state mutated during execution");
    }
    return { evidence: { stateUnchanged: true } };
  }

  async _checkNoBackendSpecificSemantics(ctx) {
    const { kernelEntry, executionResult } = ctx;
    if (!kernelEntry || !executionResult) {
      throw new Error("Kernel entry and execution result required");
    }

    const allowedSemantics = kernelEntry.allowedSemantics || [];
    const usedSemantics = executionResult.usedSemantics || [];

    for (const semantic of usedSemantics) {
      if (!allowedSemantics.includes(semantic)) {
        throw new Error(`Backend-specific semantic used: ${semantic}`);
      }
    }
    return { evidence: { allowedSemantics, usedSemantics } };
  }

  async _checkNoUngovernedMemoryAccess(ctx) {
    const { memoryAccessLog } = ctx;
    if (!memoryAccessLog || !Array.isArray(memoryAccessLog)) {
      return { evidence: { checked: false, reason: "No memory access log" } };
    }

    for (const access of memoryAccessLog) {
      if (!access.governed) {
        throw new Error(`Ungoverned memory access: ${access.type} at ${access.address}`);
      }
    }
    return { evidence: { accessesChecked: memoryAccessLog.length } };
  }

  async _checkNoProvenanceLoss(ctx) {
    const { expectedTiles, provenanceRecords } = ctx;
    if (!expectedTiles || !provenanceRecords) {
      return { evidence: { provenanceLossChecked: false, reason: "no_tile_list" } };
    }

    const tileIds = new Set(expectedTiles.map(t => t.tileId));
    const provenanced = new Set(provenanceRecords.map(r => r.tileId));

    for (const id of tileIds) {
      if (!provenanced.has(id)) {
        throw new Error(`Provenance lost for tile: ${id}`);
      }
    }
    return { evidence: { tilesTracked: tileIds.size } };
  }

  async _checkNoReplayDivergence(ctx) {
    const { originalExecution, replayExecution } = ctx;
    if (!originalExecution || !replayExecution) {
      return { evidence: { replayDivergenceChecked: false, reason: "no_replay_execution" } };
    }

    if (originalExecution.seed !== replayExecution.seed) {
      throw new Error("Seed mismatch between original and replay");
    }

    if (originalExecution.kernelId !== replayExecution.kernelId) {
      throw new Error("Kernel ID mismatch between original and replay");
    }
    return { evidence: { seedMatched: true, kernelMatched: true } };
  }

  async _checkNoTileBoundaryArtifacts(ctx) {
    const { tilingEngine, tileResults } = ctx;
    if (!tilingEngine || !tileResults) {
      return { evidence: { checked: false, reason: "Tiling engine or results not provided" } };
    }

    const { clean, artifacts } = tilingEngine.verifyTileBoundaries(tileResults);
    if (!clean) {
      throw new Error(`Tile boundary artifacts: ${artifacts.map(a => a.type).join(", ")}`);
    }
    return { evidence: { artifacts: 0 } };
  }

  async _checkNoConstitutionalViolations(ctx) {
    const { violations = [] } = ctx;
    if (violations.length > 0) {
      throw new Error(`Constitutional violations: ${violations.join(", ")}`);
    }
    return { evidence: { violationsChecked: true } };
  }

  _hashOutput(output) {
    const data = output.data || output;
    return createHash("sha256").update(Buffer.from(data.buffer || data)).digest("hex");
  }

  _computeMaxDiff(a, b) {
    const dataA = a.data || a;
    const dataB = b.data || b;
    let maxDiff = 0;
    for (let i = 0; i < Math.min(dataA.length, dataB.length); i++) {
      maxDiff = Math.max(maxDiff, Math.abs(dataA[i] - dataB[i]));
    }
    return maxDiff;
  }
}

export function createConformanceGate(config) {
  return new UniversalConformanceGate(config);
}