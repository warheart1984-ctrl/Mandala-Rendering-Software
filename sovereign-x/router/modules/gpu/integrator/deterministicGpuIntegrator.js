/**
 * Deterministic GPU Integrator — PROTOTYPE / DECLARED assist only.
 *
 * Namespace: sx.capability.gpu.integrator.deterministic
 * Status: **declared** / **skeleton** — no live CUDA/HIP; never print SoT.
 *
 * Seed contract (declared): mulberry32 PRNG + stratified sample indices.
 * Drive-G-1: assistOnly; nonAuthoritative; does not participate in Digital Printer evidence.
 * Receipt hashes below are **stub** (same-host deterministic from seed) — not live GPU plates.
 */

import { createHash } from "node:crypto";

/**
 * Mulberry32 — deterministic uint32→[0,1) PRNG from a 32-bit seed.
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stub receipt hash — deterministic from payload string (not live GPU frame).
 * @param {string} payload
 * @returns {string}
 */
export function stubReceiptHash(payload) {
  return createHash("sha256").update(String(payload)).digest("hex");
}

/**
 * Stratified sample index in [0, n) for sample i of n (declared contract).
 * @param {number} i
 * @param {number} n
 * @param {() => number} rng
 * @returns {number}
 */
export function stratifiedIndex(i, n, rng) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const u = typeof rng === "function" ? rng() : 0.5;
  return Math.min(n - 1, Math.floor(((i + u) / n) * n));
}

/**
 * Prototype assist integrator — returns deterministic assist payload, never print plates.
 *
 * @param {object} request
 * @param {number} [request.seed=0]
 * @param {number} [request.sampleCount=16]
 * @returns {object}
 */
export function integrateDeterministicAssist(request = {}) {
  if (request.asPrintSoT === true || request.authority === "authoritative") {
    return {
      ok: false,
      code: "GPU_PRINT_SOT_DENIED",
      assistOnly: true,
      nonAuthoritative: true,
      status: "declared",
      message:
        "gpu.integrator.deterministic cannot be print SoT — only cpu.rt4d.print is authoritative",
    };
  }

  const seed = Number.isFinite(request.seed) ? request.seed >>> 0 : 0;
  const sampleCount = Math.max(1, Math.min(4096, request.sampleCount ?? 16));
  const rng = mulberry32(seed);
  const samples = [];
  for (let i = 0; i < sampleCount; i++) {
    samples.push({
      i,
      u: rng(),
      stratified: stratifiedIndex(i, sampleCount, rng),
    });
  }

  const sampleDigest = samples
    .map((s) => `${s.i}:${s.u.toFixed(8)}:${s.stratified}`)
    .join("|");
  const frameHash = stubReceiptHash(`frame|${seed}|${sampleCount}|${sampleDigest}`);
  const replayHash = stubReceiptHash(`replay|${seed}|${sampleCount}|${sampleDigest}`);

  return {
    ok: true,
    capabilityId: "gpu.integrator.deterministic",
    authority: "assist",
    assistOnly: true,
    nonAuthoritative: true,
    status: "declared",
    seedContract: {
      prng: "mulberry32",
      sampling: "stratified",
      status: "declared",
    },
    seed,
    sampleCount,
    samples,
    /** Assist plate stub — not a print frame */
    plate: {
      kind: "assistStubPlate",
      status: "skeleton",
      seed,
      sampleCount,
    },
    receipt: {
      seed,
      frameHash,
      replayHash,
      deviceInfo: {
        vendor: "neutral",
        model: "stub",
        driver: "none",
        status: "skeleton",
      },
      status: "skeleton",
      note: "Stub same-host hashes from seed — not live GPU parity evidence",
    },
    message:
      "Prototype deterministic GPU integrator assist (no live GPU; never print SoT)",
    provenanceKind: "assistProvenance",
  };
}

export default {
  mulberry32,
  stratifiedIndex,
  stubReceiptHash,
  integrateDeterministicAssist,
};
