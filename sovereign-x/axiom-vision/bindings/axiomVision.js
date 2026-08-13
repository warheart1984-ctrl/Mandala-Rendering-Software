/**
 * Axiom Vision — Main Entry Point.
 *
 * const vision = await axiomVision.analyze(imageBuffer);
 *
 * Returns a complete Vision IR with evidence graph, provenance chain,
 * and conformance guarantees.
 */

import { sha256Bytes, sha256Hex } from "../evidence/sha256.js";
import { resetFeatureCounter } from "../evidence/evidenceBuilder.js";
import { computeTileGrid, getTileBounds } from "../tile/tileSplitter.js";
import { mergeTileFeatures, mergeHistograms, mergeGradientFields } from "../tile/featureMerger.js";
import { sobelFull, sobelDetect } from "../kernels/sobel.js";
import { colorHistogram } from "../kernels/colorHistogram.js";
import { gradientField } from "../kernels/gradientField.js";
import { connectedComponents, edgeMagnitudeToMask } from "../kernels/connectedComponents.js";
import { extractContours } from "../kernels/contours.js";
import { buildVisionIR } from "../ir/visionIR.js";

export const AXIOM_VISION_VERSION = "1.0.0";

/**
 * Analyze an image buffer and produce a complete Vision IR.
 *
 * @param {Uint8Array|ArrayBuffer} imageBuffer - Raw image data (PNG, JPEG, or raw RGBA)
 * @param {Object} [options]
 * @param {number} [options.width] - Required if buffer is raw RGBA
 * @param {number} [options.height] - Required if buffer is raw RGBA
 * @param {number} [options.tileSize=256] - Tile size for parallel processing
 * @param {number} [options.sobelThreshold=0.1] - Edge detection threshold
 * @param {number} [options.histBins=16] - Color histogram bins per channel
 * @param {number} [options.gradientStride=8] - Gradient field sampling stride
 * @param {number} [options.minRegionArea=50] - Minimum region area in pixels
 * @param {number} [options.minContourPerimeter=30] - Minimum contour perimeter
 * @param {boolean} [options.includeHistogram=true] - Include color histogram
 * @param {boolean} [options.includeGradientField=true] - Include gradient field
 * @param {boolean} [options.includeRegions=true] - Include region segmentation
 * @param {boolean} [options.includeContours=true] - Include contour extraction
 * @param {string} [options.source="buffer"] - Image source identifier
 * @returns {Object} Complete Vision IR
 */
export async function analyze(imageBuffer, options = {}) {
  const startTime = Date.now();
  resetFeatureCounter();

  // Decode or use raw RGBA
  let rgba, width, height;

  if (options.width && options.height) {
    rgba = imageBuffer instanceof Uint8Array ? imageBuffer : new Uint8Array(imageBuffer);
    width = options.width;
    height = options.height;
  } else {
    // Try to decode as PNG
    const decoded = decodePNG(imageBuffer);
    rgba = decoded.rgba;
    width = decoded.width;
    height = decoded.height;
  }

  // Compute image hash (L0)
  const imageHash = sha256Bytes(rgba);

  // Compute tile grid
  const grid = computeTileGrid(width, height, options.tileSize || 256);

  // === Level 1: Primitive Features ===

  // Edges (always computed)
  const edges = sobelFull(
    rgba, width, height,
    options.sobelThreshold || 0.1,
    imageHash
  );

  // Color histogram (optional)
  let histogram = null;
  if (options.includeHistogram !== false) {
    histogram = colorHistogram(
      rgba, width, height,
      0, 0, width, height,
      0, grid,
      options.histBins || 16,
      imageHash
    );
  }

  // Gradient field (optional)
  let gradField = null;
  if (options.includeGradientField !== false) {
    gradField = gradientField(
      rgba, width, height,
      0, 0, width, height,
      0, grid,
      options.gradientStride || 8,
      imageHash
    );
  }

  // Assemble L1 features
  const L1 = [...edges];
  if (histogram) L1.push(histogram);
  if (gradField) L1.push(gradField);

  // Compute L1 level hash for L2 parent
  const L1Hashes = L1.map(f => f.provenance.feature_hash).filter(Boolean);
  const L1LevelHash = L1Hashes.length > 0
    ? sha256Hex([...L1Hashes].sort().join(""))
    : sha256Hex("empty_L1");

  // === Level 2: Geometry Features ===

  // Build binary mask from edge magnitudes for segmentation
  const magnitude = new Float64Array(width * height);
  for (const edge of edges) {
    if (edge.geometry && edge.magnitude != null) {
      const x0 = edge.geometry.x0;
      const y0 = edge.geometry.y0;
      if (x0 < width && y0 < height) {
        magnitude[y0 * width + x0] = edge.magnitude;
      }
    }
  }

  const binaryMask = edgeMagnitudeToMask(magnitude, width, height, options.sobelThreshold || 0.1);

  // Regions (optional)
  let regions = [];
  if (options.includeRegions !== false) {
    regions = connectedComponents(
      binaryMask, width, height,
      0, 0, width, height,
      0, grid,
      [L1LevelHash],
      options.minRegionArea || 50
    );
  }

  // Contours (optional)
  let contours = [];
  if (options.includeContours !== false) {
    contours = extractContours(
      binaryMask, width, height,
      0, 0, width, height,
      0, grid,
      [L1LevelHash],
      options.minContourPerimeter || 30
    );
  }

  const L2 = [...regions, ...contours];

  // === Build Vision IR ===
  const duration = Date.now() - startTime;

  const kernelsUsed = ["sobel-3x3"];
  if (histogram) kernelsUsed.push("per-channel-histogram");
  if (gradField) kernelsUsed.push("sobel-gradient-field");
  if (regions.length >= 0) kernelsUsed.push("connected-components-8way");
  if (contours.length >= 0) kernelsUsed.push("suzuki-abe-border-following");

  const visionIR = buildVisionIR({
    L0: {
      image_hash: imageHash,
      width,
      height,
      format: "rgba8",
      byte_length: rgba.length,
      source: options.source || "buffer",
    },
    L1,
    L2,
    L3: [], // Level 3 requires learned models (ONNX)
    L4: [], // Level 4 requires L3
    L5: [], // Level 5 requires LLM
    metadata: {
      durationMs: duration,
      tileCount: grid.total,
      workerCount: 1,
      kernelsUsed,
    },
  });

  return visionIR;
}

