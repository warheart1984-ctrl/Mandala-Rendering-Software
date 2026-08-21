#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { parseSceneSpecification } from "../mrs/packages/renderer-core/src/scene-spec/parse.js";
import { renderStill } from "../mrs/packages/renderer-core/scripts/render-still.mjs";

const OUTPUT_DIR = resolve(import.meta.dirname, "../output/pipeline");

function buildPrompt(sceneCard) {
  const parts = [];
  const meta = sceneCard.metadata || {};

  // Geometry → archetype keyword
  const geom = sceneCard.entities?.[0]?.geometry;
  if (geom?.surfaceId) {
    const surfaceMap = {
      "clifford-torus": "torus ring",
      "hopf-surface": "hopf surface",
      "torus-3d": "torus",
      "trefoil-4d": "trefoil knot creature",
      "tesseract": "tesseract hypercube",
    };
    parts.push(surfaceMap[geom.surfaceId] || geom.surfaceId);
  } else if (geom?.kind === "hypersphere") {
    parts.push("sphere orb core");
  } else if (geom?.kind === "hyperplane") {
    parts.push("grid lattice");
  }

  // Palette from material color
  const mat = sceneCard.materials?.[0];
  if (mat?.color) {
    const hex = mat.color.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    if (r > 180 && g < 100 && b < 100) parts.push("red fire lava");
    else if (r < 100 && g > 180 && b < 100) parts.push("green emerald jade");
    else if (r < 100 && g < 100 && b > 180) parts.push("blue cobalt ice");
    else if (r > 200 && g > 150 && b < 80) parts.push("gold amber");
    else if (r > 150 && g < 100 && b > 150) parts.push("violet purple plasma");
    else if (r > 100 && g > 200 && b > 150) parts.push("cyan neon teal");
    else parts.push("mono white silver");
  }

  // Material type from BRDF
  if (mat?.brdf === "ggx") parts.push("glass chrome reflective crystal");

  // Emotion → mood words
  const emotion = meta.emotion || "";
  const emotionWords = {
    awe: "divine ethereal majestic",
    tension: "dark ominous tense",
    calm: "serene peaceful soft",
    fury: "violent intense burning",
    peace: "gentle warm serene",
  };
  if (emotionWords[emotion]) parts.push(emotionWords[emotion]);

  return parts.join(" ");
}

function renderSceneCard(sceneCardPath, outputDir, options = {}) {
  const raw = readFileSync(sceneCardPath, "utf8");
  const json = JSON.parse(raw);

  const validation = parseSceneSpecification(json);
  if (!validation.ok) {
    console.error(`Validation failed for ${basename(sceneCardPath)}:`);
    for (const err of validation.errors) {
      console.error(`  ${err.path}: ${err.message}`);
    }
    return null;
  }

  const output = json.output || {};
  const meta = json.metadata || {};
  const prompt = buildPrompt(json);
  const seed = json.id ? hashString(json.id) : 42;
  const width = options.width || output.width || 128;
  const height = options.height || output.height || 128;
  const samples = options.samples || output.samples || 8;
  const maxDepth = options.maxDepth || output.maxDepth || 3;

  console.log(`  Rendering ${json.id}: "${prompt}" (${width}x${height}, ${samples} spp)`);

  const { png, provenance } = renderStill({
    prompt,
    seed,
    width,
    height,
    samples,
    maxDepth,
  });

  mkdirSync(outputDir, { recursive: true });

  const pngPath = resolve(outputDir, `${json.id}-still.png`);
  const provenancePath = resolve(outputDir, `${json.id}-still-provenance.json`);

  writeFileSync(pngPath, png);
  writeFileSync(provenancePath, JSON.stringify(provenance, null, 2));

  return { pngPath, provenancePath, provenance };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node render-scene-card.mjs <scene-card.json> [output-dir] [--width N] [--height N] [--samples N] [--maxDepth N]");
  process.exit(1);
}

const positionalArgs = [];
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--width" && args[i + 1]) { options.width = parseInt(args[++i]); }
  else if (args[i] === "--height" && args[i + 1]) { options.height = parseInt(args[++i]); }
  else if (args[i] === "--samples" && args[i + 1]) { options.samples = parseInt(args[++i]); }
  else if (args[i] === "--maxDepth" && args[i + 1]) { options.maxDepth = parseInt(args[++i]); }
  else { positionalArgs.push(args[i]); }
}

const sceneCardPath = resolve(positionalArgs[0]);
const outputDir = positionalArgs[1] ? resolve(positionalArgs[1]) : resolve(OUTPUT_DIR, basename(sceneCardPath, ".json"));

const result = renderSceneCard(sceneCardPath, outputDir, options);
if (result) {
  console.log(`  PNG:       ${result.pngPath}`);
  console.log(`  Provenance: ${result.provenancePath}`);
  console.log(`  SHA256:    ${result.provenance.sha256}`);
}
