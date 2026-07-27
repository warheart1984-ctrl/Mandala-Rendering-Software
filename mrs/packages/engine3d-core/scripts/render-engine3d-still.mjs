#!/usr/bin/env node
/**
 * render-engine3d-still.mjs — Engine3D structure still (beauty + AOVs).
 *
 * Status: **prepared**. Soft-raster CPU path; not WebGPU.
 * Does NOT route faces through RT4D sphere-bridge.
 *
 * Usage:
 *   ENGINE3D_STILL=1 node scripts/render-engine3d-still.mjs \
 *     --out-dir /tmp/e3d --width 256 --height 256 --aov depth,normal
 *
 * Gate: --engine3d-still or ENGINE3D_STILL=1
 * On success: one JSON provenance line on stdout.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
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

async function loadApi() {
  const dist = join(PKG_ROOT, "dist", "src", "scene", "renderEngine3dStill.js");
  if (!existsSync(dist)) {
    throw new Error(
      `Built module missing: ${dist}. Run: npm run build (in engine3d-core)`,
    );
  }
  return import(pathToFileURL(dist).href);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gated =
    args["engine3d-still"] === true ||
    process.env.ENGINE3D_STILL === "1" ||
    process.env.ENGINE3D_STILL === "true";
  if (!gated) {
    process.stderr.write(
      "render-engine3d-still: refused — pass --engine3d-still or set ENGINE3D_STILL=1\n",
    );
    process.exit(2);
  }

  const outDir = typeof args["out-dir"] === "string" ? args["out-dir"] : join(PKG_ROOT, "output", "engine3d-still");
  mkdirSync(outDir, { recursive: true });

  const width = Math.max(16, Math.min(2048, parseInt(String(args.width || "256"), 10) || 256));
  const height = Math.max(16, Math.min(2048, parseInt(String(args.height || "256"), 10) || 256));
  const aovRaw = typeof args.aov === "string" ? args.aov : "depth,normal";
  const aovParts = aovRaw.split(",").map((s) => s.trim().toLowerCase());
  const aov = {
    depth: aovParts.includes("depth"),
    normal: aovParts.includes("normal"),
  };

  let worldDoc = null;
  if (typeof args.world === "string" && existsSync(args.world)) {
    worldDoc = JSON.parse(readFileSync(args.world, "utf8"));
  }

  const { renderEngine3dStill } = await loadApi();

  const cameraPartial = worldDoc?.camera
    ? {
        id: worldDoc.camera.id || "world-cam",
        eye: worldDoc.camera.eye || worldDoc.camera.position,
        lookAt: worldDoc.camera.lookAt || worldDoc.camera.target,
        up: worldDoc.camera.up || [0, 1, 0],
        fovY: worldDoc.camera.fovY ?? 0.9,
        near: worldDoc.camera.near ?? 0.1,
        far: worldDoc.camera.far ?? 40,
      }
    : undefined;

  const result = renderEngine3dStill({
    outDir,
    width,
    height,
    worldId: worldDoc?.id || (typeof args.world === "string" ? args.world : "demo-portrait"),
    cameraId: cameraPartial?.id,
    camera: cameraPartial,
    humanGlb: typeof args["human-glb"] === "string" ? args["human-glb"] : undefined,
    poseId: typeof args["pose-id"] === "string" ? args["pose-id"] : undefined,
    aov,
  });

  const recordPath = join(dirname(result.beautyPath), "structure-record.json");
  writeFileSync(recordPath, JSON.stringify(result.structureRecord, null, 2));

  const provenance = {
    kind: "engine3d-structure-still",
    status: "ok",
    ...result.structureRecord,
    structure_record_path: recordPath,
  };
  process.stdout.write(JSON.stringify(provenance) + "\n");
}

main().catch((err) => {
  process.stderr.write(`render-engine3d-still: ${err?.stack || err}\n`);
  process.exit(1);
});
