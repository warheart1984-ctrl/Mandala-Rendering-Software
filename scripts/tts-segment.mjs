#!/usr/bin/env node
/**
 * TTS Segment Generator — generates speech audio via edge-tts (Microsoft) or Lemonade kokoro-v1.
 *
 * Usage:
 *   node tts-segment.mjs "Hello world" output.mp3 --voice shimmer
 *
 * Voices (edge-tts): en-US-AvaNeural, en-US-AndrewNeural, en-US-BrianNeural, etc.
 * Voices (kokoro): shimmer, alloy, echo, fable, onyx, nova
 */
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEMONADE_HOST = process.env.LEMONADE_HOST || "localhost";
const LEMONADE_PORT = process.env.LEMONADE_PORT || "13305";
const LEMONADE_API_KEY = process.env.LEMONADE_API_KEY || "";

// Voice mapping: kokoro voice → edge-tts voice
const VOICE_MAP = {
  shimmer: "en-US-AvaNeural",
  alloy: "en-US-AndrewNeural",
  echo: "en-US-BrianNeural",
  fable: "en-US-ChristopherNeural",
  onyx: "en-US-AndrewNeural",
  nova: "en-US-EmmaNeural",
};

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node tts-segment.mjs <text> <output-path> [--voice <voice>]");
  process.exit(1);
}

const text = args[0];
const outputPath = resolve(args[1]);
let voice = "shimmer";

for (let i = 2; i < args.length; i++) {
  if (args[i] === "--voice" && args[i + 1]) voice = args[++i];
}

async function generateWithEdgeTTS(text, outputPath, voice) {
  const edgeVoice = VOICE_MAP[voice] || voice || "en-US-AvaNeural";
  const tmpPath = outputPath.replace(/\.[^.]+$/, ".tmp.mp3");

  try {
    execSync(
      `edge-tts --text ${JSON.stringify(text)} --voice ${edgeVoice} --write-media ${JSON.stringify(tmpPath)}`,
      { stdio: "pipe", timeout: 15000 }
    );
    const { readFileSync } = await import("node:fs");
    const buffer = readFileSync(tmpPath);
    writeFileSync(outputPath, buffer);
    try { require("node:fs").unlinkSync(tmpPath); } catch {}
    console.log(`  TTS: ${buffer.length} bytes → ${outputPath} (${edgeVoice})`);
    return outputPath;
  } catch (err) {
    console.error(`  edge-tts error: ${err.message?.slice(0, 100)}`);
    throw err;
  }
}

async function generateWithLemonade(text, outputPath, voice) {
  const url = `http://${LEMONADE_HOST}:${LEMONADE_PORT}/api/v1/audio/speech`;
  const headers = { "Content-Type": "application/json" };
  if (LEMONADE_API_KEY) headers["Authorization"] = `Bearer ${LEMONADE_API_KEY}`;

  const body = JSON.stringify({
    model: "kokoro-v1",
    input: text,
    voice,
    response_format: "mp3",
  });

  const response = await fetch(url, { method: "POST", headers, body });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${errText.slice(0, 100)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(outputPath, buffer);
  console.log(`  TTS: ${buffer.length} bytes → ${outputPath} (${voice})`);
  return outputPath;
}

async function generateTTS() {
  // Try edge-tts first (works without Lemonade)
  try {
    return await generateWithEdgeTTS(text, outputPath, voice);
  } catch (edgeErr) {
    // Fall back to Lemonade
    try {
      return await generateWithLemonade(text, outputPath, voice);
    } catch (lemonErr) {
      console.error(`  TTS: both edge-tts and Lemonade failed`);
      console.error(`    edge-tts: ${edgeErr.message?.slice(0, 60)}`);
      console.error(`    Lemonade: ${lemonErr.message?.slice(0, 60)}`);
      throw new Error("TTS unavailable", { cause: lemonErr });
    }
  }
}

generateTTS().catch(() => process.exit(1));
