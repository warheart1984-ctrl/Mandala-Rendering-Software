#!/usr/bin/env node
/**
 * expand-world-document.mjs — Expand Engine3D generator stubs to full worlds.
 *
 * Status: **enforced** by prompt-scene-bridge expand tests (star + mandala).
 * Uses createWorldGenerator + generateWorldFromGenerator from built dist.
 *
 * Usage:
 *   node scripts/expand-world-document.mjs --in stub.json
 *   type stub.json | node scripts/expand-world-document.mjs
 *   node scripts/expand-world-document.mjs --in stub.json --out world.json
 *
 * Requires: npm run build in engine3d-core (dist/ present).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", reject);
  });
}

async function loadApi() {
  const dist = join(PKG_ROOT, "dist", "src", "world", "WorldGenerator.js");
  if (!existsSync(dist)) {
    throw new Error(
      `Built module missing: ${dist}. Run: npm run build (in engine3d-core)`,
    );
  }
  return import(pathToFileURL(dist).href);
}

function normalizeParams(raw) {
  const params = {};
  if (!raw || typeof raw !== "object") return params;
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v);
    if (Number.isFinite(n)) params[k] = n;
  }
  return params;
}

function expandDocument(doc, createWorldGenerator, generateWorldFromGenerator) {
  if (!doc || typeof doc !== "object") {
    throw new Error("world document must be a JSON object");
  }
  const objects = Array.isArray(doc.objects) ? doc.objects : [];
  if (objects.length > 0) {
    return doc;
  }
  const g = doc.generator;
  if (!g || typeof g !== "object") {
    throw new Error("generator stub missing generator field");
  }
  const type = String(g.type || "");
  if (!type) {
    throw new Error("generator.type is required");
  }
  const seed = Number(g.seed) >>> 0;
  const params = normalizeParams(g.params);
  const generator = createWorldGenerator(type, seed, params);
  if (typeof g.id === "string" && g.id.trim()) {
    generator.id = g.id;
  }
  const world = generateWorldFromGenerator(generator);
  const out = { ...world };
  if (typeof doc.id === "string" && doc.id.trim()) {
    out.id = doc.id;
  }
  if (doc.promptBridge && typeof doc.promptBridge === "object") {
    out.promptBridge = doc.promptBridge;
  }
  if (doc.activeCameraId && !out.activeCameraId) {
    out.activeCameraId = doc.activeCameraId;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let raw;
  if (typeof args.in === "string") {
    raw = readFileSync(args.in, "utf8");
  } else if (!process.stdin.isTTY) {
    raw = await readStdin();
  } else {
    process.stderr.write(
      "expand-world-document: pass --in <file> or pipe JSON on stdin\n",
    );
    process.exit(2);
  }
  const doc = JSON.parse(raw);
  const { createWorldGenerator, generateWorldFromGenerator } = await loadApi();
  // createWorldGenerator returns a plain object; allow id override below via mutate copy
  const create = (type, seed, params) => {
    const g = createWorldGenerator(type, seed, params);
    return { ...g };
  };
  const expanded = expandDocument(doc, create, generateWorldFromGenerator);
  const text = JSON.stringify(expanded);
  if (typeof args.out === "string") {
    writeFileSync(args.out, text, "utf8");
  } else {
    process.stdout.write(text);
    if (!text.endsWith("\n")) process.stdout.write("\n");
  }
}

main().catch((err) => {
  process.stderr.write(`expand-world-document: ${err?.message || err}\n`);
  process.exit(1);
});
