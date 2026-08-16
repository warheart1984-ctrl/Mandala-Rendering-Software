/**
 * SME-AUD deterministic transcription simulation.
 * Status: canonical (CPU-bound, seed-reproducible)
 *
 * Implements the SME-AUD-IFC contract shape: AUD_RAW -> AUD_TRANSCRIPT,
 * AUD_EMBED (256-dim), AUD_TIMECODES. Segments and timecodes are derived from
 * the real PCM waveform (frame RMS activity), giving time-aligned, replayable
 * output. Transcript text is a deterministic tokenization of the emitted
 * response (the "spoken" phrase is the TXT response itself), so transcript is
 * reproducible and aligned for replay/audit.
 */

import { sha256Hex, sha256Prefixed, stableStringify } from "../core/hash.js";
import { seededRng, featureProjection } from "./embeddings.js";

export const AUD_VERSION = "sme-aud-deterministic-v1.0.0";
export const AUD_EMBED_DIM = 256;

const FRAME_MS = 20;

function frameRms(pcm, sampleRate) {
  const frameSize = Math.floor((sampleRate * FRAME_MS) / 1000);
  const frames = [];
  for (let i = 0; i < pcm.length; i += frameSize) {
    let sum = 0;
    let n = 0;
    for (let j = i; j < Math.min(i + frameSize, pcm.length); j++) {
      sum += pcm[j] * pcm[j];
      n++;
    }
    frames.push(n ? Math.sqrt(sum / n) : 0);
  }
  return frames;
}

function buildSegments(pcm, sampleRate) {
  const rms = frameRms(pcm, sampleRate);
  const frameSize = Math.floor((sampleRate * FRAME_MS) / 1000);
  const threshold = 0.25 * (Math.max(...rms) || 1);
  const segments = [];
  let inSpeech = false;
  let startFrame = 0;
  for (let f = 0; f < rms.length; f++) {
    if (rms[f] > threshold && !inSpeech) {
      inSpeech = true;
      startFrame = f;
    } else if (rms[f] <= threshold && inSpeech) {
      inSpeech = false;
      segments.push({
        id: segments.length,
        start: (startFrame * frameSize) / sampleRate,
        end: (f * frameSize) / sampleRate,
      });
    }
  }
  if (inSpeech) {
    segments.push({
      id: segments.length,
      start: (startFrame * frameSize) / sampleRate,
      end: pcm.length / sampleRate,
    });
  }
  return segments;
}

/**
 * Transcribe an audio artifact into transcript + embedding + timecodes.
 */
export function transcribeAudio(audio, { seed = 0, intentId = "intent.default", spokenText = "" }) {
  const { pcm, sampleRate } = audio;
  const segments = buildSegments(pcm, sampleRate);

  const rng = seededRng(`${intentId}:aud:${seed}`);
  const words = String(spokenText)
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const timecodes = segments.map((seg) => {
    const count = Math.max(1, Math.floor(seg.end - seg.start));
    const startIdx = Math.floor(rng() * Math.max(1, words.length - count + 1));
    const text = words.length ? words.slice(startIdx, startIdx + count).join(" ") : ".";
    return { ...seg, text, confidence: 0.9 + 0.05 * rng() };
  });

  const transcript = timecodes.map((tc) => tc.text).join(" ") || ".";

  const frameStats = frameRms(pcm, sampleRate);
  const embedding = featureProjection(frameStats, AUD_EMBED_DIM, `${intentId}:aud:proj:${seed}`);

  const evidenceId = `ev-aud-${sha256Hex(`${intentId}:${audio.checksum}`).slice(0, 12)}`;
  const checksum = sha256Prefixed(
    stableStringify({ transcript, timecodes, embedding, sampleRate })
  );

  return {
    modality: "audio",
    transcript,
    timecodes,
    embedding,
    evidenceId,
    checksum,
    modelVersion: AUD_VERSION,
    sourceChecksum: audio.checksum,
    sampleRate,
  };
}
