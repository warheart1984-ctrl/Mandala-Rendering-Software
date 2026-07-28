#!/usr/bin/env node
/**
 * run_proton_pipeline.mjs — Prompt→CIR→protons→soft splat pipeline.
 *
 * STATUS: **enforced** (demo hyperspheres; scene-spec optional)
 * Imports renderer-core proton module via dual-layout resolution
 * (monorepo `mrs/packages/...` or Docker `/app/renderer-core`).
 */

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";

import { mintCir } from "./mintCir.js";
import {
  resolveEncodePngPath,
  resolveProtonIndexPath,
  scriptDir,
  toFileUrl,
} from "./resolveDualLayout.mjs";

const __dirname = scriptDir(import.meta.url);

const USAGE = `run_proton_pipeline.mjs — proton raster pipeline (STATUS: enforced)

Usage:
  node run_proton_pipeline.mjs --help
  node run_proton_pipeline.mjs --demo [--width N] [--height N] [--output out.png]
  node run_proton_pipeline.mjs --prompt "..." [--width N] [--height N] [--output out.png]
  node run_proton_pipeline.mjs --scene-spec path.json [...]

Pipeline:
  mintCir → fromHyperspheres|fromSceneSpec
         → ProtonRegistry → projectFootprint → softSplatAccumulate → PNG + evidence

Layout: monorepo mrs/packages/renderer-core or Docker /app/renderer-core
  ENV overrides: PROTON_INDEX_MODULE, RT4D_SCRIPT_PATH / PROTON_ENCODE_PNG_SCRIPT
`;

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--demo") out.demo = true;
    else if (a.startsWith("--") && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      out[a.slice(2)] = argv[++i];
    } else if (a.startsWith("--")) {
      out[a.slice(2)] = true;
    }
  }
  return out;
}

/**
 * @param {Record<string, string|boolean>} args
 */
async function run(args) {
  const protonIndex = toFileUrl(resolveProtonIndexPath(__dirname));
  const encodePngUrl = toFileUrl(resolveEncodePngPath(__dirname));
  const proton = await import(protonIndex);
  const { encodePNG } = await import(encodePngUrl);
  const {
    ProtonRegistry,
    fromHyperspheres,
    fromSceneSpec,
    projectFootprint,
    softSplatAccumulate,
    PROTON_MODULE_STATUS,
  } = proton;

  const width = Math.max(8, parseInt(String(args.width ?? 256), 10) || 256);
  const height = Math.max(8, parseInt(String(args.height ?? 256), 10) || 256);
  const output =
    typeof args.output === "string"
      ? resolve(String(args.output))
      : resolve(process.cwd(), "output/proton-pipeline.png");
  const evidencePath = output.replace(/\.png$/i, "") + ".evidence.json";

  const purpose =
    (typeof args.prompt === "string" && args.prompt) || "proton-raster-mvp";
  const cir = mintCir({
    seed: args.seed ?? "pipeline-demo-1",
    goal: purpose,
    actor: "mrs.proton-raster",
  });

  /** @type {Array<Record<string, unknown>>} */
  let protons;
  if (typeof args["scene-spec"] === "string") {
    const spec = JSON.parse(readFileSync(resolve(String(args["scene-spec"])), "utf8"));
    protons = fromSceneSpec(spec, { intentId: cir.id });
  } else {
    // Demo / prompt path: hardcoded hyperspheres (prompt only seeds CIR purpose)
    protons = fromHyperspheres(
      [
        {
          id: "core",
          mu: [0, 0.1, 0, 0],
          radius: 1.15,
          color: [0.4, 0.9, 1],
          opacity: 0.95,
        },
        {
          id: "sat-0",
          center: [1.5, 0.1, 0.2, 0.2],
          radius: 0.45,
          color: [1, 0.6, 0.25],
          opacity: 0.8,
        },
        {
          id: "sat-1",
          mu: [-1.3, 0.05, -0.15, -0.1],
          radius: 0.4,
          color: [0.5, 1, 0.55],
          opacity: 0.8,
        },
      ],
      { intentId: cir.id },
    );
  }

  const reg = new ProtonRegistry();
  for (const p of protons) reg.add(p);
  const listed = reg.list();
  const protonsHash = reg.hash();
  const footprints = projectFootprint(listed, { width, height });
  const { rgba, evidence } = softSplatAccumulate(footprints, {
    width,
    height,
    intentId: cir.id,
    protonsHash,
    protonCount: listed.length,
    cir,
    worldId: "proton-demo-world",
    parameters: { prompt: purpose, moduleStatus: PROTON_MODULE_STATUS },
  });

  const png = encodePNG(width, height, rgba);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, png);
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        status: "enforced",
        cir,
        protonModuleStatus: PROTON_MODULE_STATUS,
        pngPath: output,
        evidencePath,
        evidence,
        protonCount: listed.length,
        layout: {
          protonIndex,
          encodePng: encodePngUrl,
        },
      },
      null,
      2,
    ) + "\n",
  );
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    process.stdout.write(USAGE);
    process.exit(argv.length === 0 ? 1 : 0);
  }
  const args = parseArgs(argv);
  await run(args);
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});
