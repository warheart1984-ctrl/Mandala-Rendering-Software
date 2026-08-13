/**
 * Sovereign X Router - Parallel CPU Benchmark Suite
 * Runs scaling experiment: 1→2→4→8→16→32→56 threads
 * Verifies determinism: byte-identical output across all worker counts
 */

import { discoverCpuTopology, generateScalingSeries, computeWorkerTopology } from "./cpuTopology.js";
import { ParallelRenderer } from "./parallelRenderer.js";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

async function runScalingBenchmark() {
  console.log("=== Sovereign X Router - CPU Parallel Scaling Benchmark ===\n");

  // Discover topology
  const topology = discoverCpuTopology();
  console.log("CPU Topology:");
  console.log(`  Logical processors: ${topology.logicalProcessors}`);
  console.log(`  Physical cores: ${topology.physicalCores}`);
  console.log(`  Sockets: ${topology.sockets}`);
  console.log(`  Threads per core: ${topology.threadsPerCore}`);
  console.log(`  NUMA nodes: ${topology.numaNodes}`);
  console.log(`  Model: ${topology.model}`);
  console.log(`  Vendor: ${topology.vendor}`);
  console.log("");

  // Generate scaling series
  const scalingSeries = generateScalingSeries(topology);
  console.log(`Scaling series: ${scalingSeries.join(" → ")}`);
  console.log("");

  // Base config
  const baseConfig = {
    prompt: "tesseract lattice cyan",
    width: 256,
    height: 256,
    samples: 4,
    maxDepth: 3,
    seed: 3322933546,
    tileSize: 64,
    workers: 1,
  };

  const totalPixels = baseConfig.width * baseConfig.height;
  const totalSamples = totalPixels * baseConfig.samples;

  const results = [];
  let baselineTime = null;
  let baselineSha256 = null;

  for (const workers of scalingSeries) {
    const workerTopology = computeWorkerTopology({ ...topology, logicalProcessors: workers }, "core");
    const actualWorkers = Math.min(workers, workerTopology.workers);
    
    console.log(`\n→ ${actualWorkers} workers (${workerTopology.threadsPerWorker} threads/worker, ${workerTopology.affinity})...`);

    const renderer = new ParallelRenderer({
      ...baseConfig,
      workers: actualWorkers,
    });

    const result = await renderer.render();

    const timeMs = result.timeMs;
    const sha256 = result.sha256;
    const pixelsPerSec = (totalPixels / timeMs) * 1000;
    const samplesPerSec = (totalSamples / timeMs) * 1000;

    if (baselineTime === null) {
      baselineTime = timeMs;
      baselineSha256 = sha256;
    }

    const speedup = baselineTime / timeMs;
    const efficiency = (speedup / actualWorkers) * 100;

    const benchResult = {
      workers: actualWorkers,
      threadsPerWorker: workerTopology.threadsPerWorker,
      affinity: workerTopology.affinity,
      timeMs,
      tileTimes: result.tileTimes,
      sha256,
      pixelsPerSec,
      samplesPerSec,
      speedup,
      efficiency,
    };

    results.push(benchResult);

    const deterministic = sha256 === baselineSha256 ? "✅" : "❌ MISMATCH!";
    
    console.log(`   Time: ${(timeMs / 1000).toFixed(2)}s`);
    console.log(`   Pixels/sec: ${(pixelsPerSec / 1e6).toFixed(2)} Mpx/s`);
    console.log(`   Samples/sec: ${(samplesPerSec / 1e6).toFixed(2)} Ms/s`);
    console.log(`   Speedup: ${speedup.toFixed(2)}x`);
    console.log(`   Efficiency: ${efficiency.toFixed(1)}%`);
    console.log(`   SHA256: ${sha256.slice(0, 16)}... ${deterministic}`);
  }

  // Summary table
  console.log("\n=== SCALING RESULTS ===");
  console.log("Workers | Time (s) | Mpx/s   | Ms/s    | Speedup | Efficiency | Deterministic");
  console.log("--------|----------|---------|---------|---------|------------|---------------");
  for (const r of results) {
    const det = r.sha256 === baselineSha256 ? "✅" : "❌";
    console.log(
      `${String(r.workers).padStart(7)} | ${(r.timeMs / 1000).toFixed(2).padStart(8)} | ` +
      `${(r.pixelsPerSec / 1e6).toFixed(2).padStart(7)} | ${(r.samplesPerSec / 1e6).toFixed(2).padStart(7)} | ` +
      `${r.speedup.toFixed(2).padStart(7)}x | ${r.efficiency.toFixed(1).padStart(10)}% | ${det}`
    );
  }

  // All deterministic?
  const allDeterministic = results.every(r => r.sha256 === baselineSha256);
  console.log(`\nDeterminism verified: ${allDeterministic ? "✅ ALL CONFIGURATIONS PRODUCE IDENTICAL OUTPUT" : "❌ MISMATCH DETECTED"}`);

  // Save results
  const output = {
    topology,
    baseConfig,
    results,
    allDeterministic,
    timestamp: new Date().toISOString(),
  };
  writeFileSync("G:\\Mandala Rendering Software\\tmp\\scaling_benchmark.json", JSON.stringify(output, null, 2));
  console.log("\nResults saved to scaling_benchmark.json");

  // Generate ASCII scaling curve
  console.log("\n=== SCALING CURVE (throughput) ===");
  const maxMpx = Math.max(...results.map(r => r.pixelsPerSec / 1e6));
  console.log("Mpx/s");
  for (let level = maxMpx; level >= 0; level -= 0.5) {
    let line = `${level.toFixed(1).padStart(5)} │`;
    for (const r of results) {
      const val = r.pixelsPerSec / 1e6;
      line += val >= level ? " █" : "  ";
    }
    console.log(line);
  }
  console.log("       └" + "──".repeat(results.length) + "► workers");
  console.log("        " + results.map(r => String(r.workers).padStart(2)).join(" "));
}

runScalingBenchmark().catch(console.error);