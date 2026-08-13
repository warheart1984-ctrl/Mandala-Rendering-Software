/**
 * Frame provenance + recorder (JS / browser + Node).
 * Hashing is pure JS SHA-256 so browser hosts (js/engine/boot.js) stay free of node:crypto.
 */

/** Minimal sync SHA-256 (UTF-8 string → hex). Deterministic; no Node deps. */
function sha256Hex(message) {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const bytes = new TextEncoder().encode(message);
  const bitLen = bytes.length * 8;
  const withPad = bytes.length + 1 + 8;
  const total = ((withPad + 63) & ~63);
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 4, bitLen >>> 0, false);
  view.setUint32(total - 8, Math.floor(bitLen / 0x100000000), false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < total; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4, false);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((x) => x.toString(16).padStart(8, "0"))
    .join("");
}

/**
 * Deterministic SHA-256 over the five constitutional frame fields.
 * Parameter keys are sorted for stable serialization.
 */
export function hashFrameProvenance(frame) {
  const params = frame?.parameters && typeof frame.parameters === "object"
    ? frame.parameters
    : {};
  const sortedKeys = Object.keys(params).sort();
  const stableParams = {};
  for (const k of sortedKeys) {
    stableParams[k] = params[k];
  }
  const payload = JSON.stringify({
    intentId: frame?.intentId ?? null,
    timelineId: frame?.timelineId ?? null,
    worldId: frame?.worldId ?? null,
    timeSeconds: frame?.timeSeconds ?? 0,
    parameters: stableParams,
  });
  return sha256Hex(payload);
}

export function createFrameProvenance({
  intentId,
  timelineId,
  worldId,
  timeSeconds,
  parameters = {},
  allocationLatencyNs,
  copyBandwidthGBps,
  copyLatencyNs,
  memoryCapacityBytes,
  workingSetBytes,
  localityScore,
  numaNode,
  cacheLineUtilization,
  deviceUtilizationPercent,
  queueDepth,
}) {
  const frame = {
    intentId: intentId ?? null,
    timelineId: timelineId ?? null,
    worldId: worldId ?? null,
    timeSeconds: timeSeconds ?? 0,
    parameters: { ...parameters },
    // Memory telemetry — Sovereign-X Router resource-aware governance
    allocationLatencyNs,
    copyBandwidthGBps,
    copyLatencyNs,
    memoryCapacityBytes,
    workingSetBytes,
    localityScore,
    numaNode,
    cacheLineUtilization,
    deviceUtilizationPercent,
    queueDepth,
  };
  frame.provenanceHash = hashFrameProvenance(frame);
  return frame;
}

export class ProvenanceRecorder {
  constructor() {
    this.frames = [];
  }

  record(frame) {
    this.frames.push(frame);
  }

  getFrames() {
    return this.frames.slice();
  }

  clear() {
    this.frames.length = 0;
  }

  get count() {
    return this.frames.length;
  }

  exportJson() {
    return JSON.stringify({ frames: this.frames }, null, 2);
  }
}
