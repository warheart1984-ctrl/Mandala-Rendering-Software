#!/usr/bin/env node
/**
 * judge-wow-hq.mjs — HQ judge plate (qualityPreset high + tonemap/supersample).
 *
 * STATUS: **enforced** — forwards wired HQ flags to render-proton-splat.mjs --star-demo.
 *
 * Trail: docs/governance/cecp/trails/proton-hq-2026-07/
 * No GPU. No path-trace claim.
 */

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPLAT = join(__dirname, "render-proton-splat.mjs");

const USAGE = `judge-wow-hq.mjs — STATUS: enforced

Usage:
  node scripts/judge-wow-hq.mjs --help
  node scripts/judge-wow-hq.mjs [--quality high|default] [--width N] [--height N]
       [--supersample N] [--tonemap none|reinhard|aces-lite]
       [--exposure N] [--lighting-punch] [--bloom] [--depth-cue]
       [--out-dir <dir>] [--seed N]

Forwards to render-proton-splat.mjs --star-demo with HQ quality flags.
Default out-dir: output/judge-wow-hq
--bloom / --depth-cue are refused (declared, not shipped).
`;

function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (
      a.startsWith("--") &&
      i + 1 < argv.length &&
      !argv[i + 1].startsWith("--")
    ) {
      out[a.slice(2)] = argv[++i];
    } else if (a.startsWith("--")) {
      out[a.slice(2)] = true;
    }
  }
  return out;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const quality =
    typeof args.quality === "string" ? String(args.quality) : "high";
  const width =
    args.width != null
      ? String(args.width)
      : quality === "high"
        ? "512"
        : "256";
  const height =
    args.height != null ? String(args.height) : width;
  const outDir =
    typeof args["out-dir"] === "string" || typeof args["output-dir"] === "string"
      ? resolve(String(args["out-dir"] ?? args["output-dir"]))
      : resolve(process.cwd(), "output/judge-wow-hq");
  const seed = args.seed != null ? String(args.seed) : "42";

  const childArgs = [
    SPLAT,
    "--star-demo",
    "--width",
    width,
    "--height",
    height,
    "--out-dir",
    outDir,
    "--aov",
    "depth,normal",
    "--seed",
    seed,
    "--quality",
    quality,
  ];

  if (args.supersample != null) {
    childArgs.push("--supersample", String(args.supersample));
  } else if (quality === "high") {
    childArgs.push("--supersample", "2");
  }

  if (args.tonemap != null) {
    childArgs.push("--tonemap", String(args.tonemap));
  } else if (quality === "high") {
    childArgs.push("--tonemap", "aces-lite");
  }

  if (args.exposure != null) {
    childArgs.push("--exposure", String(args.exposure));
  }

  if (args["lighting-punch"] || quality === "high") {
    childArgs.push("--lighting-punch");
  }
  if (args.bloom) childArgs.push("--bloom");
  if (args["depth-cue"]) childArgs.push("--depth-cue");

  const result = spawnSync(process.execPath, childArgs, {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

main();
