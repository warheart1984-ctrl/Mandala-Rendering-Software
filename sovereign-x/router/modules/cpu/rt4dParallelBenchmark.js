/**
 * RT4D Multi-Frame Parallel Benchmark Runner
 * Tests 1, 2, 4, 8 workers with real RT4D path tracer.
 */

import { Worker } from "node:worker_threads";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { readFileSync } from "node:fs";

async function runRt4dParallelBenchmark() {
  console.log("=== Sovereign X Router - RT4D Multi-Frame Parallel Benchmark ===\n");

  // Config
  const baseConfig = {
    prompt: "tesseract lattice cyan",
    width: 256,
    height: 256,
    samples: 4,
    maxDepth: 3,
    seed: 3322933546,
  };

  const totalPixels = baseConfig.width * baseConfig.height;
  const totalSamplesPerFrame = totalPixels * baseConfig.samples;

  const workerCounts = [1, 2, 4, 8];
  const framesPerTest = 4; // 4 frames per test

  const results = [];
  let baselineTime = null;

  for (const workers of workerCounts) {
    console.log(`\n→ ${workers} worker(s), ${framesPerTest} frames...`);

    const workerScript = join("G:", "Mandala Rendering Software", "sovereign-x", "router", "modules", "cpu", "rt4dFrameWorker.js");
    const workers_list = [];
    const frameResults = [];
    let completed = 0;
    const startTime = process.hrtime.bigint();

    // Create workers
    for (let i = 0; i < workers; i++) {
      const worker = new Worker(workerScript);
      workers_list.push(worker);
      worker.on("message", (msg) => {
        frameResults.push(msg);
        completed++;
      });
      worker.on("error", (err) => console.error(`Worker ${i} error:`, err));
    }

    // Dispatch frames
    for (let f = 0; f < framesPerTest; f++) {
      const worker = workers_list[f % workers];
      worker.postMessage({ 
        frameIndex: f, 
        config: { ...baseConfig } 
      });
    }

    // Wait for completion
    await new Promise((resolve) => {
      const check = () => {
        if (completed >= framesPerTest) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });

    // Terminate workers
    for (const w of workers_list) {
      await w.terminate();
    }

    const endTime = process.hrtime.bigint();
    const totalTimeMs = Number(endTime - startTime) / 1e6;

    // Verify outputs and collect timing
    const frameTimes = [];
    const shas256 = [];
    
    for (const msg of frameResults) {
      if (msg.error) {
        console.error(`  Frame ${msg.frameIndex} error: ${msg.error}`);
        continue;
      }
      frameTimes.push(msg.timeMs);
      
      // Read PNG and compute SHA256
      try {
        const pngBuffer = readFileSync(msg.outputPath);
        const sha256 = createHash("sha256").update(pngBuffer).digest("hex");
        shas256.push(sha256);
      } catch {
        shas256.push("ERROR");
      }
    }

    if (frameTimes.length === 0) {
      console.log("  No frames completed successfully");
      continue;
    }

    const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const framesPerSec = (framesPerTest / totalTimeMs) * 1000;
    const samplesPerSec = (framesPerTest * totalSamplesPerFrame / totalTimeMs) * 1000;

    if (baselineTime === null) {
      baselineTime = totalTimeMs;
    }

    const speedup = baselineTime / totalTimeMs;
    const efficiency = (speedup / workers) * 100;

    const result = {
      workers,
      frames: framesPerTest,
      timeMs: totalTimeMs,
      framesPerSec,
      samplesPerSec,
      speedup,
      efficiency,
      frameTimes,
      shas256,
    };

    results.push(result);

    console.log(`   Total: ${(totalTimeMs / 1000).toFixed(1)}s`);
    console.log(`   Avg frame: ${(avgFrameTime / 1000).toFixed(1)}s`);
    console.log(`   Frames/sec: ${framesPerSec.toFixed(2)}`);
    console.log(`   Samples/sec: ${(samplesPerSec / 1e6).toFixed(2)} Ms/s`);
    console.log(`   Speedup: ${speedup.toFixed(2)}x`);
    console.log(`   Efficiency: ${efficiency.toFixed(1)}%`);
    console.log(`   SHA256s: ${shas256.map(s => s.slice(0, 8)).join(", ")}`);
  }

  // Summary
  console.log("\n=== RT4D MULTI-FRAME PARALLEL RESULTS ===");
  console.log("Workers | Total(s) | Frames/s | Ms/s   | Speedup | Efficiency");
  console.log("--------|----------|----------|--------|---------|------------");
  for (const r of results) {
    console.log(
      `${String(r.workers).padStart(7)} | ${(r.timeMs / 1000).toFixed(1).padStart(8)} | ` +
      `${r.framesPerSec.toFixed(2).padStart(8)} | ${(r.samplesPerSec / 1e6).toFixed(2).padStart(6)} | ` +
      `${r.speedup.toFixed(2).padStart(7)}x | ${r.efficiency.toFixed(1).padStart(10)}%`
    );
  }

  // Save
  writeFileSync("G:\\Mandala Rendering Software\\tmp\\rt4d_parallel_benchmark.json", JSON.stringify(results, null, 2));
  console.log("\nResults saved to rt4d_parallel_benchmark.json");
}

runRt4dParallelBenchmark().catch(console.error);