#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { execSync } from "node:child_process";

const OUTPUT_DIR = resolve(import.meta.dirname, "../output/pipeline");
const LEMONADE_URL = process.env.LEMONADE_SD_URL || "http://127.0.0.1:13306";

const EMOTION_PROMPTS = {
  awe: "ethereal divine majestic soft glowing light sacred cathedral atmosphere",
  tension: "dark ominous foreboding claustrophobic tight shadows cold blue light",
  calm: "serene peaceful soft gentle warm light tranquil ocean breeze",
  fury: "violent intense burning red hot aggressive dynamic storm flames",
  peace: "gentle warm serene soft green garden calm morning light",
};

function buildEmotionPrompt(sceneCard) {
  const meta = sceneCard.metadata || {};
  const emotion = meta.emotion || "calm";
  const setting = meta.setting || "";
  const base = EMOTION_PROMPTS[emotion] || EMOTION_PROMPTS.calm;
  return `${base} ${setting} atmosphere`;
}

async function emotionalPass(inputPngPath, sceneCardPath, outputPath) {
  const sceneCard = JSON.parse(readFileSync(sceneCardPath, "utf8"));
  const prompt = buildEmotionPrompt(sceneCard);
  const meta = sceneCard.metadata || {};
  const genome = meta.emotionGenome || {};

  console.log(`  Emotional pass: "${prompt}"`);
  console.log(`  Genome: valence=${genome.valence}, arousal=${genome.arousal}, dominance=${genome.dominance}`);

  // Read input image as base64
  const inputPng = readFileSync(inputPngPath);
  const base64Image = inputPng.toString("base64");

  // Call SD-Turbo img2img via Lemonade
  const requestBody = {
    init_images: [base64Image],
    prompt: prompt,
    negative_prompt: "blurry low quality distorted ugly",
    denoising_strength: 0.45,
    seed: 42,
    steps: 14,
    cfg_scale: 7.0,
    width: 512,
    height: 512,
    sampler_name: "Euler a",
  };

  try {
    const response = execSync(
      `curl -s -X POST ${LEMONADE_URL}/sdapi/v1/img2img ` +
      `-H "Content-Type: application/json" ` +
      `-d '${JSON.stringify(requestBody).replace(/'/g, "'\\''")}'`,
      { maxBuffer: 10 * 1024 * 1024 }
    );

    const result = JSON.parse(response.toString());
    if (result.images && result.images.length > 0) {
      const outputPng = Buffer.from(result.images[0], "base64");
      mkdirSync(resolve(outputPath, ".."), { recursive: true });
      writeFileSync(outputPath, outputPng);
      console.log(`  Output: ${outputPath} (${outputPng.length} bytes)`);
      return { outputPath, prompt, genome };
    } else {
      console.error("  No images returned from SD-Turbo");
      return null;
    }
  } catch (err) {
    console.error(`  SD-Turbo error: ${err.message}`);
    // Fallback: copy input as output
    mkdirSync(resolve(outputPath, ".."), { recursive: true });
    writeFileSync(outputPath, inputPng);
    console.log(`  Fallback: copied input to ${outputPath}`);
    return { outputPath, prompt, genome, fallback: true };
  }
}

// Main
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node emotional-passer.mjs <input.png> <scene-card.json> [output.png]");
  process.exit(1);
}

const inputPngPath = resolve(args[0]);
const sceneCardPath = resolve(args[1]);
const outputPath = args[2] ? resolve(args[2]) : resolve(OUTPUT_DIR, basename(inputPngPath, ".png") + "-painted.png");

emotionalPass(inputPngPath, sceneCardPath, outputPath).then((result) => {
  if (result) {
    console.log("  Done.");
  }
}).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
