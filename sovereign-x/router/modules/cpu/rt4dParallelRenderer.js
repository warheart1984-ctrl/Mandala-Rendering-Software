/**
 * RT4D Parallel Renderer - Uses actual RT4D path tracer for tiles
 */

import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

function generateTiles(width, height, tileSize) {
  const tiles = [];
  let index = 0;
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const tw = Math.min(tileSize, width - x);
      const th = Math.min(tileSize, height - y);
      tiles.push({ x, y, width: tw, height: th, index: index++ });
    }
  }
  return tiles;
}

if (!isMainThread && parentPort) {
  // Import worker logic dynamically
  const workerModule = await import("./rt4dTileWorker.js");
  // rt4dTileWorker registers its own message handler
}

export class Rt4dParallelRenderer {
  constructor(config) {
    this.config = config;
    this.tiles = generateTiles(config.width, config.height, config.tileSize);
    this.workers = [];
    this.results = new Map();
    this.completed = 0;
    this.startTime = 0n;
  }

  async render() {
    this.startTime = process.hrtime.bigint();
    
    const workerScript = join(dirname(fileURLToPath(import.meta.url)), "rt4dTileWorker.js");
    for (let i = 0; i < this.config.workers; i++) {
      const worker = new Worker(workerScript);
      this.workers.push(worker);
      worker.on("message", (result) => this.handleResult(result));
      worker.on("error", (err) => this.handleError(err));
    }

    await this.dispatchTiles();
    await this.waitForCompletion();

    const pixels = this.mergeTiles();
    const sha256 = createHash("sha256").update(pixels).digest("hex");

    const endTime = process.hrtime.bigint();
    const timeMs = Number(endTime - this.startTime) / 1e6;

    for (const w of this.workers) {
      await w.terminate();
    }

    const tileTimes = Array.from(this.results.values()).map(r => r.timeMs);

    return { pixels, timeMs, tileTimes, sha256 };
  }

  async dispatchTiles() {
    let workerIndex = 0;
    for (const tile of this.tiles) {
      const worker = this.workers[workerIndex % this.workers.length];
      worker.postMessage({ tile, config: this.config });
      workerIndex++;
    }
  }

  handleResult(result) {
    if (result.error) {
      console.error(`Tile ${result.tileIndex} error:`, result.error);
    }
    this.results.set(result.tileIndex, result);
    this.completed++;
  }

  handleError(err) {
    console.error("Worker error:", err);
  }

  waitForCompletion() {
    return new Promise((resolve) => {
      const check = () => {
        if (this.completed >= this.tiles.length) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  mergeTiles() {
    const { width, height } = this.config;
    const full = new Uint8Array(width * height * 4);
    
    const sorted = Array.from(this.results.entries()).sort((a, b) => a[0] - b[0]);
    
    for (const [, result] of sorted) {
      if (!result.pngBuffer) continue;
      
      const tile = this.tiles.find(t => t.index === result.tileIndex);
      if (!tile) continue;
      
      // For simplicity, assume PNG buffer is raw RGBA (in production decode PNG)
      // This is a placeholder - real implementation would decode PNG
      const tilePixels = new Uint8Array(result.pngBuffer);
      
      for (let y = 0; y < tile.height; y++) {
        const srcOffset = y * tile.width * 4;
        const dstX = tile.x;
        const dstY = tile.y + y;
        const dstOffset = (dstY * width + dstX) * 4;
        
        if (srcOffset + tile.width * 4 <= tilePixels.length) {
          full.set(tilePixels.subarray(srcOffset, srcOffset + tile.width * 4), dstOffset);
        }
      }
    }
    
    return full;
  }
}

export { generateTiles };