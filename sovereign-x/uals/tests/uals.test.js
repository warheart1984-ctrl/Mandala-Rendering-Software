/**
 * UALS v1.0 — Test Suite
 * Tests for all UALS components
 */

import assert from "node:assert";
import { describe, it, before, after } from "node:test";
import {
  UALSOrchestrator,
  AssistBackendInterface,
  KernelRegistry,
  TilingEngine,
  UniversalConformanceGate,
  OpenCLLegacyStillBackend,
  defaultKernelRegistry,
  CONFORMANCE_CHECKS,
  ERROR_CODES,
} from "../index.js";
import { UALSError } from "../types.js";

describe("UALS Types", () => {
  it("should export all required types", () => {
    assert.ok(UALSOrchestrator);
    assert.ok(AssistBackendInterface);
    assert.ok(KernelRegistry);
    assert.ok(TilingEngine);
    assert.ok(UniversalConformanceGate);
    assert.ok(OpenCLLegacyStillBackend);
    assert.ok(defaultKernelRegistry);
  });

  it("should have 16 conformance checks defined", () => {
    assert.strictEqual(CONFORMANCE_CHECKS.length, 16);
  });
});

describe("AssistBackendInterface", () => {
  it("should reject invalid backend type", () => {
    const backend = new AssistBackendInterface({ backendType: "invalid" });
    assert.throws(() => backend.validateBackendType(), /Invalid backend type/);
  });

  it("should reject invalid determinism level", () => {
    const backend = new AssistBackendInterface({ determinismLevel: "invalid" });
    assert.throws(() => backend.validateDeterminismLevel(), /Invalid determinism level/);
  });

  it("should throw on uninitialized execute", async () => {
    const backend = new AssistBackendInterface({ backendType: "opencl" });
    await assert.rejects(
      backend.execute("test_kernel", {}),
      /not initialized/
    );
  });

  it("should track supported kernels", () => {
    const backend = new AssistBackendInterface({
      backendType: "opencl",
      supportedKernels: ["kernel_a", "kernel_b"],
    });
    assert.ok(backend.supportsKernel("kernel_a"));
    assert.ok(!backend.supportsKernel("kernel_c"));
  });
});

describe("KernelRegistry", () => {
  let registry;

  before(() => {
    registry = new KernelRegistry();
  });

  after(() => {
    registry.clear();
  });

  it("should register and retrieve kernels", () => {
    registry.register({
      kernelId: "test_kernel",
      category: "still",
      backends: ["opencl"],
      qualityTier: "baseline",
      determinismGuarantee: "bit-exact",
      conformanceProfile: ["determinism"],
      replayMetadata: { deterministic: true },
      provenanceSchema: { required: ["kernelId"] },
    });

    const entry = registry.get("test_kernel");
    assert.ok(entry);
    assert.strictEqual(entry.kernelId, "test_kernel");
    assert.strictEqual(entry.category, "still");
  });

  it("should reject duplicate kernel IDs", () => {
    assert.throws(() => {
      registry.register({
        kernelId: "test_kernel",
        category: "still",
        backends: ["opencl"],
        qualityTier: "baseline",
        determinismGuarantee: "bit-exact",
        conformanceProfile: ["determinism"],
        replayMetadata: { deterministic: true },
        provenanceSchema: { required: ["kernelId"] },
      });
    }, /already registered/);
  });

  it("should filter by backend", () => {
    const results = registry.getByBackend("opencl");
    assert.ok(results.length > 0);
    for (const r of results) {
      assert.ok(r.backends.includes("opencl"));
    }
  });

  it("should select best kernel by quality", () => {
    registry.register({
      kernelId: "ultra_kernel",
      category: "still",
      backends: ["opencl"],
      qualityTier: "ultra",
      determinismGuarantee: "bit-exact",
      conformanceProfile: ["determinism"],
      replayMetadata: { deterministic: true },
      provenanceSchema: { required: ["kernelId"] },
    });

    const best = registry.selectBest("still", { backend: "opencl" });
    assert.strictEqual(best.kernelId, "ultra_kernel");
  });

  it("should serialize and deserialize", () => {
    const json = registry.toJSON();
    const restored = KernelRegistry.fromJSON(json);
    assert.strictEqual(restored.kernels.size, registry.kernels.size);
  });
});

