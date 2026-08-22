#!/usr/bin/env node
/**
 * holort4d-tokenize — CLI for HoloRT4D-Spatial-V1
 *
 * Preferred: Float32 depth bin / JSON / synthetic ramp.
 * --pseudo-depth: partial luminance heuristic (not metric).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CORE = join(
  ROOT,
  "mrs/packages/renderer-core/src/render/rt4d/holort4d/spatial-tokens/index.js",
);

const {
  tokenizeFromDepthGrid,
  hashSpatialToken,
  faceRigFromLandmarkXYZ,
  grayscalePseudoDepth,
  SPATIAL_TOKEN_STATUS,
  buildHoloSchemeV1,
  formatForLLM,
  formatHoloSchemeForLLM,
} = await import(pathToFileURL(CORE).href);

function usage() {
  console.log(`Usage:
  node scripts/holort4d-tokenize.mjs --synthetic <size> [--resolution 16|8] [--out out.json]
  node scripts/holort4d-tokenize.mjs --json-in in.json [--out out.json]
  node scripts/holort4d-tokenize.mjs --depth-bin file.f32.bin --width W --height H [--resolution 16]
  node scripts/holort4d-tokenize.mjs --depth-png file.png   # requires sharp if available; else refuse
  node scripts/holort4d-tokenize.mjs --status

JSON-in shape: { width, height, resolution?, depth: number[], prev_depth?, face_landmarks_xyz?, brief_id? }
`);
}

function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--status") out.status = true;
    else if (a === "--synthetic") out.synthetic = argv[++i];
    else if (a === "--resolution") out.resolution = argv[++i];
    else if (a === "--width") out.width = argv[++i];
    else if (a === "--height") out.height = argv[++i];
    else if (a === "--depth-bin") out.depthBin = argv[++i];
    else if (a === "--depth-png") out.depthPng = argv[++i];
    else if (a === "--json-in") out.jsonIn = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--pseudo-depth") out.pseudoDepth = true;
    else if (a === "--chamber-frame") out.chamberFrame = argv[++i];
  }
  return out;
}

function syntheticDepth(size) {
  const d = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      d[y * size + x] = (x + y) / (2 * size);
    }
  }
  return d;
}

function emit(token, depth, width, height, optsExtra = {}, extra = {}) {
  const hash = hashSpatialToken(token);
  const holo_scheme = buildHoloSchemeV1({
    depthGrid: depth,
    width,
    height,
    faceRig: optsExtra.faceRig,
    includeSpatialV1: false,
  });
  const llm_summary = formatHoloSchemeForLLM(holo_scheme);
  const spatial_llm = formatForLLM(token, { hash });
  const payload = {
    scheme: token.scheme,
    hash,
    resolution: token.resolution,
    cell_count: token.cells.length,
    token,
    // ChatGPT primary: Holo-Scheme V1
    structuredContent: holo_scheme,
    holo_scheme,
    llm_summary,
    spatial_llm,
    status: SPATIAL_TOKEN_STATUS,
    ...extra,
  };
  return payload;
}

async function loadDepthPng(path) {
  // Prefer raw depth via bin/json. PNG path: try sharp, else fail clearly.
  try {
    const require = createRequire(import.meta.url);
    const sharp = require("sharp");
    const { data, info } = await sharp(path)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rgba = new Uint8Array(data);
    // Treat red channel as 8-bit depth (common depth PNG convention) — partial if color image
    const depth = new Float32Array(info.width * info.height);
    for (let i = 0; i < depth.length; i++) depth[i] = rgba[i * 4] / 255;
    return { depth, width: info.width, height: info.height };
  } catch (e) {
    throw new Error(
      `PNG depth load failed (${e.message}). Install sharp or use --depth-bin / --json-in / --synthetic.`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  if (args.status) {
    console.log(JSON.stringify(SPATIAL_TOKEN_STATUS, null, 2));
    return;
  }

  let depth;
  let width;
  let height;
  let resolution = Number(args.resolution ?? 16);
  /** @type {object} */
  let optsExtra = {};

  if (args.jsonIn) {
    const raw = JSON.parse(readFileSync(resolve(String(args.jsonIn)), "utf8"));
    width = Number(raw.width);
    height = Number(raw.height);
    resolution = Number(raw.resolution ?? resolution);
    depth = Float32Array.from(raw.depth);
    if (raw.prev_depth) optsExtra.prevDepth = Float32Array.from(raw.prev_depth);
    if (raw.face_landmarks_xyz) {
      optsExtra.faceRig = faceRigFromLandmarkXYZ(Float32Array.from(raw.face_landmarks_xyz));
    }
    if (raw.brief_id) optsExtra.meta = { brief_id: raw.brief_id };
  } else if (args.synthetic) {
    const size = Number(args.synthetic);
    depth = syntheticDepth(size);
    width = size;
    height = size;
  } else if (args.depthBin) {
    width = Number(args.width);
    height = Number(args.height);
    if (!width || !height) throw new Error("--width and --height required with --depth-bin");
    const buf = readFileSync(resolve(String(args.depthBin)));
    depth = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  } else if (args.depthPng) {
    const loaded = await loadDepthPng(resolve(String(args.depthPng)));
    depth = loaded.depth;
    width = loaded.width;
    height = loaded.height;
  } else if (args.chamberFrame) {
    // Chamber tape: expect sibling .cpf4d or landmark-z — try float32 bin named as given
    const p = resolve(String(args.chamberFrame));
    if (!existsSync(p)) throw new Error(`chamber frame not found: ${p}`);
    if (p.endsWith(".bin")) {
      width = Number(args.width ?? 16);
      height = Number(args.height ?? 16);
      const buf = readFileSync(p);
      depth = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
      if (depth.length < width * height) {
        // If landmark-z only, expand to a tiny grid from z values
        const zs = depth;
        width = 16;
        height = 16;
        depth = new Float32Array(width * height);
        for (let i = 0; i < depth.length; i++) depth[i] = zs[i % zs.length] ?? 0;
      }
    } else {
      throw new Error("chamber frame: pass a .bin depth/landmark file + optional --width/--height");
    }
  } else {
    usage();
    process.exit(1);
  }

  if (args.pseudoDepth && !(depth instanceof Float32Array)) {
    // no-op placeholder
  }

  const token = tokenizeFromDepthGrid(depth, {
    width,
    height,
    resolution: /** @type {8|16} */ (resolution),
    ...optsExtra,
  });
  const payload = emit(token, depth, width, height, optsExtra);

  const text = JSON.stringify(payload, null, 2);
  if (args.out) {
    writeFileSync(resolve(String(args.out)), text);
    console.error(`wrote ${args.out} hash=${payload.hash}`);
  } else {
    console.log(text);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
