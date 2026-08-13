/**
 * Tile-Based Parallel Render Dispatcher
 * Splits frame into tiles, dispatches to workers, merges deterministically.
 */

import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
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

// Worker thread entry point
if (!isMainThread && parentPort) {
  parentPort.on("message", async (work) => {
    const { tile, config } = work;
    const start = process.hrtime.bigint();
    
    const result = await renderTile(tile, config);
    
    const end = process.hrtime.bigint();
    const timeMs = Number(end - start) / 1e6;
    
    parentPort.postMessage({ ...result, timeMs });
  });
}

async function renderTile(tile, config) {
  // Deterministic placeholder
  const pixels = new Uint8Array(tile.width * tile.height * 4);
  const seed = config.seed + tile.index * 1000003;
  let rng = mulberry32(seed);
  
  for (let i = 0; i < pixels.length; i += 4) {
    const v = Math.floor(rng() * 256);
    pixels[i] = v;
    pixels[i + 1] = v;
    pixels[i + 2] = v;
    pixels[i + 3] = 255;
  }
  
  return { tileIndex: tile.index, pixels, timeMs: 0, samples: config.samples };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ParallelRenderer {
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
    
    const workerScript = join(dirname(fileURLToPath(import.meta.url)), "parallelRenderer.js");
    for (let i = 0; i < this.config.workers; i++) {
      const worker = new Worker(workerScript);
      this.workers.push(worker);
      worker.on("message", (result) => this.handleResult(result));
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
    this.results.set(result.tileIndex, result);
    this.completed++;
  }

  waitForCompletion() {
    return new Promise((resolve) => {
      const check = () => {
        if (this.completed >= this.tiles.length) {
          resolve();
        } else {
          setTimeout(check, 10);
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
      const tile = this.tiles.find(t => t.index === result.tileIndex);
      if (!tile) continue;
      
      for (let y = 0; y < tile.height; y++) {
        const srcOffset = y * tile.width * 4;
        const dstX = tile.x;
        const dstY = tile.y + y;
        const dstOffset = (dstY * width + dstX) * 4;
        
        full.set(result.pixels.subarray(srcOffset, srcOffset + tile.width * 4), dstOffset);
      }
    }
    
    return full;
  }
}

// Export for worker
export { mulberry32 };