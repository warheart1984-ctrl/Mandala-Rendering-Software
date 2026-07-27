#!/usr/bin/env node
/**
 * validate-face-glb.mjs — validate a real HumanFaceRigged.glb via FaceRig loader.
 *
 * Status: **prepared** / enforced against fixture by operators + test:face.
 * Does NOT require a .meta.json sidecar. Does NOT fail on polygon count.
 *
 * Usage:
 *   node scripts/validate-face-glb.mjs <path/to/HumanFaceRigged.glb>
 *   npm run validate:face-glb -- ../../assets/human/HumanFaceRigged.glb
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");

async function loadApi() {
  const dist = join(PKG_ROOT, "dist", "src", "face", "index.js");
  if (!existsSync(dist)) {
    throw new Error(
      `Built module missing: ${dist}. Run: npm run build (in engine3d-core)`,
    );
  }
  return import(pathToFileURL(dist).href);
}

function meshStats(rig) {
  let vertices = 0;
  let triangles = 0;
  for (const mesh of rig.meshes.all) {
    vertices += mesh.vertices.length / 3;
    triangles += mesh.indices.length / 3;
  }
  return { vertices: Math.round(vertices), triangles: Math.round(triangles) };
}

async function main() {
  const glbPathArg = process.argv[2];
  if (!glbPathArg) {
    process.stderr.write(
      "Usage: node validate-face-glb.mjs <path/to/HumanFaceRigged.glb>\n",
    );
    process.exit(1);
  }

  const glbPath = resolve(glbPathArg);
  if (!existsSync(glbPath)) {
    process.stderr.write(`validate-face-glb: file not found: ${glbPath}\n`);
    process.exit(1);
  }

  const {
    defaultFaceRigConfig,
    loadFaceRig,
    validateFaceRig,
    DEFAULT_FACE_BONES,
    DEFAULT_FACE_BLENDSHAPES,
  } = await loadApi();

  const config = {
    ...defaultFaceRigConfig(glbPath),
    strict: false,
  };
  const loaded = loadFaceRig(config);
  const check = validateFaceRig(loaded.rig, {
    ...config,
    requiredBones: [...DEFAULT_FACE_BONES],
    blendshapes: [...DEFAULT_FACE_BLENDSHAPES],
  });
  const stats = meshStats(loaded.rig);

  process.stdout.write(
    JSON.stringify(
      {
        path: glbPath,
        assetKind: loaded.assetKind,
        armature_name: loaded.config.armatureName,
        vertices: stats.vertices,
        triangles: stats.triangles,
        note: "Polygon count is informational only; CI fixtures are low-tris.",
      },
      null,
      2,
    ) + "\n",
  );

  if (!check.ok) {
    process.stderr.write("Face GLB validation failed.\n");
    process.stderr.write(
      `Missing bones (${check.missingBones.length}): ${check.missingBones.join(", ") || "(none)"}\n`,
    );
    process.stderr.write(
      `Missing blendshapes (${check.missingBlendshapes.length}): ${check.missingBlendshapes.join(", ") || "(none)"}\n`,
    );
    process.exit(1);
  }

  process.stdout.write("Face GLB validation passed.\n");
}

main().catch((err) => {
  process.stderr.write(`validate-face-glb: ${err?.stack || err}\n`);
  process.exit(1);
});