/**
 * Minimal PNG decoder (for when width/height not provided).
 * Supports basic RGBA and RGB PNG files.
 * For production use, use a proper PNG library.
 *
 * @param {Uint8Array} buffer
 * @returns {Object} { rgba, width, height }
 */
function decodePNG(buffer) {
  // Check PNG signature
  const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  if (!isPNG) {
    throw new Error("axiomVision.analyze: Cannot decode buffer. Provide width+height for raw RGBA.");
  }

  // Parse IHDR chunk
  let offset = 8; // Skip signature
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = (buffer[offset] << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3];
    const type = String.fromCharCode(buffer[offset + 4], buffer[offset + 5], buffer[offset + 6], buffer[offset + 7]);

    if (type === "IHDR") {
      width = (buffer[offset + 8] << 24) | (buffer[offset + 9] << 16) | (buffer[offset + 10] << 8) | buffer[offset + 11];
      height = (buffer[offset + 12] << 24) | (buffer[offset + 13] << 16) | (buffer[offset + 14] << 8) | buffer[offset + 15];
      bitDepth = buffer[offset + 16];
      colorType = buffer[offset + 17];
    } else if (type === "IDAT") {
      idatChunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length; // length(4) + type(4) + data + crc(4)
  }

  // For now, return a placeholder — full PNG decompression requires zlib inflate
  // In production, use the Canvas API in browser or sharp/pngjs in Node
  // This is a scaffold for the evidence-bound path
  if (width === 0 || height === 0) {
    throw new Error("axiomVision.analyze: Failed to parse PNG header.");
  }

  // Try to use Node zlib for decompression
  try {
    const zlib = require("zlib");
    const combined = Buffer.concat(idatChunks.map(b => Buffer.from(b)));
    const inflated = zlib.inflateSync(combined);

    const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4;
    const rgba = new Uint8Array(width * height * 4);
    const stride = width * channels;

    // Unfilter PNG scanlines
    let pos = 0;
    for (let y = 0; y < height; y++) {
      const filterType = inflated[pos++];
      const rowStart = y * stride;

      for (let x = 0; x < stride; x++) {
        const raw = inflated[pos++];
        const a = x >= channels ? rgba[(y * width + (x / channels | 0)) * 4 + (x % channels)] : 0;
        const b = y > 0 ? rgba[((y - 1) * width + (x / channels | 0)) * 4 + (x % channels)] : 0;
        const c = (x >= channels && y > 0) ? rgba[((y - 1) * width + ((x / channels | 0) - 1)) * 4 + (x % channels)] : 0;

        let val;
        switch (filterType) {
          case 0: val = raw; break;
          case 1: val = raw + a; break;
          case 2: val = raw + b; break;
          case 3: val = raw + ((a + b) >> 1); break;
          case 4: {
            const p = a + b - c;
            const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
            const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
            val = raw + pr;
            break;
          }
          default: val = raw;
        }

        const px = x / channels | 0;
        const ch = x % channels;
        if (px < width) {
          if (channels === 4) {
            rgba[y * width * 4 + px * 4 + ch] = val;
          } else if (channels === 3) {
            if (ch < 3) rgba[y * width * 4 + px * 4 + ch] = val;
          } else if (channels === 1) {
            rgba[y * width * 4 + px * 4 + 0] = val;
            rgba[y * width * 4 + px * 4 + 1] = val;
            rgba[y * width * 4 + px * 4 + 2] = val;
          }
        }
      }
    }

    // Fill alpha
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4 + 3] = 255;
    }

    return { rgba, width, height };
  } catch (e) {
    throw new Error(`axiomVision.analyze: PNG decompression failed (${e.message}). For raw RGBA, pass width and height options.`);
  }
}

/**
 * Analyze a raw RGBA buffer directly (no decoding needed).
 * Convenience wrapper for the common case.
 */
export function analyzeRGBA(rgba, width, height, options = {}) {
  return analyze(rgba, { ...options, width, height });
}
