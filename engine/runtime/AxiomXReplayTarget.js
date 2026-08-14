/**
 * AxiomXReplayTarget — replay target that renders governed frames through a
 * deterministic GPU backend (uals ABI v0 / axiomx addon) via an injected
 * render function.
 *
 * Engine stays browser-safe: the render function is injected (factory in
 * sovereign-x/axiom-native/node-bindings wires the real addon). Frames are
 * applied in order; each render carries the frame's five constitutional
 * fields (intentId, worldId, timelineId, timeSeconds, parameters) so the
 * backend's provenance gate sees a governed request.
 *
 * Fail-closed: a frame without intentId/worldId/timelineId is rejected
 * (policy-no-authority-without-contract / provenance evidence).
 */

import { hashFrameProvenance } from "./ProvenanceRecorder.js";

export class AxiomXReplayTarget {
  /**
   * @param {object} options
   * @param {(frame: object) => Uint8Array} options.render - GPU render call
   *   (addon renderAxiomX). Must return the raw pixel buffer.
   */
  constructor(options = {}) {
    this.render = options.render ?? null;
    this.log = [];
  }

  applyFrame(frame) {
    if (!frame) throw new Error("AxiomXReplayTarget: frame required");
    if (this.render == null) {
      throw new Error(
        "AxiomXReplayTarget: no render function bound (wire via sovereign-x/axiom-native/node-bindings)",
      );
    }
    if (!frame.intentId) throw new Error("AxiomXReplayTarget: frame.intentId required (provenance)");
    if (!frame.worldId) throw new Error("AxiomXReplayTarget: frame.worldId required (provenance)");
    if (!frame.timelineId) throw new Error("AxiomXReplayTarget: frame.timelineId required (provenance)");

    const buffer = this.render(frame);
    if (!buffer) throw new Error("AxiomXReplayTarget: render returned no buffer");
    const entry = {
      frameHash: frame.provenanceHash || hashFrameProvenance(frame),
      renderBytes: buffer.byteLength,
      renderHash: sha256Hex(buffer),
      timeSeconds: frame.timeSeconds ?? 0,
    };
    this.log.push(entry);
    return entry;
  }

  getRenderLog() {
    return this.log.slice();
  }

  clear() {
    this.log.length = 0;
  }
}

/** Deterministic SHA-256 of a byte buffer (pure JS, browser-safe). */
function sha256Hex(bytes) {
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
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const w = new Uint32Array(64);
  const n = bytes.length;
  const total = (((n + 9 + 63) >> 6) << 6);
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[n] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 4, (n * 8) >>> 0, false);
  view.setUint32(total - 8, Math.floor((n * 8) / 0x100000000), false);

  for (let i = 0; i < total; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4, false);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[j] + w[j]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}