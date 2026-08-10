/**
 * UALS v1.0 — Orchestrator
 * Constitutional delegation coordinator
 */

import { createHash } from "node:crypto";
import { AssistBackendInterface } from "../abi/AssistBackendInterface.js";
import { KernelRegistry, defaultKernelRegistry } from "../kernel-registry/KernelRegistry.js";
import { TilingEngine } from "../tiling-engine/TilingEngine.js";
import { UniversalConformanceGate } from "../conformance-gate/UniversalConformanceGate.js";
import { UALSError, ERROR_CODES, createProvenanceRecord, hashProvenance } from "../types.js";

export class UALSOrchestrator {
  constructor(config = {}) {
    this.kernelRegistry = config.kernelRegistry || defaultKernelRegistry;
    this.tilingEngine = config.tilingEngine || new TilingEngine(config.tiling);
    this.conformanceGate = config.conformanceGate || new UniversalConformanceGate(config.conformance);
    this.referenceExecutor = config.referenceExecutor || null;
    this.backends = new Map();
    this.activeBackend = null;
    this.executionHistory = [];
  }

  registerBackend(backend) {
    if (!(backend instanceof AssistBackendInterface)) {
      throw new UALSError(ERROR_CODES.INVALID_CONFIG, "Backend must implement AssistBackendInterface");
    }
    this.backends.set(backend.backendId, backend);
    return backend;
  }

  async initializeBackend(backendId, context = {}) {
    const backend = this.backends.get(backendId);
    if (!backend) {
      throw new UALSError(ERROR_CODES.INVALID_CONFIG, `Backend ${backendId} not registered`);
    }

    const result = await backend.init(context);
    this.activeBackend = backend;
    return result;
  }

  async _dispatch(kernelId, params, outputWidth, outputHeight, kernelEntry, useTiling) {
    let executionResult;

    if (useTiling) {
      executionResult = await this.tilingEngine.executeTiled(
        this.activeBackend,
        kernelId,
        params,
        outputWidth,
        outputHeight,
        { kernelEntry }
      );
      executionResult.kernelId = kernelId;
    } else {
      const tile = { tileId: "tile-0-0", x: 0, y: 0, width: outputWidth, height: outputHeight };
      const executeResult = await this.activeBackend.execute(kernelId, params, tile);
      const readbackResult = await this.activeBackend.readback(executeResult);

      const prov = createProvenanceRecord(
        kernelId,
        this.activeBackend.backendId,
        "tile-0-0",
        params,
        { outputHash: this._hashOutput(readbackResult.output) }
      );
      prov.hash = hashProvenance(prov);

      executionResult = {
        output: readbackResult.output,
        tiles: [{
          tile: "tile-0-0",
          tileIndex: { x: 0, y: 0 },
          output: readbackResult.output,
          metadata: executeResult.metadata,
          provenance: prov,
        }],
        provenance: [prov],
        metadata: {
          tileCount: 1,
          outputWidth,
          outputHeight,
        },
        kernelId,
      };
    }

    return executionResult;
  }

  async _referenceOutput(kernelId, params, options) {
    if (options.referenceOutput) {
      return { output: options.referenceOutput, source: "options.referenceOutput" };
    }
    if (this.referenceExecutor) {
      const result = await this.referenceExecutor.execute(kernelId, params);
      return { output: result.output, source: "config.referenceExecutor" };
    }
    return { output: null, source: null };
  }

