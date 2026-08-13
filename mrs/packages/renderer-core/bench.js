/**
 * RT4D Benchmark Runner
 * Runs multiple configurations and captures timing.
 */

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const configs = [
  { name: "draft_256", width: 256, height: 256, samples: 4, maxDepth: 3, prompt: "tesseract lattice cyan" },
  { name: "final_256", width: 256, height: 256, samples: 8, maxDepth: 5, prompt: "tesseract lattice cyan" },
  { name: "draft_448", width: 448, height: 448, samples: 4, maxDepth: 3, prompt: "neural lattice magenta" },
  { name: "final_448", width: 448, height: 448, samples: 8, maxDepth: 5, prompt: "neural lattice magenta" },
];

const scriptPath = "G:\\Mandala Rendering Software\\mrs\\packages\\renderer-core\\scripts\\render-still.mjs";
const outputDir = "G:\\Mandala Rendering Software\\tmp\\";

async function runBenchmark(config) {
  const start = process.hrtime.bigint();
  const outputPath = `${outputDir}bench_${config.name}.png`;
  const provPath = `${outputDir}bench_${config.name}.json`;
  
  return new Promise((resolve) => {
    const args = [
      scriptPath,
      `--prompt`, config.prompt,
      `--width`, String(config.width),
      `--height`, String(config.height),
      `--samples`, String(config.samples),
      `--max-depth`, String(config.maxDepth),
      `--output`, outputPath,
      `--provenance`, provPath,
    ];
    const child = spawn("node", args, { cwd: "G:\\Mandala Rendering Software\\mrs\\packages\\renderer-core" });
    let stderr = "";
    child.stderr.on("data", (d) => stderr += d.toString());
    child.stdout.on("data", (d) => console.log(d.toString().trim()));
    child.on("close", (code) => {
      const end = process.hrtime.bigint();
      const ms = Number(end - start) / 1e6;
      resolve({ config: config.name, width: config.width, height: config.height, samples: config.samples, maxDepth: config.maxDepth, timeMs: ms, exitCode: code });
    });
  });
}

async function main() {
  console.log("Running RT4D CPU Benchmarks...\n");
  const results = [];
  for (const cfg of configs) {
    console.log(`→ ${cfg.name} (${cfg.width}x${cfg.height} ${cfg.samples}spp depth ${cfg.maxDepth})...`);
    const r = await runBenchmark(cfg);
    console.log(`  ${r.timeMs.toFixed(0)} ms (exit ${r.exitCode})`);
    results.push(r);
  }
  
  console.log("\n=== RT4D CPU Benchmark Results ===");
  console.log("Config              | Resolution | Samples | Depth | Time (ms) | Time (s)");
  console.log("-------------------|------------|---------|-------|-----------|----------");
  for (const r of results) {
    const res = `${r.width}x${r.height}`;
    console.log(`${r.config.padEnd(18)} | ${res.padEnd(10)} | ${String(r.samples).padEnd(7)} | ${String(r.maxDepth).padEnd(5)} | ${String(r.timeMs.toFixed(0)).padEnd(9)} | ${(r.timeMs/1000).toFixed(1)}`);
  }
  
  writeFileSync(`${outputDir}bench_results.json`, JSON.stringify(results, null, 2));
  console.log("\nResults saved to bench_results.json");
}

main().catch(console.error);