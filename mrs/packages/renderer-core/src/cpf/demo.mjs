#!/usr/bin/env node
/**
 * demo.mjs — end-to-end demonstration of the CPF Image component.
 *
 * Given an input PNG (default: a tiny still rendered by the repo's own
 * render-still.mjs tooling), this:
 *   1. encodes it to a CPO `mandala-link/1` packet (lossless indexed grid),
 *   2. decodes the CPO back to a PNG and asserts byte-exact round-trip,
 *   3. runs an inspectRegion query on the token pyramid,
 *   4. builds + validates a hash-linked SPO overlay,
 * writing artifacts (input PNG copy, CPO packet JSON, decoded PNG, inspect_region
 * JSON, SPO JSON) to --out (default: a temp dir).
 *
 * Usage:
 *   node demo.mjs --input in.png --out /some/dir
 *
 * This is a self-contained demonstration; it produces no committed output.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { encodeCPOFromPng, decodeCPO, decodeCPOToPng, validateCPO } from "./cpo.mjs";
import { inspectGrid, inspectRegion, buildPyramid } from "./pyramid.mjs";
import { makeSPO, validateSPO } from "./spo.mjs";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { out[key] = next; i++; } else out[key] = true;
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = typeof args.input === "string" ? args.input : null;
  const outDir = typeof args.out === "string" ? args.out : path.join(tmpdir(), "cpf-demo");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  if (!input) {
    process.stderr.write("cpf demo: --input <path.png> is required\n");
    process.exit(2);
  }

  const png = readFileSync(input);
  const cpo = encodeCPOFromPng(png, { params: { demo: true } });

  const validation = validateCPO(cpo);
  if (!validation.valid) {
    process.stderr.write(`cpf demo: CPO failed validation: ${validation.errors.join("; ")}\n`);
    process.exit(1);
  }

  const decodedPng = decodeCPOToPng(cpo);
  const roundTripExact = Buffer.compare(png, decodedPng) === 0;
  const { rgba } = decodeCPO(cpo);

  const coarse = inspectGrid(cpo, 8);
  const region = inspectRegion(cpo, 0.25, 0.25, 0.5, 0.5, 32);
  const pyramid = buildPyramid(cpo);

  const spo = makeSPO({
    cpo,
    regions: [
      { region: "r0", label: "example-region (declared, not model output)", confidence: 0.0, bbox: [0.25, 0.25, 0.5, 0.5] },
    ],
  });
  const spoValidation = validateSPO(spo, cpo);

  writeFileSync(path.join(outDir, "cpo_demo_source.png"), png);
  writeFileSync(path.join(outDir, "cpo_demo_packet.json"), JSON.stringify(cpo, null, 2));
  writeFileSync(path.join(outDir, "cpo_demo_decoded.png"), decodedPng);
  writeFileSync(path.join(outDir, "cpo_demo_inspect_region.json"), JSON.stringify(region, null, 2));
  writeFileSync(path.join(outDir, "cpo_demo_inspect_grid_l8.json"), JSON.stringify(coarse, null, 2));
  writeFileSync(path.join(outDir, "cpo_demo_spo.json"), JSON.stringify(spo, null, 2));

  const summary = {
    input,
    out_dir: outDir,
    width: cpo.payload.width,
    height: cpo.payload.height,
    palette_colors: cpo.payload.palette.length,
    grid_runs: cpo.payload.grid === "" ? 0 : cpo.payload.grid.split(",").length,
    payload_hash: cpo.payload_hash,
    palette_hash: cpo.payload.palette_hash,
    grid_hash: cpo.payload.grid_hash,
    source_hash: cpo.provenance.source_hash,
    cpo_valid: validation.valid,
    round_trip_byte_exact: roundTripExact,
    round_trip_rgba_bytes: rgba.length,
    pyramid_levels: Object.keys(pyramid.levels).map(Number),
    inspect_region_hash: region.region_hash,
    inspect_grid_l8_hash: coarse.level_hash,
    spo_source_hash: spo.source_hash,
    spo_valid: spoValidation.valid,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  if (!roundTripExact) process.exit(1);
}

main();