  async execute(kernelId, params, options = {}) {
    if (!this.activeBackend) {
      throw new UALSError(ERROR_CODES.INVALID_CONFIG, "No active backend. Call initializeBackend first.");
    }

    const kernelEntry = this.kernelRegistry.get(kernelId);
    if (!kernelEntry) {
      throw new UALSError(ERROR_CODES.KERNEL_NOT_FOUND, `Kernel ${kernelId} not found in registry`);
    }

    if (!kernelEntry.backends.includes(this.activeBackend.backendType)) {
      throw new UALSError(ERROR_CODES.KERNEL_INCOMPATIBLE, `Kernel ${kernelId} not compatible with backend ${this.activeBackend.backendType}`);
    }

    const outputWidth = params.width || kernelEntry.maxTileSize.width;
    const outputHeight = params.height || kernelEntry.maxTileSize.height;

    const useTiling = options.useTiling !== false && (outputWidth > kernelEntry.maxTileSize.width || outputHeight > kernelEntry.maxTileSize.height);

    const executionResult = await this._dispatch(kernelId, params, outputWidth, outputHeight, kernelEntry, useTiling);

    const reference = await this._referenceOutput(kernelId, params, options);

    // Conformance outputs: current run + prior run(s) of the same kernel/backend.
    // When no prior run exists, one extra dispatch probes determinism honestly.
    const outputs = [executionResult.output];
    let probed = false;
    const prior = this.executionHistory.find(
      (r) =>
        r.kernelId === kernelId &&
        r.backendId === this.activeBackend.backendId &&
        JSON.stringify(r.params) === JSON.stringify(params)
    );
    if (prior) {
      outputs.push(prior.executionResult.output);
    } else {
      const probeResult = await this._dispatch(kernelId, params, outputWidth, outputHeight, kernelEntry, useTiling);
      outputs.push(probeResult.output);
      probed = true;
    }

    const expectedTiles = executionResult.tiles.map((t) => ({ tileId: t.tile }));
    const provenanceRecords = executionResult.provenance;
    const bytesPerChannel = executionResult.output?.bytesPerChannel;
    const expectedRange = bytesPerChannel === 1 ? [0, 255] : [0, 1];

    const outputsByBackend = {};
    if (this.activeBackend.backendId) {
      outputsByBackend[`gpu-${this.activeBackend.backendId}`] = executionResult.output;
    }
    if (reference.output) {
      outputsByBackend[reference.source] = reference.output;
    }

    const originalExecution = options.replayTarget
      ? { seed: options.replayTarget.params?.seed, kernelId }
      : { seed: params.seed, kernelId };
    const replayExecution = { seed: params.seed, kernelId };

    const conformanceContext = {
      kernelEntry,
      executionResult,
      backend: this.activeBackend,
      tilingEngine: this.tilingEngine,
      tileResults: executionResult.tiles,
      outputs,
      runs: 2,
      output: executionResult.output,
      expectedRange,
      provenance: provenanceRecords,
      originalOutput: reference.output,
      replayedOutput: executionResult.output,
      cpuOutput: reference.output,
      gpuOutput: executionResult.output,
      outputsByBackend,
      originalExecution,
      replayExecution,
      expectedTiles,
      provenanceRecords,
      memoryAccessLog: this.activeBackend.getMemoryAccessLog?.() ?? undefined,
      backendStateBefore: this.activeBackend.getStateSnapshot?.() ?? undefined,
      backendStateAfter: this.activeBackend.getStateSnapshot?.() ?? undefined,
      violations: [],
    };

    const conformanceResult = await this.conformanceGate.runAll(conformanceContext);

    const record = {
      ualsVersion: "1.0",
      timestamp: Date.now(),
      kernelId,
      backendId: this.activeBackend.backendId,
      params,
      executionResult,
      conformanceResult,
      conformanceNotes: {
        determinismProbe: probed,
        referenceSource: reference.source,
        expectedRange,
      },
      success: conformanceResult.success,
    };

    this.executionHistory.push(record);

    if (!conformanceResult.success && this.conformanceGate.strictMode) {
      throw new UALSError(ERROR_CODES.CONFORMANCE_FAILED, `Conformance failed: ${conformanceResult.total - conformanceResult.passed}/${conformanceResult.total} checks failed`);
    }

    return {
      output: executionResult.output,
      provenance: executionResult.provenance,
      conformance: conformanceResult,
      conformanceNotes: record.conformanceNotes,
      metadata: executionResult.metadata,
    };
  }

  async replay(executionRecord) {
    const { kernelId, params, seed } = executionRecord;
    const replayParams = { ...params, seed: seed || params.seed };

    return await this.execute(kernelId, replayParams, {
      referenceOutput: executionRecord.executionResult?.output,
      replayTarget: executionRecord,
      useTiling: executionRecord.executionResult?.metadata?.tileCount > 1,
    });
  }

  getHistory() {
    return [...this.executionHistory];
  }

  getBackend(backendId) {
    return this.backends.get(backendId) || null;
  }

  getActiveBackend() {
    return this.activeBackend;
  }

  getKernelRegistry() {
    return this.kernelRegistry;
  }

  getTilingEngine() {
    return this.tilingEngine;
  }

  getConformanceGate() {
    return this.conformanceGate;
  }

  _hashOutput(output) {
    const data = output.data || output;
    return createHash("sha256").update(Buffer.from(data.buffer || data)).digest("hex");
  }
}

export function createOrchestrator(config) {
  return new UALSOrchestrator(config);
}