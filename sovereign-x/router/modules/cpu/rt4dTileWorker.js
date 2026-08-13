/**
 * RT4D Tile Worker - Calls actual RT4D path tracer for a tile
 */

import { parentPort } from "node:worker_threads";
import { spawn } from "node:child_process";
import { join } from "node:path";

if (!parentPort) {
  throw new Error("Must run as worker thread");
}

const RT4D_SCRIPT = join("G:", "Mandala Rendering Software", "mrs", "packages", "renderer-core", "scripts", "render-still.mjs");

function renderTileRt4d(tile, config) {
  return new Promise((resolve, reject) => {
    const outputPath = join("G:", "Mandala Rendering Software", "tmp", `tile_${tile.index}_${config.seed}.png`);
    const provPath = join("G:", "Mandala Rendering Software", "tmp", `tile_${tile.index}_${config.seed}.json`);
    
    // Calculate camera for this tile (sub-region of full frame)
    // For now, render full frame at tile resolution and crop
    // In production, would modify camera to only render tile region
    
    const args = [
      RT4D_SCRIPT,
      "--prompt", config.prompt,
      "--width", String(tile.width),
      "--height", String(tile.height),
      "--samples", String(config.samples),
      "--max-depth", String(config.maxDepth),
      "--seed", String(config.seed + tile.index * 1000003),
      "--output", outputPath,
      "--provenance", provPath,
    ];
    
    const child = spawn("node", args, { 
      cwd: "G:\\Mandala Rendering Software\\mrs\\packages\\renderer-core",
      timeout: 300000
    });
    
    let stderr = "";
    child.stderr.on("data", (d) => stderr += d.toString());
    
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`RT4D exit ${code}: ${stderr}`));
        return;
      }
      
      // Read the output PNG
      import("node:fs/promises").then(fs => {
        fs.readFile(outputPath).then(pngBuffer => {
          // Convert PNG to raw RGBA (simplified - in production use sharp or similar)
          // For now, return the PNG buffer and metadata
          resolve({
            tileIndex: tile.index,
            pngBuffer,
            timeMs: 0, // Will be set by parent
            samples: config.samples,
            provPath,
          });
        });
      });
    });
    
    child.on("error", reject);
  });
}

parentPort.on("message", async (work) => {
  const { tile, config } = work;
  const start = process.hrtime.bigint();
  
  try {
    const result = await renderTileRt4d(tile, config);
    const end = process.hrtime.bigint();
    result.timeMs = Number(end - start) / 1e6;
    parentPort.postMessage(result);
  } catch (err) {
    parentPort.postMessage({ 
      tileIndex: tile.index, 
      error: err.message,
      timeMs: Number(process.hrtime.bigint() - start) / 1e6 
    });
  }
});