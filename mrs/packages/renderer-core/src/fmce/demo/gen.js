/**
 * SME-GEN deterministic simulation.
 * Status: canonical (CPU-bound, seed-reproducible)
 *
 * Implements the SME-GEN-IFC contract shape: GEN_REQUEST -> GEN_ARTIFACT +
 * GEN_TRACE. No neural backends: image pixels and audio samples are derived
 * from deterministic seeded math over the prompt so every artifact is
 * reproducible from (seed, prompt, intentId).
 */

import { sha256Hex, sha256Prefixed, stableStringify } from "../core/hash.js";
import { seededRng } from "./embeddings.js";

export const GEN_IMAGE_VERSION = "sme-gen-deterministic-image-v1.0.0";
export const GEN_AUDIO_VERSION = "sme-gen-deterministic-audio-v1.0.0";

function checksumOf(payload) {
  return sha256Prefixed(stableStringify(payload));
}

/**
 * Generate a deterministic RGB image artifact from a prompt.
 * @returns {object} GEN_ARTIFACT with pixels, params, trace, evidenceId, checksum
 */
export function generateImage({
  prompt,
  seed = 0,
  intentId = "intent.default",
  width = 32,
  height = 32,
  steps = 4,
}) {
  const rng = seededRng(`${intentId}:${prompt}:${seed}:image`);
  const f1 = 2 + rng() * 4;
  const f2 = 2 + rng() * 4;
  const phase = rng() * Math.PI * 2;
  const cx = width / 2;
  const cy = height / 2;
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / width;
      const dy = (y - cy) / height;
      const r = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx);
      const v = 0.5 + 0.5 * Math.sin(f1 * r * Math.PI * 2 - theta * f2 + phase) * Math.cos(r * Math.PI * f2);
      const i = (y * width + x) * 3;
      pixels[i] = Math.round(255 * v);
      pixels[i + 1] = Math.round(255 * (1 - v));
      pixels[i + 2] = Math.round(255 * Math.abs(Math.sin(r * Math.PI * 3 + phase)));
    }
  }
  const parameters = { prompt, seed, width, height, steps, model: GEN_IMAGE_VERSION };
  const trace = { seed, steps, model: GEN_IMAGE_VERSION };
  const evidenceId = `ev-gen-image-${sha256Hex(`${intentId}:${prompt}:${seed}`).slice(0, 12)}`;
  return {
    modality: "image",
    mimeType: "image/x-raw-rgb",
    width,
    height,
    pixels,
    parameters,
    trace,
    evidenceId,
    checksum: checksumOf({ pixels: Array.from(pixels), parameters }),
    modelVersion: GEN_IMAGE_VERSION,
  };
}

/**
 * Generate a deterministic PCM audio artifact from text.
 * @returns {object} GEN_ARTIFACT with pcm samples, params, trace, evidenceId, checksum
 */
export function generateAudio({
  text,
  seed = 0,
  intentId = "intent.default",
  sampleRate = 16000,
  durationSec = 2,
}) {
  const rng = seededRng(`${intentId}:${text}:${seed}:audio`);
  const baseFreq = 120 + rng() * 200;
  const vibratoFreq = 4 + rng() * 3;
  const n = Math.floor(sampleRate * durationSec);
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / durationSec);
    const freq = baseFreq * (1 + 0.04 * Math.sin(2 * Math.PI * vibratoFreq * t));
    pcm[i] = env * Math.sin(2 * Math.PI * freq * t);
  }
  const parameters = { text, seed, sampleRate, durationSec, model: GEN_AUDIO_VERSION };
  const trace = { seed, model: GEN_AUDIO_VERSION };
  const evidenceId = `ev-gen-audio-${sha256Hex(`${intentId}:${text}:${seed}`).slice(0, 12)}`;
  const rounded = Array.from(pcm).map((s) => s.toFixed(6));
  return {
    modality: "audio",
    mimeType: "audio/x-pcm-float32",
    sampleRate,
    durationSec,
    pcm,
    parameters,
    trace,
    evidenceId,
    checksum: checksumOf({ samples: rounded, parameters }),
    modelVersion: GEN_AUDIO_VERSION,
  };
}
