/**
 * Mythar organ — sound lattice from η / |∇φ| plus optional spoken caption.
 * edge-tts is the working TTS (kokoro AVX2-blocked). shimmer → en-US-AvaNeural.
 * Status: **partial** (procedural wav working; TTS if edge-tts present).
 */

import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { meanGradMag, etaAt } from "../materials/index.mjs";

export const MYTHAR_STATUS = "partial";
export const VOICE_MAP = Object.freeze({
  shimmer: "en-US-AvaNeural",
  alloy: "en-US-AndrewNeural",
  echo: "en-US-BrianNeural",
  fable: "en-US-ChristopherNeural",
  onyx: "en-US-AndrewNeural",
  nova: "en-US-EmmaNeural",
});

export function writeWavPcm16(samples, sampleRate = 8000) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  return buf;
}

export function soundLattice(snapshot, { seconds = 1, sampleRate = 8000 } = {}) {
  const n = Math.max(1, Math.round(seconds * sampleRate));
  const samples = new Float32Array(n);
  const g = meanGradMag(snapshot.vector, snapshot.shape.cellCount);
  const freq = 196 + 220 * Math.min(1, g * 4);
  const seed = snapshot.seed | 0;
  const t0 = snapshot.t | 0;
  for (let i = 0; i < n; i++) {
    const tt = i / sampleRate;
    const tone = Math.sin(2 * Math.PI * freq * tt);
    const eta = etaAt(i % snapshot.shape.nx, (i >> 3) % snapshot.shape.ny, t0 % snapshot.shape.nz, t0, seed);
    samples[i] = 0.38 * tone + 0.12 * eta;
  }
  return {
    organ: "Mythar",
    kind: "sound-lattice",
    status: MYTHAR_STATUS,
    sampleRate,
    seconds,
    freq,
    meanGradMag: g,
    wav: writeWavPcm16(samples, sampleRate),
    mutatesCertified: false,
    stateHash: snapshot.hash,
    t: snapshot.t,
  };
}

export function speakEdgeTts(text, { voice = "shimmer", timeoutMs = 12000 } = {}) {
  const edgeVoice = VOICE_MAP[voice] || voice || "en-US-AvaNeural";
  const tmpPath = join(tmpdir(), `mandala-mythar-${process.pid}.mp3`);
  try {
    execFileSync("edge-tts", ["--text", text, "--voice", edgeVoice, "--write-media", tmpPath], {
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!existsSync(tmpPath)) {
      return { status: "blocked-with-evidence", reason: "edge-tts wrote no file", voice: edgeVoice };
    }
    const buf = readFileSync(tmpPath);
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    return {
      status: "partial",
      backend: "edge-tts",
      voice: edgeVoice,
      bytes: buf.length,
      mp3: buf,
    };
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    return {
      status: "blocked-with-evidence",
      backend: "edge-tts",
      voice: edgeVoice,
      reason: err?.message?.slice(0, 240) || String(err),
    };
  }
}

export function speak(snapshot, { caption = "", voice = "shimmer", tryTts = true } = {}) {
  const lattice = soundLattice(snapshot);
  const text =
    caption ||
    `Certified slice ${snapshot.t}. Constitution ${snapshot.constitutionId}. Hash ${String(snapshot.hash).slice(0, 12)}.`;
  const tts = tryTts ? speakEdgeTts(text, { voice }) : { status: "skipped", reason: "tryTts=false" };
  return {
    organ: "Mythar",
    status: MYTHAR_STATUS,
    lattice,
    caption: text,
    tts: tts.mp3 ? { ...tts, mp3: undefined, bytes: tts.bytes } : tts,
    mp3: tts.mp3 || null,
    wav: lattice.wav,
    mutatesCertified: false,
  };
}

export function writeMytharFiles(dir, spoken, { writeFileSync: wf = writeFileSync } = {}) {
  const wavPath = join(dir, "mythar-lattice.wav");
  wf(wavPath, spoken.wav);
  const out = { wavPath, mp3Path: null };
  if (spoken.mp3) {
    out.mp3Path = join(dir, "mythar-caption.mp3");
    wf(out.mp3Path, spoken.mp3);
  }
  return out;
}
