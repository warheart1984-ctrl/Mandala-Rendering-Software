/**
 * Axiom-X Benchmark Conformance Runner
 *
 * Loads the UALS UniversalConformanceGate (SoT) from sovereign-x/uals and
 * runs all 16 constitutional checks against a measured benchmark context,
 * so every benchmark run carries a recorded conformance verdict.
 *
 * Usage:
 *   node run_uals_conformance.mjs <context.json> <results.json>
 *
 * Context JSON (produced by bench_legacy_still.py):
 *   kernelId, backendId, width, height, seed,
 *   gpuOutputB64, gpuRepeatOutputB64, cpuOutputB64,
 *   expectedRange, caps, backendState, allowedSemantics, usedSemantics,
 *   memoryAccessLog, provenanceParams, provenanceEvidence
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

// The UALS gate calls bare `require` at runtime (node:crypto) while the repo
// is "type": "module". Polyfill the global so the gate itself stays untouched.
globalThis.require = createRequire(import.meta.url);

import { createConformanceGate } from "../../sovereign-x/uals/conformance-gate/UniversalConformanceGate.js";
import { createProvenanceRecord, hashProvenance } from "../../sovereign-x/uals/types.js";
import { createTilingEngine } from "../../sovereign-x/uals/tiling-engine/TilingEngine.js";

function toUint8(b64) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

const [, , contextPath, resultsPath] = process.argv;
if (!contextPath || !resultsPath) {
  console.error("Usage: node run_uals_conformance.mjs <context.json> <results.json>");
  process.exit(2);
}

const ctx = JSON.parse(readFileSync(contextPath, "utf8"));

const gpuOutput = toUint8(ctx.gpuOutputB64);
const gpuRepeatOutput = toUint8(ctx.gpuRepeatOutputB64);
const cpuOutput = toUint8(ctx.cpuOutputB64);
const outputs = [gpuOutput, gpuRepeatOutput];

const prov = createProvenanceRecord(
  ctx.kernelId,
  ctx.backendId,
  "full-frame",
  ctx.provenanceParams,
  ctx.provenanceEvidence,
);
prov.hash = hashProvenance(prov);
const provenanceRecords = [prov];

const fullFrameTile = {
  tileId: "full-frame",
  x: 0,
  y: 0,
  width: ctx.width,
  height: ctx.height,
  tileIndex: { x: 0, y: 0 },
  gridSize: { x: 1, y: 1 },
};

const executionContext = {
  outputs,
  runs: 2,
  output: gpuOutput,
  expectedRange: ctx.expectedRange,
  provenance: provenanceRecords,
  originalOutput: gpuOutput,
  replayedOutput: gpuRepeatOutput,
  cpuOutput,
  gpuOutput,
  outputsByBackend: {
    "opencl-gpu": gpuOutput,
    "python-numpy-reference": cpuOutput,
  },
  kernelEntry: {
    kernelId: ctx.kernelId,
    allowedSemantics: ctx.allowedSemantics,
  },
  executionResult: {
    kernelId: ctx.kernelId,
    usedSemantics: ctx.usedSemantics,
  },
  backend: {
    backendId: ctx.backendId,
    getCapabilities: () => ctx.caps,
  },
  backendStateBefore: ctx.backendState,
  backendStateAfter: ctx.backendState,
  memoryAccessLog: ctx.memoryAccessLog,
  expectedTiles: [fullFrameTile],
  provenanceRecords,
  originalExecution: { seed: ctx.seed, kernelId: ctx.kernelId },
  replayExecution: { seed: ctx.seed, kernelId: ctx.kernelId },
  tilingEngine: createTilingEngine({ defaultTileSize: { width: 256, height: 256 } }),
  tileResults: [
    {
      tile: fullFrameTile,
      output: {
        data: gpuOutput,
        width: ctx.width,
        height: ctx.height,
        channels: 4,
        bytesPerChannel: 1,
      },
    },
  ],
  violations: [],
};

const gate = createConformanceGate({ strictMode: false });
const result = await gate.runAll(executionContext);
result.gateSource = "sovereign-x/uals/conformance-gate/UniversalConformanceGate.js";
writeFileSync(resultsPath, JSON.stringify(result, null, 2));

console.log(`Conformance gate: ${result.passed}/${result.total} passed`);
if (!result.success) {
  for (const [name, r] of Object.entries(result.results)) {
    if (!r.pass) console.error(`  FAIL ${name}: ${r.reason ?? "unknown"}`);
  }
  process.exitCode = 1;
}
