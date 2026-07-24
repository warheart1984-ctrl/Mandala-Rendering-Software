/**
 * CPU conformance gate — tiny scene / deterministic hash compare.
 * Logs pass/fail; never throws / never blocks the wavefront path (Phase B).
 */

/**
 * FNV-1a 32-bit over byte view (deterministic).
 * @param {ArrayBufferView} view
 * @returns {string} hex hash
 */
export function hashBytes(view) {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Build a tiny deterministic reference pattern (not full path tracing).
 * @param {number} width
 * @param {number} height
 * @param {number} [seed]
 * @returns {Uint8ClampedArray}
 */
export function buildTinyReferenceFrame(width, height, seed = 0x4d5253) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const hash = (x * 374761393) ^ (y * 668265263) ^ seed;
      // Match generate→extend→shade stub pipeline (approx)
      let r = hash & 0xff;
      let g = Math.floor((x * 255) / Math.max(width, 1));
      let b = Math.floor((y * 255) / Math.max(height, 1));
      let packed = ((255 << 24) | (r << 16) | (g << 8) | b) >>> 0;
      packed = (packed ^ ((2 * 0x9e3779b9) >>> 0)) >>> 0;
      r = (packed >>> 16) & 0xff;
      g = (packed >>> 8) & 0xff;
      b = packed & 0xff;
      const lit = Math.min(255, Math.floor((r + g + b) / 3) + 16);
      out[i] = lit;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * @typedef {object} ConformanceGateResult
 * @property {boolean} passed
 * @property {string} candidateHash
 * @property {string} referenceHash
 * @property {number} width
 * @property {number} height
 * @property {string} message
 */

/**
 * Compare candidate pixels to the tiny reference. Non-blocking: logs only.
 *
 * @param {Uint8ClampedArray|Uint8Array} candidatePixels
 * @param {{ width: number, height: number, seed?: number, log?: boolean }} opts
 * @returns {ConformanceGateResult}
 */
export function runCPUConformanceGate(candidatePixels, opts) {
  const width = opts.width;
  const height = opts.height;
  const seed = opts.seed ?? 0x4d5253;
  const shouldLog = opts.log !== false;

  const reference = buildTinyReferenceFrame(width, height, seed);
  const candidateHash = hashBytes(candidatePixels);
  const referenceHash = hashBytes(reference);
  const passed = candidateHash === referenceHash;
  const message = passed
    ? `[CPUConformanceGate] PASS hash=${candidateHash} ${width}x${height}`
    : `[CPUConformanceGate] FAIL candidate=${candidateHash} reference=${referenceHash} ${width}x${height} (non-blocking)`;

  if (shouldLog) {
    if (passed) console.log(message);
    else console.warn(message);
  }

  return { passed, candidateHash, referenceHash, width, height, message };
}
