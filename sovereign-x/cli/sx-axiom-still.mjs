#!/usr/bin/env node
/**
 * Sovereign X — Axiom-X OpenCL still CLI.
 * STATUS: **partial** — live GPU still via Sovereign-X → Axiom-X bridge;
 * assist-only; never print SoT (cpu.rt4d.print is authoritative).
 *
 * Usage:
 *   node sovereign-x/cli/sx-axiom-still.mjs [--intent <id>] [--width 256] [--height 256] [--seed 1.0] [--out path] [--world <id>] [--timeline <id>]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { route, resolveCapability } from "../router/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const proofDir = join(repoRoot, "docs", "4d-engine", "proofs", "axiom-x");

function parseArgs(argv) {
  const out = {
    intent: null,
    width: 256,
    height: 256,
    seed: 1.0,
    world: "world.unknown",
    timeline: "timeline.unknown",
    out: join(proofDir, "axiom-x-still-proof.json"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--intent") out.intent = argv[++i];
    else if (a === "--width") out.width = Number(argv[++i]);
    else if (a === "--height") out.height = Number(argv[++i]);
    else if (a === "--seed") out.seed = Number(argv[++i]);
    else if (a === "--world") out.world = argv[++i];
    else if (a === "--timeline") out.timeline = argv[++i];
    else if (a === "--out") out.out = resolve(argv[++i]);
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: sx-axiom-still [options]
  --intent ID       intent id (default: auto-generated)
  --width N         default 256
  --height N        default 256
  --seed F          default 1.0
  --world ID        default world.unknown
  --timeline ID     default timeline.unknown
  --out PATH        proof JSON path
Runs the Axiom-X legacy_still OpenCL kernel on the host GPU through the
Sovereign-X → Axiom-X constitutional bridge (intent → capability → policy →
manifest → execute → provenance). Assist-only; never print SoT.`);
    process.exit(0);
  }

  const intentId =
    args.intent || `intent.axiom.still.${Date.now()}`;

  const resolved = resolveCapability("gpu.compute.amd.legacy_efficient");
  const result = await route("gpu.compute.amd.legacy_efficient", {
    intentId,
    worldId: args.world,
    timelineId: args.timeline,
    determinismRequired: false,
    width: args.width,
    height: args.height,
    seed: args.seed,
    requestStill: true,
    stillOutDir: proofDir,
    hostGpu: {
      name: "AMD Radeon (TM) RX 580",
      vendor: "amd",
      legacyGcn: true,
      architecture: "tonga",
    },
  });

  const proof = {
    capturedAt: new Date().toISOString(),
    intentId,
    capabilityResolved: resolved,
    routeResult: result,
    axiomX: result.beauty?.axiomX || null,
    invoke: {
      cli: "node sovereign-x/cli/sx-axiom-still.mjs",
      capabilityId: "gpu.compute.amd.legacy_efficient",
      width: args.width,
      height: args.height,
      seed: args.seed,
    },
    honesty:
      "Axiom-X runs the legacy_still OpenCL kernel on the host GPU (RX 580 / Ellesmere) via pyopencl. Assist-only pixels — not PathTracer4D, not print SoT, not SDXL.",
  };

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(proof, null, 2), "utf8");

  const ax = result.beauty?.axiomX || {};
  const plate = result.plate || {};
  console.log(JSON.stringify({
    ok: result.ok,
    capabilityId: result.capabilityId,
    status: result.status,
    intentId,
    stillProvider: plate.stillProvider || ax.provider || null,
    stillPath: plate.stillPath || ax.outPath || null,
    evidenceStatus: ax.evidence?.status || null,
    provenanceHash: ax.evidence?.stages?.at?.(-1)?.provenance_hash || null,
    elapsedMs: ax.evidence?.stages?.find?.((s) => s.stage === "execution")?.details?.elapsed_ms ?? null,
    proofPath: args.out,
    message: result.message,
  }, null, 2));

  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