describe("defaultKernelRegistry", () => {
  it("should have legacy_still kernels registered", () => {
    const k256 = defaultKernelRegistry.get("legacy_still_256");
    const k512 = defaultKernelRegistry.get("legacy_still_512");
    assert.ok(k256);
    assert.ok(k512);
    assert.strictEqual(k256.category, "still");
    assert.strictEqual(k512.category, "still");
  });

  it("should have all 16 conformance checks in profile", () => {
    const k256 = defaultKernelRegistry.get("legacy_still_256");
    assert.strictEqual(k256.conformanceProfile.length, 16);
  });
});

describe("TilingEngine", () => {
  let engine;

  before(() => {
    engine = new TilingEngine({ defaultTileSize: { width: 256, height: 256 } });
  });

  it("should compute tiles for exact fit", () => {
    const tiles = engine.computeTiles(512, 512, { width: 256, height: 256 });
    assert.strictEqual(tiles.length, 4);
    assert.strictEqual(tiles[0].width, 256);
    assert.strictEqual(tiles[0].height, 256);
  });

  it("should compute tiles for partial fit", () => {
    const tiles = engine.computeTiles(300, 300, { width: 256, height: 256 });
    assert.strictEqual(tiles.length, 4);
    assert.ok(tiles.some(t => t.width < 256));
    assert.ok(tiles.some(t => t.height < 256));
  });

  it("should reject too many tiles", () => {
    const smallEngine = new TilingEngine({ maxTiles: 4 });
    assert.throws(() => {
      smallEngine.computeTiles(1000, 1000, { width: 256, height: 256 });
    }, /exceeds maxTiles/);
  });

  it("should verify tile boundaries", () => {
    const mockResults = [
      {
        tile: { x: 0, y: 0, width: 256, height: 256 },
        tileIndex: { x: 0, y: 0 },
        output: { data: new Uint8ClampedArray(256 * 256 * 4), width: 256, height: 256, channels: 4 },
      },
      {
        tile: { x: 256, y: 0, width: 256, height: 256 },
        tileIndex: { x: 1, y: 0 },
        output: { data: new Uint8ClampedArray(256 * 256 * 4), width: 256, height: 256, channels: 4 },
      },
    ];

    const result = engine.verifyTileBoundaries(mockResults);
    assert.ok(result.clean);
    assert.strictEqual(result.artifacts.length, 0);
  });
});

describe("UniversalConformanceGate", () => {
  let gate;

  before(() => {
    gate = new UniversalConformanceGate({ strictMode: false });
  });

  it("should have all 16 checks registered", () => {
    for (const check of CONFORMANCE_CHECKS) {
      assert.ok(gate.checks.has(check), `Missing check: ${check}`);
    }
  });

  it("should pass determinism check with identical outputs", async () => {
    const output = { data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]) };
    const ctx = { outputs: [output, output, output], runs: 3 };
    const result = await gate.runCheck("determinism", ctx);
    assert.ok(result.pass);
  });

  it("should fail determinism check with different outputs", async () => {
    const output1 = { data: new Uint8ClampedArray([1, 2, 3, 4]) };
    const output2 = { data: new Uint8ClampedArray([1, 2, 3, 5]) };
    const ctx = { outputs: [output1, output2], runs: 2 };
    const result = await gate.runCheck("determinism", ctx);
    assert.ok(!result.pass);
    assert.ok(result.reason.includes("differs"));
  });

  it("should pass byte_exact_parity with identical CPU/GPU", async () => {
    const data = new Uint8ClampedArray([10, 20, 30, 40, 50, 60, 70, 80]);
    const ctx = { cpuOutput: { data }, gpuOutput: { data } };
    const result = await gate.runCheck("byte_exact_parity", ctx);
    assert.ok(result.pass);
  });

  it("should fail byte_exact_parity with different CPU/GPU", async () => {
    const ctx = {
      cpuOutput: { data: new Uint8ClampedArray([1, 2, 3, 4]) },
      gpuOutput: { data: new Uint8ClampedArray([1, 2, 3, 5]) },
    };
    const result = await gate.runCheck("byte_exact_parity", ctx);
    assert.ok(!result.pass);
    assert.ok(result.reason.includes("Byte mismatch"));
  });

  it("should pass provenance_integrity with complete records", async () => {
    const ctx = {
      provenance: [
        { kernelId: "k1", backendId: "b1", tileId: "t1", params: {}, timestamp: 1, evidence: {}, hash: "abc" },
      ],
    };
    const result = await gate.runCheck("provenance_integrity", ctx);
    assert.ok(result.pass);
  });

  it("should run all checks and return summary", async () => {
    const output = { data: new Uint8ClampedArray([1, 2, 3, 4]) };
    const mockBackend = {
      backendId: "mock",
      getCapabilities: () => ({ hasPrintAuthority: false, hasGlobalStateAccess: false }),
    };
    const ctx = {
      outputs: [output, output],
      runs: 2,
      output: output,
      provenance: [{ kernelId: "k", backendId: "b", tileId: "t", params: {}, timestamp: 1, evidence: {}, hash: "h" }],
      cpuOutput: output,
      gpuOutput: output,
      outputsByBackend: { "mock": output, "reference": output },
      kernelEntry: { kernelId: "k", allowedSemantics: [] },
      executionResult: { kernelId: "k", usedSemantics: [] },
      backend: mockBackend,
      originalExecution: { seed: 1, kernelId: "k" },
      replayExecution: { seed: 1, kernelId: "k" },
      expectedTiles: [{ tileId: "t" }],
      provenanceRecords: [{ tileId: "t" }],
      tilingEngine: new (await import("../tiling-engine/TilingEngine.js")).TilingEngine(),
      tileResults: [],
      memoryAccessLog: [],
      violations: [],
      maxAllowedDrift: 0,
      backendStateBefore: {},
      backendStateAfter: {},
    };
    const result = await gate.runAll(ctx);
    assert.ok(result.success);
    assert.strictEqual(result.passed, 16);
    assert.strictEqual(result.total, 16);
  });
});

