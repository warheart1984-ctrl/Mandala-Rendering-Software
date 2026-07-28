#!/usr/bin/env node
/**
 * apply-bilateral-png.mjs — deterministic CPU bilateral denoise for any PNG plate.
 * Used by digital printer for non–scene-spec backends (proton / engine3d) when
 * PrintRequest.denoise=true.
 *
 * Usage:
 *   node apply-bilateral-png.mjs --input beauty.png --output beauty.png [--provenance out.json]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { bilateralFilter } from "../src/render/rt4d/denoiser/BilateralDenoiser.js";
import { encodePNG } from "./render-still.mjs";

// Minimal PNG decode (RGBA8) — filter 0 IDAT (matches encodePNG).
import { inflateSync } from "node:zlib";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function decodePngRgba(png) {
  if (png[0] !== 0x89 || png[1] !== 0x50) throw new Error("not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  const idats = [];
  while (offset + 8 <= png.length) {
    const len = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`unsupported PNG IHDR depth=${bitDepth} color=${colorType}`);
      }
      var hasAlpha = colorType === 6;
    } else if (type === "IDAT") {
      idats.push(data);
    } else if (type === "IEND") break;
    offset += 12 + len;
  }
  const inflated = inflateSync(Buffer.concat(idats));
  const bpp = hasAlpha ? 4 : 3;
  const stride = width * bpp;
  const rgba = Buffer.alloc(width * height * 4);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = inflated[src++];
    if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`);
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      rgba[di] = inflated[src++];
      rgba[di + 1] = inflated[src++];
      rgba[di + 2] = inflated[src++];
      rgba[di + 3] = hasAlpha ? inflated[src++] : 255;
    }
  }
  return { width, height, rgba };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.input || args.i;
  const output = args.output || args.o || input;
  if (!input) {
    console.error("usage: apply-bilateral-png.mjs --input <png> [--output <png>] [--provenance <json>]");
    process.exit(2);
  }
  const png = readFileSync(input);
  const { width, height, rgba } = decodePngRgba(png);
  const filtered = bilateralFilter(rgba, width, height, {
    radius: 2,
    sigmaSpatial: 3.0,
    sigmaColor: 25.0,
    iterations: 1,
  });
  const outPng = encodePNG(width, height, filtered.denoised);
  writeFileSync(output, outPng);
  const sha256 = createHash("sha256").update(outPng).digest("hex");
  const provenance = {
    script: "apply-bilateral-png",
    denoise: true,
    denoiseFilterHash: filtered.filterHash,
    width,
    height,
    sha256,
    input,
    output,
  };
  if (args.provenance) {
    writeFileSync(args.provenance, JSON.stringify(provenance, null, 2) + "\n");
  }
  process.stdout.write(JSON.stringify(provenance) + "\n");
}

main();
