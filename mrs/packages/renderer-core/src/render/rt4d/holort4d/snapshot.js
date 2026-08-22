/**
 * Perception snapshots — piggyback existing CPO / SPO / CPF-4D. Do not invent a second CPF.
 *
 *   CPO    64×64   tile energy
 *   SPO    256×256 intensity + phase coherence
 *   CPF-4D 512×512 bounce-wise if history exists, else complex field downsampled
 *
 * holort4d.getSnapshot('CPO'|'SPO'|'CPF-4D') → Float32Array from the hologram field.
 * visionBridge.publish(snapshot) when a publisher is passed.
 * CPU tensors: enforced. Live Vision Bridge roundtrip: partial.
 */

import { fieldMagnitude, phaseNorm } from "./accumulate.js";

/** Live bridge roundtrip is still partial. CPU snapshot sizes/values are enforced in tests. */
export const SNAPSHOT_STATUS = "partial";
export const SNAPSHOT_CPU_STATUS = "enforced";

export const SNAPSHOT_LEVELS = Object.freeze({
  cpo: Object.freeze({ id: "cpo", alias: "CPO", width: 64, height: 64, channels: 1, meaning: "tile-energy" }),
  spo: Object.freeze({ id: "spo", alias: "SPO", width: 256, height: 256, channels: 2, meaning: "intensity+coherence" }),
  cpf4d: Object.freeze({
    id: "cpf4d",
    alias: "CPF-4D",
    width: 512,
    height: 512,
    channels: 1,
    meaning: "bounce-evolution-or-downsampled-field",
  }),
});

const LEVEL_ALIASES = Object.freeze({
  cpo: "cpo",
  CPO: "cpo",
  spo: "spo",
  SPO: "spo",
  cpf4d: "cpf4d",
  CPF4D: "cpf4d",
  "cpf-4d": "cpf4d",
  "CPF-4D": "cpf4d",
});

export function normalizeSnapshotLevel(level) {
  const key = LEVEL_ALIASES[level];
  if (!key) throw new Error(`unknown snapshot level: ${level}`);
  return key;
}

function validGrid(srcW, srcH, dstW, dstH) {
  return srcW > 0 && srcH > 0 && dstW > 0 && dstH > 0;
}

function downsampleEnergy(field, srcW, srcH, dstW, dstH) {
  const out = new Float32Array(Math.max(0, dstW) * Math.max(0, dstH));
  if (!validGrid(srcW, srcH, dstW, dstH)) return out;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const srcX0 = Math.floor((x * srcW) / dstW);
      const srcX1 = Math.max(srcX0 + 1, Math.floor(((x + 1) * srcW) / dstW));
      const srcY0 = Math.floor((y * srcH) / dstH);
      const srcY1 = Math.max(srcY0 + 1, Math.floor(((y + 1) * srcH) / dstH));
      let e = 0;
      let n = 0;
      for (let sy = srcY0; sy < Math.min(srcH, srcY1); sy++) {
        for (let sx = srcX0; sx < Math.min(srcW, srcX1); sx++) {
          e += fieldMagnitude(field[sy * srcW + sx] ?? { real: 0, imag: 0 });
          n += 1;
        }
      }
      out[y * dstW + x] = n ? e / n : 0;
    }
  }
  return out;
}

function downsampleIntensityCoherence(field, srcW, srcH, dstW, dstH) {
  const out = new Float32Array(Math.max(0, dstW) * Math.max(0, dstH) * 2);
  if (!validGrid(srcW, srcH, dstW, dstH)) return out;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const srcX0 = Math.floor((x * srcW) / dstW);
      const srcX1 = Math.max(srcX0 + 1, Math.floor(((x + 1) * srcW) / dstW));
      const srcY0 = Math.floor((y * srcH) / dstH);
      const srcY1 = Math.max(srcY0 + 1, Math.floor(((y + 1) * srcH) / dstH));
      let re = 0;
      let im = 0;
      let mag = 0;
      let n = 0;
      for (let sy = srcY0; sy < Math.min(srcH, srcY1); sy++) {
        for (let sx = srcX0; sx < Math.min(srcW, srcX1); sx++) {
          const p = field[sy * srcW + sx] ?? { real: 0, imag: 0 };
          re += p.real;
          im += p.imag;
          mag += fieldMagnitude(p);
          n += 1;
        }
      }
      const intensity = n ? mag / n : 0;
      const coherence = mag > 0 ? Math.hypot(re, im) / mag : 0;
      const i = (y * dstW + x) * 2;
      out[i] = intensity;
      out[i + 1] = coherence;
    }
  }
  return out;
}

