#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";

const OUTPUT_DIR = resolve(import.meta.dirname, "../output/pipeline");

const SAMPLE_RATE = 22050;
const BIT_DEPTH = 16;
const CHANNELS = 2;

// Mythar voice config from data.py
const MYTHAR_BASELINE_F0 = 180;
const PROSODY_RULES = {
  P01: { name: "First-Syllable Stress", f0Peak: 200, amplitudeBoost: 1.1 },
  P02: { name: "Open-Vowel Terminal", lengthen: 1.1, preserveFormants: true },
  P03: { name: "CV Flow Continuity", glideVelocity: 2000, nasalityCoef: 0.1 },
  P04: { name: "Intensifier Prefix", amplitudeCoef: 1.2, durationCoef: 1.15 },
  P05: { name: "Divine Suffix", pitchShift: 30, tempoReduce: 0.95 },
  P06: { name: "Root-Consonant Carry", intensityCoef: 1.1, vowelReduce: 0.9 },
  P07: { name: "Diphthong Glide", glideDuration: 0.4, lengthen: 1.1 },
};

function generateAmbientAudio(sceneCard) {
  const meta = sceneCard.metadata || {};
  const genome = meta.emotionGenome || { valence: 0.5, arousal: 0.5, dominance: 0.5 };
  const duration = meta.duration || 3;
  const sampleCount = Math.ceil(duration * SAMPLE_RATE);

  // Map emotion genome to audio parameters
  const { valence, arousal, dominance } = genome;

  // Base frequency: higher valence = brighter, higher arousal = higher pitch
  const baseFreq = MYTHAR_BASELINE_F0 + (valence - 0.5) * 40 + (arousal - 0.5) * 60;

  // Formant frequencies (Mythar: F1 700-850, F2 1000, F3 2200)
  const f1 = 700 + valence * 150;
  const f2 = 1000 + arousal * 400;
  const f3 = 2200 + dominance * 600;

  // Amplitude: higher arousal = louder
  const amplitude = 0.3 + arousal * 0.4;

  // Breathing rate: higher arousal = faster modulation
  const breathRate = 1.5 + arousal * 3;

  // Prosody rule effects
  const p04Boost = 1.0 + (1 - valence) * 0.2; // Intensifier for low valence
  const p05Shift = dominance * 30; // Divine suffix for high dominance
  const p07Glide = valence * 0.3; // Diphthong glide for high valence

  const samples = new Float32Array(sampleCount * CHANNELS);

  for (let i = 0; i < sampleCount; i++) {
    const t = i / SAMPLE_RATE;
    const progress = i / sampleCount;

    // F0 contour: rising-falling based on valence
    let f0 = baseFreq;
    if (progress < 0.4) {
      f0 += (progress / 0.4) * 20 * valence;
    } else {
      f0 += ((1 - progress) / 0.6) * 20 * valence;
    }
    f0 += p05Shift * Math.sin(progress * Math.PI); // Divine suffix modulation

    // Formant synthesis
    const f1Mod = f1 + Math.sin(t * breathRate * Math.PI * 2) * 20;
    const f2Mod = f2 + Math.sin(t * breathRate * 1.5 * Math.PI * 2) * 30;
    const f3Mod = f3 + Math.sin(t * breathRate * 0.7 * Math.PI * 2) * 40;

    // Generate tone
    const fundamental = Math.sin(2 * Math.PI * f0 * t);
    const formant1 = Math.sin(2 * Math.PI * f1Mod * t) * 0.4;
    const formant2 = Math.sin(2 * Math.PI * f2Mod * t) * 0.2;
    const formant3 = Math.sin(2 * Math.PI * f3Mod * t) * 0.1;

    // Apply prosody envelopes
    let env = 1.0;

    // P-04: Intensifier prefix (first 10%)
    if (progress < 0.1) {
      env *= p04Boost;
    }

    // P-02: Open-vowel terminal (last 20%)
    if (progress > 0.8) {
      env *= 1.1;
    }

    // P-07: Diphthong glide (smooth transitions)
    if (progress > 0.3 && progress < 0.7) {
      env *= 1.0 + p07Glide * Math.sin((progress - 0.3) / 0.4 * Math.PI);
    }

    // Breathing modulation
    const breath = 1.0 + Math.sin(t * breathRate * Math.PI * 2) * 0.15;

    // Combine
    const sample = (fundamental + formant1 + formant2 + formant3) * amplitude * env * breath * 0.5;

    // Stereo with slight phase offset
    samples[i * 2] = sample;
    samples[i * 2 + 1] = sample * 0.98 + Math.sin(2 * Math.PI * f0 * (t + 0.001)) * amplitude * 0.02;
  }

  return samples;
}

function encodeWav(samples, sampleRate, channels, bitDepth) {
  const bytesPerSample = bitDepth / 8;
  const dataLength = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataLength);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitDepth, 34);

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);

  // Write samples
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    const intSample = sample < 0 ? sample * 32768 : sample * 32767;
    buffer.writeInt16LE(Math.round(intSample), 44 + i * bytesPerSample);
  }

  return buffer;
}

function generateAmbient(sceneCardPath, outputPath) {
  const sceneCard = JSON.parse(readFileSync(sceneCardPath, "utf8"));
  const meta = sceneCard.metadata || {};
  const genome = meta.emotionGenome || {};

  console.log(`  Ambient soundscape for ${sceneCard.id}: emotion=${meta.emotion}, duration=${meta.duration}s`);
  console.log(`  Genome: valence=${genome.valence}, arousal=${genome.arousal}, dominance=${genome.dominance}`);

  const samples = generateAmbientAudio(sceneCard);
  const wav = encodeWav(samples, SAMPLE_RATE, CHANNELS, BIT_DEPTH);

  mkdirSync(resolve(outputPath, ".."), { recursive: true });
  writeFileSync(outputPath, wav);
  console.log(`  Output: ${outputPath} (${wav.length} bytes, ${meta.duration || 3}s)`);
  return { outputPath, duration: meta.duration || 3 };
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node ambient-soundscape.mjs <scene-card.json> [output.wav]");
  process.exit(1);
}

const sceneCardPath = resolve(args[0]);
const outputPath = args[1] ? resolve(args[1]) : resolve(OUTPUT_DIR, basename(sceneCardPath, ".json") + "-ambient.wav");

generateAmbient(sceneCardPath, outputPath);
