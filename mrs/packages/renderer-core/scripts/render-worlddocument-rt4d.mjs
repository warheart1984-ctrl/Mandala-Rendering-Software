#!/usr/bin/env node
/**
 * render-worlddocument-rt4d.mjs — Engine3DWorldDocument → PathTracer4D still.
 *
 * Live consume of WorldDocumentRt4d descriptors (oriented capsules + hyperspheres).
 * Gate: --worlddocument-rt4d or WORLDDOCUMENT_RT4D=1
 *
 * Usage:
 *   WORLDDOCUMENT_RT4D=1 node scripts/render-worlddocument-rt4d.mjs \
 *     --world ./world.json --output /tmp/out.png --width 128 --height 96 --samples 4
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

import { renderWorldRt4dPrimitives } from "./lib/worldDocumentRt4dConsume.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");
const ENGINE3D_ROOT = join(PKG_ROOT, "..", "engine3d-core");

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

async function loadWorldDocumentToRt4d() {
  const dist = join(
    ENGINE3D_ROOT,
    "dist",
    "src",
    "scene",
    "WorldDocumentRt4d.js",
  );
  if (!existsSync(dist)) {
    throw new Error(
      `engine3d-core WorldDocumentRt4d missing: ${dist}. Run: npm run build in mrs/packages/engine3d-core`,
    );
  }
  return import(pathToFileURL(dist).href);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gated =
    args["worlddocument-rt4d"] === true ||
    process.env.WORLDDOCUMENT_RT4D === "1" ||
    process.env.WORLDDOCUMENT_RT4D === "true";
  if (!gated) {
    process.stderr.write(
      "render-worlddocument-rt4d: refused — pass --worlddocument-rt4d or set WORLDDOCUMENT_RT4D=1\n",
    );
    process.exit(2);
  }

  const worldPath = typeof args.world === "string" ? args.world : null;
  if (!worldPath || !existsSync(worldPath)) {
    process.stderr.write("render-worlddocument-rt4d: --world <Engine3DWorldDocument.json> required\n");
    process.exit(2);
  }

  const world = JSON.parse(readFileSync(worldPath, "utf8"));
  const { worldDocumentToRt4dPrimitives } = await loadWorldDocumentToRt4d();
  const prims = worldDocumentToRt4dPrimitives(world);

  const width = Math.max(16, Math.min(1024, parseInt(String(args.width || "128"), 10) || 128));
  const height = Math.max(16, Math.min(1024, parseInt(String(args.height || "96"), 10) || 96));
  const samples = Math.max(1, Math.min(64, parseInt(String(args.samples || "4"), 10) || 4));
  const maxDepth = Math.max(1, Math.min(12, parseInt(String(args["max-depth"] || "4"), 10) || 4));
  const seed = args.seed != null ? parseInt(String(args.seed), 10) >>> 0 : createHash("sha256").update(JSON.stringify(world.id ?? worldPath)).digest().readUInt32BE(0);

  const camera = world.camera
    ? {
        eye: world.camera.eye || world.camera.position || [0, 2.2, 7.5, 0],
        lookAt: world.camera.lookAt || world.camera.target || [0, 0.4, 0, 0],
        fovY: world.camera.fovY ?? 0.85,
      }
    : undefined;

  const result = renderWorldRt4dPrimitives(prims, {
    width,
    height,
    samples,
    maxDepth,
    seed,
    camera,
    textures: world.textures,
    worldId: world.id ?? worldPath,
  });

  const outPath =
    typeof args.output === "string"
      ? args.output
      : join(PKG_ROOT, "output", "worlddocument-rt4d", "beauty.png");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, result.png);

  const provenance = {
    ...result.provenance,
    beauty_path: outPath,
    beauty_sha256: result.sha256,
    run_id: typeof args["run-id"] === "string" ? args["run-id"] : createHash("sha256").update(result.sha256).digest("hex").slice(0, 32),
  };
  if (typeof args.provenance === "string") {
    writeFileSync(args.provenance, JSON.stringify(provenance, null, 2));
  }
  process.stdout.write(JSON.stringify(provenance) + "\n");
}

main().catch((err) => {
  process.stderr.write(`render-worlddocument-rt4d: ${err?.stack || err}\n`);
  process.exit(1);
});
