/**
 * RT4D Multi-Frame Parallel Benchmark - Real Path Tracer
 * Each worker renders a complete frame (different seed).
 * Tests: 1, 2, 4, 8 workers with real RT4D.
 */

import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { spawn } from "node:child_process";
import { join } from "node:path";

if (!isMainThread && parentPort) {
  parentPort.on("message", async (work) => {
    const { frameIndex, config } = work;
    const start = process.hrtime.bigint();
    
    const outputPath = join("G:", "Mandala Rendering Software", "tmp", `frame_${frameIndex}_${config.seed}.png`);
    const provPath = join("G:", "Mandala Rendering Software", "tmp", `frame_${frameIndex}_${config.seed}.json`);
    
    const args = [
      "G:\\Mandala Rendering Software\\mrs\\packages\\renderer-core\\scripts\\render-still.mjs",
      "--prompt", config.prompt,
      "--width", String(config.width),
      "--height", String(config.height),
      "--samples", String(config.samples),
      "--max-depth", String(config.maxDepth),
      "--seed", String(config.seed + frameIndex * 1000003),
      "--output", outputPath,
      "--provenance", provPath,
    ];
    
    const child = spawn("node", args, { 
      cwd: "G:\\Mandala Rendering Software\\mrs\\packages\\renderer-core",
      timeout: 600000
    });
    
    let stderr = "";
    child.stderr.on("data", (d) => stderr += d.toString());
    
    child.on("close", (code) => {
      const end = process.hrtime.bigint();
      const timeMs = Number(end - start) / 1e6;
      
      if (code !== 0) {
        parentPort.postMessage({ 
          frameIndex, 
          error: `RT4D exit ${code}: ${stderr}`,
          timeMs 
        });
        return;
      }
      
      parentPort.postMessage({ frameIndex, outputPath, provPath, timeMs });
    });
    
    child.on("error", (err) => {
      const end = process.hrtime.bigint();
      parentPort.postMessage({ 
        frameIndex, 
        error: err.message,
        timeMs: Number(end - start) / 1e6 
      });
    });
  });
}