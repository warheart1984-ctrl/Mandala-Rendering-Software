/**
 * Temporal 4D Simulation Chamber runner — space through time (partial).
 *
 * Usage:
 *   node scripts/simulation-chamber-temporal.mjs scene-temporal-4d \
 *     --out output/simulation/temporal-4d-demo
 *
 * Also: node scripts/simulation-chamber.mjs scene-temporal-4d --temporal
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runTemporal4dChamber } from "../mandala/engine/chamber/temporal-4d-loop.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

function parseArgs(argv) {
  const positional = [];
  const options = {
    out: null,
    frames: null,
    keyframes: null,
    width: null,
    height: null,
    sliceMode: null,
    rings: null,
    segs: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--temporal" || a === "--holo") continue;
    if (a === "--out" && argv[i + 1]) options.out = argv[++i];
    else if (a === "--frames" && argv[i + 1]) options.frames = parseInt(argv[++i], 10);
    else if (a === "--keyframes" && argv[i + 1]) options.keyframes = parseInt(argv[++i], 10);
    else if (a === "--width" && argv[i + 1]) options.width = parseInt(argv[++i], 10);
    else if (a === "--height" && argv[i + 1]) options.height = parseInt(argv[++i], 10);
    else if (a === "--slice-mode" && argv[i + 1]) options.sliceMode = argv[++i];
    else if (a === "--rings" && argv[i + 1]) options.rings = parseInt(argv[++i], 10);
    else if (a === "--segs" && argv[i + 1]) options.segs = parseInt(argv[++i], 10);
    else if (a.startsWith("-")) {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    } else positional.push(a);
  }
  return { positional, options };
}

function resolveSceneCard(raw) {
  if (!raw) return join(__dirname, "scene-cards", "scene-temporal-4d.json");
  if (existsSync(raw)) return resolve(raw);
  const short = String(raw).replace(/\.json$/i, "");
  const named = join(__dirname, "scene-cards", `${short}.json`);
  if (existsSync(named)) return named;
  const asRepo = resolve(REPO, raw);
  if (existsSync(asRepo)) return asRepo;
  return resolve(raw);
}

const { positional, options } = parseArgs(process.argv.slice(2));
const sceneCardPath = resolveSceneCard(positional[0] || "scene-temporal-4d");
if (!existsSync(sceneCardPath)) {
  console.error(`Scene card not found: ${sceneCardPath}`);
  process.exit(1);
}

const sceneCard = JSON.parse(readFileSync(sceneCardPath, "utf8"));
const t4 = sceneCard.temporal4d || {};
const outDir = options.out
  ? resolve(options.out)
  : resolve(REPO, "output/simulation", "temporal-4d-demo");

console.log(`\nSimulation Chamber — Temporal 4D (partial)`);
console.log("=".repeat(60));
console.log(`  Scene: ${sceneCard.name || sceneCard.id}`);
console.log(`  Claim: ${sceneCard.claim || "space through time"}`);
console.log(`  Out: ${outDir}`);
console.log(`  Disclaimer: not medical · not photoreal · soft-raster only`);

const result = await runTemporal4dChamber({
  sceneCard,
  outDir,
  width: options.width ?? t4.width ?? 320,
  height: options.height ?? t4.height ?? 240,
  frames: options.frames ?? t4.frames ?? 8,
  keyframes: options.keyframes ?? t4.keyframes ?? 5,
  rings: options.rings ?? t4.rings ?? 10,
  segs: options.segs ?? t4.segs ?? 16,
  sliceMode: options.sliceMode ?? t4.sliceMode ?? "slide",
});

console.log(`\n=== Done ===`);
console.log(`  Frames: ${result.frameCount}`);
console.log(`  Composite: ${join(outDir, "composite.png")}`);
console.log(`  Energy-wire: ${join(outDir, "composite-energy-wire.png")}`);
console.log(`  Wall: ${result.wallMs.toFixed(0)} ms`);
console.log(`  Solid verts: ${result.receipt.math4d.solidVertices}`);
console.log(`  Insight phase: ${result.receipt.composite?.insightPhase}`);
console.log(`  Receipt: ${join(outDir, "receipt.json")}`);
console.log(`  Watch: ${join(outDir, "watch.html")}`);
console.log(`  Serve: python3 -m http.server 8766  (cwd=${outDir})`);
console.log(`  URL: http://127.0.0.1:8766/watch.html`);
process.exit(result.ok ? 0 : 1);
