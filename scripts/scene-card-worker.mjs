#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { parseSceneSpecification } from "../mrs/packages/renderer-core/src/scene-spec/parse.js";

const SCENE_CARDS_DIR = resolve(import.meta.dirname, "scene-cards");
const OUTPUT_DIR = resolve(import.meta.dirname, "../output/scene-cards");

function validateSceneCard(filePath) {
  const raw = readFileSync(filePath, "utf8");
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, file: basename(filePath), errors: [{ path: "$", message: `JSON parse error: ${e.message}` }] };
  }

  const result = parseSceneSpecification(json);
  return { ...result, file: basename(filePath), id: json.id };
}

function listSceneCards() {
  return readdirSync(SCENE_CARDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => resolve(SCENE_CARDS_DIR, f));
}

function writeValidatedCard(card, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const outPath = resolve(outputDir, `${card.id}.json`);
  writeFileSync(outPath, JSON.stringify(card, null, 2));
  return outPath;
}

// Main
const args = process.argv.slice(2);
const mode = args[0] || "validate";

if (mode === "validate") {
  const files = args.length > 1 ? args.slice(1) : listSceneCards();
  let pass = 0;
  let fail = 0;

  for (const file of files) {
    const result = validateSceneCard(file);
    if (result.ok) {
      console.log(`  PASS  ${result.file} (id: ${result.id})`);
      pass++;
    } else {
      console.log(`  FAIL  ${result.file}`);
      for (const err of result.errors) {
        console.log(`        ${err.path}: ${err.message}`);
      }
      fail++;
    }
  }

  console.log(`\n${pass} passed, ${fail} failed out of ${pass + fail} scene cards`);
  process.exit(fail > 0 ? 1 : 0);
} else if (mode === "render-all") {
  const files = listSceneCards();
  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const file of files) {
    const result = validateSceneCard(file);
    if (!result.ok) {
      console.error(`Skipping ${result.file}: validation failed`);
      continue;
    }
    const json = JSON.parse(readFileSync(file, "utf8"));
    const outPath = writeValidatedCard(json, OUTPUT_DIR);
    console.log(`  WROTE  ${outPath}`);
  }
  console.log(`\nAll valid scene cards written to ${OUTPUT_DIR}`);
} else {
  console.error(`Usage: node scene-card-worker.mjs [validate|render-all] [files...]`);
  process.exit(1);
}
