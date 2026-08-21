#!/usr/bin/env node
/**
 * prove-character-material.mjs — Phase 1 evidence still.
 *
 * Renders a 64×64 (default) soft sphere using CharacterMaterialRegistry
 * CPU BRDF stub keyed by material id. Does NOT claim GPU beauty or WGSL execution.
 *
 * Usage:
 *   node scripts/prove-character-material.mjs --material skin --width 64 --height 64
 */

import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import {
  serializeCharacterMaterial,
  evaluateCharacterBrdfCpu,
  CHARACTER_MATERIAL_ENUM,
} from "../src/render/rt4d/material/CharacterMaterialRegistry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_EVIDENCE = resolve(
  __dirname,
  "../../../../docs/mandala/evidence/phase1-character-material",
);

function parseArgs(argv) {
  const out = {
    material: "skin",
    width: 64,
    height: 64,
    output: null,
    provenance: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--material") out.material = argv[++i];
    else if (a === "--width") out.width = Number(argv[++i]);
    else if (a === "--height") out.height = Number(argv[++i]);
    else if (a === "--output") out.output = argv[++i];
    else if (a === "--provenance") out.provenance = argv[++i];
  }
  return out;
}

function encodePngRgba(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type, data) {
    const typeBuf = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c;
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function renderSphere(material, width, height) {
  const rgba = new Uint8Array(width * height * 4);
  const light = normalize([0.45, 0.75, 0.48]);
  const view = [0, 0, 1];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width * 2 - 1;
      const v = 1 - (y + 0.5) / height * 2;
      const r2 = u * u + v * v;
      const i = (y * width + x) * 4;
      if (r2 > 1) {
        rgba[i] = 18;
        rgba[i + 1] = 20;
        rgba[i + 2] = 28;
        rgba[i + 3] = 255;
        continue;
      }
      const z = Math.sqrt(1 - r2);
      const n = normalize([u, v, z]);
      const shaded = evaluateCharacterBrdfCpu(material, { n, l: light, v: view });
      rgba[i] = Math.round(shaded.rgb[0] * 255);
      rgba[i + 1] = Math.round(shaded.rgb[1] * 255);
      rgba[i + 2] = Math.round(shaded.rgb[2] * 255);
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

function main() {
  const args = parseArgs(process.argv);
  const w = Math.min(128, Math.max(16, args.width | 0));
  const h = Math.min(128, Math.max(16, args.height | 0));
  const material = args.material;

  const serialized = serializeCharacterMaterial(material);
  const rgba = renderSphere(material, w, h);
  const png = encodePngRgba(w, h, rgba);
  const pixelHash = createHash("sha256").update(rgba).digest("hex");

  mkdirSync(REPO_EVIDENCE, { recursive: true });
  const outPng =
    args.output || join(REPO_EVIDENCE, `character-${material}-${w}x${h}.png`);
  const outProv =
    args.provenance ||
    join(REPO_EVIDENCE, `character-${material}-${w}x${h}.provenance.json`);

  writeFileSync(outPng, png);

  const provenance = {
    status: "partial",
    claim:
      "CPU soft-sphere still using CharacterMaterialRegistry BRDF stub by material id. Not GPU beauty; not character/*.wgsl execution.",
    material_id: material,
    character_type: serialized.characterType,
    character_enum: CHARACTER_MATERIAL_ENUM,
    shader_hash: serialized.shaderHash,
    material_provenance: serialized.provenance,
    width: w,
    height: h,
    pixel_sha256: pixelHash,
    png_path: outPng,
    renderer: "prove-character-material.mjs / evaluateCharacterBrdfCpu",
    shade_path_note:
      "GPU SHADE_WGSL has parallel stand-in branches; WebGPU not required for this proof.",
  };

  writeFileSync(outProv, JSON.stringify(provenance, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, ...provenance }, null, 2));
}

main();
