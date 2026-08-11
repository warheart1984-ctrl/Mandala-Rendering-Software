#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const LEMONADE_URL = process.env.LEMONADE_URL || "http://localhost:13305/api/v1";

const AUDIO_DIR = "output/trailer_ch1/_audio";
mkdirSync(AUDIO_DIR, { recursive: true });

const TRACKS = [
  {
    id: "trailer_01_narration",
    text: "The Archive remembers what we choose to forget. Every consent given. Every refusal recorded.",
    voice: "shimmer",
    model: "kokoro-v1",
    file: "trailer_01_narration.wav"
  },
  {
    id: "trailer_02_archivist",
    text: "Every choice echoes through these halls. Your consent is not a signature. It's a covenant.",
    voice: "onyx",
    model: "kokoro-v1",
    file: "trailer_02_archivist.wav"
  },
  {
    id: "trailer_03_hero",
    text: "The burden of contradiction... I carry it willingly. The Archive of Consent. Book One. Coming soon.",
    voice: "echo",
    model: "kokoro-v1",
    file: "trailer_03_hero.wav"
  }
];

async function generateTTS(track) {
  const url = `${LEMONADE_URL}/audio/speech`;
  const body = {
    model: track.model,
    input: track.text,
    voice: track.voice,
    response_format: "wav"
  };
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`TTS failed for ${track.id}: ${response.status} ${err}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const outPath = join("output/trailer_ch1/_audio", track.file);
  writeFileSync(join(process.cwd(), "output/trailer_ch1/_audio", track.file), buffer);
  console.log(`[tts] Generated ${track.file} (${buffer.length} bytes)`);
}

async function main() {
  console.log("[trailer-tts] Generating narration tracks via Lemonade...");
  for (const track of TRACKS) {
    try {
      await generateTTS(track);
    } catch (err) {
      console.error(`[tts] Failed ${track.id}:`, err.message);
    }
  }
  console.log("[tts] Done.");
}

main().catch(err => {
  console.error("[tts] ERROR:", err);
  process.exit(1);
});