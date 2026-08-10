/**
 * UALS v1.0 — Tiling & Streaming Engine (TSE)
 * Constitutional mechanism for VRAM-independent execution
 */

import { createHash } from "node:crypto";
import { UALSError, ERROR_CODES, createProvenanceRecord, hashProvenance } from "../types.js";

export class TilingEngine {
  constructor(config = {}) {
    this.defaultTileSize = config.defaultTileSize || { width: 256, height: 256 };
    this.overlap = config.overlap || 0;
    this.maxTiles = config.maxTiles || 1000;
  }

  computeTiles(outputWidth, outputHeight, maxTileSize) {
    const tileWidth = Math.min(maxTileSize.width, outputWidth);
    const tileHeight = Math.min(maxTileSize.height, outputHeight);

    const tilesX = Math.ceil(outputWidth / tileWidth);
    const tilesY = Math.ceil(outputHeight / tileHeight);

    if (tilesX * tilesY > this.maxTiles) {
      throw new UALSError(
        ERROR_CODES.TILING_FAILED,
        `Tile count ${tilesX * tilesY} exceeds maxTiles ${this.maxTiles}`
      );
    }

    const tiles = [];
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const x = tx * tileWidth;
        const y = ty * tileHeight;
        const width = Math.min(tileWidth, outputWidth - x);
        const height = Math.min(tileHeight, outputHeight - y);

        tiles.push({
          tileId: `tile-${ty}-${tx}`,
          x, y, width, height,
          tileIndex: { x: tx, y: ty },
          gridSize: { x: tilesX, y: tilesY },
        });
      }
    }

    return tiles;
  }

  async executeTiled(backend, kernelId, params, outputWidth, outputHeight, options = {}) {
    const kernelEntry = options.kernelEntry;
    const maxTileSize = kernelEntry?.maxTileSize || this.defaultTileSize;

    const tiles = this.computeTiles(outputWidth, outputHeight, maxTileSize);
    const results = [];
    const provenance = [];

    const seed = params.seed || Date.now();
    let tileSeed = seed;

    for (const tile of tiles) {
      const tileParams = {
        ...params,
        seed: tileSeed++,
        tile: { ...tile },
      };

      const executeResult = await backend.execute(kernelId, tileParams, tile);
      const readbackResult = await backend.readback(executeResult);

      const prov = createProvenanceRecord(
        kernelId,
        backend.backendId,
        tile.tileId,
        tileParams,
        { outputHash: this._hashOutput(readbackResult.output) }
      );
      prov.hash = hashProvenance(prov);
      provenance.push(prov);

      results.push({
        tile: tile.tileId,
        tileIndex: tile.tileIndex,
        output: readbackResult.output,
        metadata: executeResult.metadata,
        provenance: prov,
      });
    }

    const reassembled = this.reassemble(results, outputWidth, outputHeight);

    return {
      output: reassembled,
      tiles: results,
      provenance,
      metadata: {
        tileCount: tiles.length,
        gridSize: tiles[0]?.gridSize || { x: 1, y: 1 },
        totalTiles: tiles.length,
        outputWidth,
        outputHeight,
        kernelId,
      },
    };
  }

  reassemble(tileResults, outputWidth, outputHeight) {
    const firstTile = tileResults[0];
    if (!firstTile) return null;

    const sampleOutput = firstTile.output;
    const channels = sampleOutput.channels || 4;
    const bytesPerChannel = sampleOutput.bytesPerChannel || 1;

    const totalPixels = outputWidth * outputHeight;
    const output = new Uint8ClampedArray(totalPixels * channels);

    for (const result of tileResults) {
      const { tile, tileIndex, output: tileOutput } = result;
      const tileData = tileOutput.data || tileOutput;

      const tileWidth = tileOutput.width || tile.width;
      const tileHeight = tileOutput.height || tile.height;
      const tileX = tile.x;
      const tileY = tile.y;

      for (let y = 0; y < tileHeight; y++) {
        for (let x = 0; x < tileWidth; x++) {
          const srcIdx = (y * tileWidth + x) * channels;
          const dstX = tileX + x;
          const dstY = tileY + y;
          const dstIdx = (dstY * outputWidth + dstX) * channels;

          for (let c = 0; c < channels; c++) {
            output[dstIdx + c] = tileData[srcIdx + c];
          }
        }
      }
    }

    return {
      data: output,
      width: outputWidth,
      height: outputHeight,
      channels,
      bytesPerChannel,
    };
  }

  _hashOutput(output) {
    const data = output.data || output;
    return createHash("sha256").update(Buffer.from(data.buffer || data)).digest("hex");
  }

  verifyTileBoundaries(results, tolerance = 0) {
    const artifacts = [];

    for (const result of results) {
      const tile = result.tile;
      const tileIndex = result.tileIndex;
      const output = result.output;

      if (tile.x > 0) {
        const leftTile = results.find(r => r.tileIndex.x === tileIndex.x - 1 && r.tileIndex.y === tileIndex.y);
        if (leftTile) {
          const diff = this._compareEdges(output, leftTile.output, "left");
          if (diff > tolerance) {
            artifacts.push({ type: "horizontal_seam", tile, diff });
          }
        }
      }

      if (tile.y > 0) {
        const topTile = results.find(r => r.tileIndex.x === tileIndex.x && r.tileIndex.y === tileIndex.y - 1);
        if (topTile) {
          const diff = this._compareEdges(output, topTile.output, "top");
          if (diff > tolerance) {
            artifacts.push({ type: "vertical_seam", tile, diff });
          }
        }
      }
    }

    return {
      clean: artifacts.length === 0,
      artifacts,
    };
  }

  _compareEdges(tileA, tileB, edge) {
    const dataA = tileA.data || tileA;
    const dataB = tileB.data || tileB;
    const channels = tileA.channels || 4;

    let maxDiff = 0;
    const width = tileA.width || 1;
    const height = tileA.height || 1;

    if (edge === "left") {
      for (let y = 0; y < height; y++) {
        const idxA = y * width * channels;
        const idxB = (y + 1) * width * channels - channels;
        for (let c = 0; c < channels; c++) {
          maxDiff = Math.max(maxDiff, Math.abs(dataA[idxA + c] - dataB[idxB + c]));
        }
      }
    } else if (edge === "top") {
      for (let x = 0; x < width; x++) {
        const idxA = x * channels;
        const idxB = (height - 1) * width * channels + x * channels;
        for (let c = 0; c < channels; c++) {
          maxDiff = Math.max(maxDiff, Math.abs(dataA[idxA + c] - dataB[idxB + c]));
        }
      }
    }

    return maxDiff;
  }
}

export function createTilingEngine(config) {
  return new TilingEngine(config);
}