function normalizeHistory(history) {
  if (!history) return [];
  if (Array.isArray(history)) {
    if (history.length === 0) return [];
    if (Array.isArray(history[0])) return history;
    if (history[0] && typeof history[0] === "object" && ("real" in history[0] || "imag" in history[0])) {
      return [history];
    }
  }
  if (Array.isArray(history.fields)) return history.fields;
  if (Array.isArray(history.bounces)) return history.bounces;
  return [];
}

/** Bounce-wise 512×512: vertical strips, one bounce per strip, |E| per dest pixel. */
function bounceWiseFromHistory(history, srcW, srcH, dstW, dstH) {
  const bounces = normalizeHistory(history);
  const n = Math.max(1, bounces.length);
  const out = new Float32Array(Math.max(0, dstW) * Math.max(0, dstH));
  if (!validGrid(srcW, srcH, dstW, dstH)) return out;
  const stripH = Math.max(1, Math.floor(dstH / n));
  for (let y = 0; y < dstH; y++) {
    const bounceId = Math.min(n - 1, Math.floor(y / stripH));
    const field = bounces[bounceId] ?? [];
    const localY = y - bounceId * stripH;
    const sy = Math.min(srcH - 1, Math.floor((localY * srcH) / stripH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW));
      const p = field[sy * srcW + sx] ?? { real: 0, imag: 0 };
      out[y * dstW + x] = fieldMagnitude(p);
    }
  }
  out.bounceCount = n;
  out.layout = "bounce-strips";
  return out;
}

export function perceptualFeatures(snapshot) {
  let sum = 0;
  let max = 0;
  let n = snapshot.length;
  const step = snapshot.channels === 2 ? 2 : 1;
  const count = Math.floor(n / step);
  for (let i = 0; i < n; i += step) {
    const v = snapshot[i];
    sum += v;
    if (v > max) max = v;
  }
  return {
    mean: count ? sum / count : 0,
    max,
    level: snapshot.level,
    width: snapshot.width,
    height: snapshot.height,
    channels: snapshot.channels,
    meaning: snapshot.meaning,
  };
}

/**
 * @param {"CPO"|"SPO"|"CPF-4D"|"cpo"|"spo"|"cpf4d"} level
 * @param {object} [ctx]
 * @returns {Float32Array}
 */
export function getSnapshot(level, ctx = {}) {
  const key = normalizeSnapshotLevel(level);
  const spec = SNAPSHOT_LEVELS[key];
  const field = ctx.field ?? [];
  const srcW = ctx.width ?? ctx.holoResX ?? 1;
  const srcH = ctx.height ?? ctx.holoResY ?? 1;
  let data;
  let meaning = spec.meaning;
  if (key === "cpo") data = downsampleEnergy(field, srcW, srcH, spec.width, spec.height);
  else if (key === "spo") data = downsampleIntensityCoherence(field, srcW, srcH, spec.width, spec.height);
  else {
    const history = ctx.history ?? ctx.bounceHistory;
    if (normalizeHistory(history).length) {
      data = bounceWiseFromHistory(history, srcW, srcH, spec.width, spec.height);
      meaning = "bounce-evolution";
    } else {
      data = downsampleEnergy(field, srcW, srcH, spec.width, spec.height);
      meaning = "downsampled-field";
    }
  }

  data.level = spec.alias;
  data.id = spec.id;
  data.width = spec.width;
  data.height = spec.height;
  data.channels = spec.channels;
  data.meaning = meaning;
  data.status = SNAPSHOT_STATUS;
  data.cpuStatus = SNAPSHOT_CPU_STATUS;
  data.perceptualFeatures = perceptualFeatures(data);
  return data;
}

let _canonicalModule = null;
async function loadCanonical() {
  if (_canonicalModule) return _canonicalModule;
  try {
    _canonicalModule = await import("./canonical.js");
  } catch {
    _canonicalModule = null;
  }
  return _canonicalModule;
}

/**
 * Convert a Float32Array snapshot to a canonical CPO/SPO/CPF-4D envelope.
 * Self-contained — does not import from mandala/engine/chamber/.
 * @returns {Promise<object>}
 */