describe("UALSOrchestrator", () => {
  let orchestrator;
  let mockBackend;

  function makeStillOutput(width, height, seed) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i++) {
      data[i] = (seed || 1) * 10 + (i % 256);
    }
    return { data, width, height, channels: 4, bytesPerChannel: 1 };
  }

  const referenceExecutor = {
    async execute(kernelId, params) {
      const width = params.width || 256;
      const height = params.height || 256;
      return { output: makeStillOutput(width, height, params.seed) };
    },
  };

  before(() => {
    orchestrator = new UALSOrchestrator({ referenceExecutor });

    class MockBackend extends AssistBackendInterface {
      constructor() {
        super({ backendType: "opencl", backendId: "mock-opencl", supportedKernels: ["legacy_still_256"] });
        this.initCalled = false;
        this.executeCalled = false;
        this.lastExecuteOutput = null;
      }

      async _doInit(context) {
        this.initCalled = true;
        return { success: true };
      }

      async _doExecute(kernelId, params, tile) {
        this.executeCalled = true;
        const output = makeStillOutput(tile.width, tile.height, params.seed);
        this.lastExecuteOutput = output;
        return {
          output,
          metadata: { tileId: tile.tileId },
          executionTimeMs: 1,
        };
      }

      async _doReadback() { 
        return { output: this.lastExecuteOutput, success: true }; 
      }
      async _doTeardown() { return { success: true }; }
    }

    mockBackend = new MockBackend();
    orchestrator.registerBackend(mockBackend);
  });

  it("should initialize backend", async () => {
    const result = await orchestrator.initializeBackend("mock-opencl");
    assert.ok(result.success);
    assert.ok(mockBackend.initCalled);
  });

  it("should execute kernel and run conformance", async () => {
    const result = await orchestrator.execute("legacy_still_256", { width: 256, height: 256, seed: 1.0 });
    assert.ok(result.output);
    assert.ok(result.conformance);
    assert.ok(result.conformance.success);
    assert.ok(mockBackend.executeCalled);
  });

  it("should reject unknown kernel", async () => {
    await assert.rejects(
      orchestrator.execute("unknown_kernel", {}),
      /not found/
    );
  });

  it("should track execution history", async () => {
    await orchestrator.execute("legacy_still_256", { width: 256, height: 256, seed: 2.0 });
    const history = orchestrator.getHistory();
    assert.strictEqual(history.length, 2);
  });

  it("should replay execution", async () => {
    const original = await orchestrator.execute("legacy_still_256", { width: 256, height: 256, seed: 3.0 });
    const replayed = await orchestrator.replay(orchestrator.getHistory()[orchestrator.getHistory().length - 1]);
    assert.ok(replayed.output);
    assert.ok(replayed.conformance.success);
  });
});

describe("OpenCLLegacyStillBackend", () => {
  it("should export constructor", () => {
    assert.ok(OpenCLLegacyStillBackend);
    assert.ok(typeof OpenCLLegacyStillBackend === "function");
  });

  it("should create instance with default config", () => {
    const backend = new OpenCLLegacyStillBackend();
    assert.strictEqual(backend.backendType, "opencl");
    assert.ok(backend.supportedKernels.has("legacy_still_256"));
    assert.ok(backend.supportedKernels.has("legacy_still_512"));
  });
});