export async function toCanonical(snapshot, opts = {}) {
  const mod = await loadCanonical();
  if (!mod?.buildCPOEnvelope) {
    return { envelope: "raw", snapshot, status: SNAPSHOT_STATUS };
  }
  const key = normalizeSnapshotLevel(snapshot.level ?? snapshot.id);
  if (key === "cpf4d") {
    return mod.buildCPF4DEnvelope(snapshot, opts);
  }
  return mod.buildCPOEnvelope(snapshot, opts);
}

/**
 * Build art direction provenance per the art direction brief §10.
 * Delegates to canonical.js when available; falls back to inline.
 */
export async function buildArtDirectionProvenance(opts = {}) {
  const mod = await await_import_canonical();
  if (mod?.buildArtDirectionProvenance) return mod.buildArtDirectionProvenance(opts);
  return {
    intent: opts.intent ?? "holographic-field-debug",
    honest: {
      holort4d: opts.holort4dHonest ?? "wave-optics",
      sdTurbo: opts.sdHonest ?? "did-not-run",
      chamberHolo: opts.chamberHonest ?? "did-not-run",
      photoreal: opts.photoreal ?? "not-claimed",
    },
    lighting: {
      key: opts.keyLight ?? "[0.35, -0.85, 0.40] warm 5600K intensity 2.4",
      fill: opts.fillLight ?? "[-0.50, -0.30, -0.20] cool 7000K intensity 0.35",
      ground: opts.ground ?? "y=0 contact shadow plane",
      exposure: opts.exposure ?? "2.2",
    },
    visuals: {
      engine: opts.engine ?? "holort4d-cpu",
      size: opts.size ?? "unknown",
      steps: opts.steps ?? 0,
      samples: opts.samples ?? 0,
    },
    pipeline: {
      stages: (opts.stages ?? []).map((s) => ({ stage: s.stage, status: s.status ?? "declared" })),
    },
  };
}

const CHAMBER_VISION = new URL(
  "../../../../../../../mandala/engine/chamber/vision-integration.mjs",
  import.meta.url,
);

/**
 * Piggyback existing vision-bridge / chamber inspect. No second CPF.
 * Accepts VisionBridge.inspect, createVisionBridge() result, or a {publish} object.
 */
export async function publishSnapshot(visionBridge, snapshot, extra = {}) {
  let bridge = visionBridge;
  if (!bridge && extra.tryChamberBridge) {
    try {
      const mod = await import(CHAMBER_VISION.href);
      bridge = typeof mod.createVisionBridge === "function" ? mod.createVisionBridge({ provider: "stub" }) : null;
    } catch {
      bridge = null;
    }
  }
  if (!bridge) {
    return { status: SNAPSHOT_STATUS, published: false, reason: "no-vision-bridge" };
  }
  let canonicalEnvelope = null;
  try { canonicalEnvelope = await toCanonical(snapshot, { provenance: extra.provenance, ...extra }); } catch { canonicalEnvelope = null; }
  const payload = {
    kind: "holort4d-snapshot",
    level: snapshot.level,
    width: snapshot.width,
    height: snapshot.height,
    channels: snapshot.channels,
    meaning: snapshot.meaning,
    perceptualFeatures: snapshot.perceptualFeatures ?? perceptualFeatures(snapshot),
    values: snapshot,
    canonical: canonicalEnvelope,
    status: SNAPSHOT_STATUS,
    cpuStatus: SNAPSHOT_CPU_STATUS,
    ...extra,
  };
  delete payload.tryChamberBridge;
  delete payload.provenance;
  if (typeof bridge.publish === "function") {
    const result = await bridge.publish(payload);
    return { status: SNAPSHOT_STATUS, published: true, via: "publish", result, liveRoundtrip: "partial" };
  }
  if (typeof bridge.inspect === "function") {
    const result = await bridge.inspect({
      image: extra.image ?? "data:image/png;base64,",
      question: extra.question ?? `HoloRT4D ${snapshot.level} snapshot (${snapshot.meaning})`,
      detail: extra.detail ?? "medium",
      holort4d: payload,
    });
    return { status: SNAPSHOT_STATUS, published: true, via: "inspect", result, liveRoundtrip: "partial" };
  }
  return { status: SNAPSHOT_STATUS, published: false, reason: "bridge-has-no-publish-or-inspect" };
}
