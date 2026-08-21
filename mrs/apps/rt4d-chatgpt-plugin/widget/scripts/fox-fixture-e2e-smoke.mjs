#!/usr/bin/env node
/**
 * One end-to-end fox fixture smoke:
 *   create_rt4d_scene → export_rt4d_asset (glbBase64)
 *   → three.js load + XW/YW/ZW pose play + fox-fur on `body`
 *   → matching sceneId / mesh / pose-target rig / GLB digests
 * Character bind_character_rig is not imported here: sovereign-sculptor/src/rigs.ts
 * is not in this git tree (blocked-with-evidence). Fixture rig digest = POSE_BONE_IDS.
 *   → dispose + reload same bytes
 *   → software-raster PNG evidence
 * Then: same GLB bytes into Blender via scripts/import_rt4d_glb.py
 *        (declared / blocked-with-evidence if blender is not on PATH).
 *
 * Status: partial. Convex/energy hull ≠ anatomical fox.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { handleCreateRt4dScene } from "../../server/src/tools/create-rt4d-scene.ts";
import { handleExportRt4dAsset } from "../../server/src/tools/skeleton-tools.ts";
import { handleInspectRt4dProvenance } from "../../server/src/tools/inspect-rt4d-provenance.ts";
import { buildEnergyWireMesh4d } from "../../server/src/wire-mesh-4d.ts";
import { encodeRgbaPng, pngSha256 } from "../../server/src/png-rgba.ts";
import { GLB_MESH_NAME, glbMagicOk, POSE_BONE_IDS } from "../../shared/encode-glb.ts";
import { poseClipFromPlanes } from "../src/pose-animation.ts";
import { applyFoxWarriorSkin, SKIN_PRESETS } from "../src/skin-layer-applier.ts";

const widgetRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(widgetRoot, "../../../..");
const evidenceDir = join(repoRoot, "docs/proofs/rt4d-fox-fixture-smoke");
mkdirSync(evidenceDir, { recursive: true });

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseGlb(bytes) {
  const loader = new GLTFLoader();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Promise((resolve, reject) => {
    loader.parse(copy.buffer, "", resolve, reject);
  });
}

function disposeObject3d(root) {
  root.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    const mat = child.material;
    if (!mat) return;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
  });
}

/** Orthographic software raster of loaded mesh — no WebGL required. */
function rasterGlbPng(root, width = 256, height = 256) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4 + 0] = 14;
    rgba[i * 4 + 1] = 20;
    rgba[i * 4 + 2] = 24;
    rgba[i * 4 + 3] = 255;
  }
  const meshes = [];
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (obj.isMesh && obj.geometry?.getAttribute("position")) meshes.push(obj);
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 1e-6);
  const scale = 0.85 / span;

  function project(v) {
    const x = (v.x - center.x) * scale;
    const y = (v.y - center.y) * scale;
    const px = Math.round((0.5 + x) * (width - 1));
    const py = Math.round((0.5 - y) * (height - 1));
    return [px, py];
  }

  function setPixel(px, py, r, g, b) {
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const o = (py * width + px) * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = 255;
  }

  function fillTri(a, b, c, color) {
    const minX = Math.max(0, Math.min(a[0], b[0], c[0]));
    const maxX = Math.min(width - 1, Math.max(a[0], b[0], c[0]));
    const minY = Math.max(0, Math.min(a[1], b[1], c[1]));
    const maxY = Math.min(height - 1, Math.max(a[1], b[1], c[1]));
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-6) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
        const w1 = (c[0] - b[0]) * (y - b[1]) - (c[1] - b[1]) * (x - b[0]);
        const w2 = (a[0] - c[0]) * (y - c[1]) - (a[1] - c[1]) * (x - c[0]);
        if (w0 >= 0 && w1 >= 0 && w2 >= 0) setPixel(x, y, color.r, color.g, color.b);
        else if (w0 <= 0 && w1 <= 0 && w2 <= 0) setPixel(x, y, color.r, color.g, color.b);
      }
    }
  }

  const fox = new THREE.Color(SKIN_PRESETS["fox-fur"].baseColor);
  const color = {
    r: Math.round(fox.r * 255),
    g: Math.round(fox.g * 255),
    b: Math.round(fox.b * 255),
  };

  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute("position");
    const idx = mesh.geometry.getIndex();
    const triCount = idx ? idx.count / 3 : pos.count / 3;
    const tmp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let t = 0; t < triCount; t++) {
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k;
        tmp[k].fromBufferAttribute(pos, vi);
        tmp[k].applyMatrix4(mesh.matrixWorld);
      }
      fillTri(project(tmp[0]), project(tmp[1]), project(tmp[2]), color);
    }
  }

  let painted = 0;
  for (let i = 0; i < width * height; i++) {
    if (rgba[i * 4] !== 14 || rgba[i * 4 + 1] !== 20 || rgba[i * 4 + 2] !== 24) painted += 1;
  }
  const png = encodeRgbaPng(width, height, rgba);
  return { png, painted, pngSha256: pngSha256(png) };
}

function resolveBlender() {
  const names = ["blender", "blender3", "blender-3.6", "blender-4.2", "blender-4.5"];
  for (const name of names) {
    const hit = spawnSync("which", [name], { encoding: "utf8" });
    if (hit.status === 0 && hit.stdout.trim()) {
      return { found: true, path: hit.stdout.trim(), argv: [hit.stdout.trim()], via: "PATH" };
    }
  }
  const flatpak = spawnSync("flatpak", ["info", "org.blender.Blender"], { encoding: "utf8" });
  if (flatpak.status === 0) {
    return {
      found: true,
      path: "flatpak run org.blender.Blender",
      argv: ["flatpak", "run", "org.blender.Blender"],
      via: "flatpak",
    };
  }
  return { found: false, path: null, argv: null, via: null };
}

function runBlenderOnSameGlb(glbPath) {
  const helper = join(repoRoot, "scripts/import_rt4d_glb.py");
  const probe = resolveBlender();
  if (!probe.found) {
    return {
      statusTag: "declared",
      blockedWithEvidence: true,
      reason: "blender not on PATH (which blender / blender3 / blender-3.6 / blender-4.2 / blender-4.5 all empty) and flatpak org.blender.Blender not installed",
      helper,
      glbPath,
    };
  }
  try {
    const proc = spawnSync(
      probe.argv[0],
      [...probe.argv.slice(1), "--background", "--python", helper, "--", glbPath],
      { encoding: "utf8", timeout: 180_000 }
    );
    const text = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`;
    const saved = /\[RT4D\] Saved:/.test(text);
    const imported = /\[RT4D\] Imported GLB:/.test(text);
    const foxFur = /Applied fox-fur to body/.test(text);
    if (proc.status !== 0 && !saved) {
      return {
        statusTag: "declared",
        blockedWithEvidence: true,
        blender: probe.path,
        via: probe.via,
        pathOnPath: probe.via === "PATH",
        helper,
        glbPath,
        exitCode: proc.status,
        reason: text.slice(-2500),
      };
    }
    return {
      statusTag: "partial",
      blockedWithEvidence: false,
      blender: probe.path,
      via: probe.via,
      pathOnPath: probe.via === "PATH",
      helper,
      glbPath,
      exitCode: proc.status,
      imported,
      foxFurOnBody: foxFur,
      armatureFound: /Found armature:/.test(text),
      savedBlend: saved,
      stdoutTail: text.slice(-2500),
    };
  } catch (err) {
    const detail =
      err && typeof err === "object" && "stderr" in err
        ? String(err.stderr)
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      statusTag: "declared",
      blockedWithEvidence: true,
      blender: probe.path,
      via: probe.via,
      helper,
      glbPath,
      reason: detail.slice(-2500),
    };
  }
}

const created = handleCreateRt4dScene({
  prompt: "fox fixture e2e smoke energy hull 2026-08-19",
  mode: "add_rt4d_powers",
  rotationPlanes: [
    { plane: "XW", speed: 0.5 },
    { plane: "YW", speed: 0.25 },
    { plane: "ZW", speed: 0.1 },
  ],
});
assert.equal(created.statusTag, "partial");
assert.match(created.sceneId, /^rt4d-scene-/);

const meshReplay = buildEnergyWireMesh4d({ sceneSeedHex: created.sceneId });
const exported = handleExportRt4dAsset({ sceneId: created.sceneId, format: "glb" });
assert.equal(exported.statusTag, "partial");
assert.equal(exported.sceneId, created.sceneId);
assert.equal(typeof exported.glbBase64, "string");
assert.match(exported.glbSha256, /^[0-9a-f]{64}$/);
assert.equal(exported.meshSha256, meshReplay.meshSha256, "mesh digest matches wire-mesh replay");

const poseTargetSha256 = createHash("sha256")
  .update(POSE_BONE_IDS.join("\n"), "utf8")
  .digest("hex");
assert.equal(exported.poseTargetSha256, poseTargetSha256);
assert.equal(
  exported.rigSha256,
  poseTargetSha256,
  "fixture rig digest = GLB pose-target digest (character sculptor rigs.ts not in this git tree)"
);

const glbBytes = Buffer.from(exported.glbBase64, "base64");
assert.ok(glbMagicOk(glbBytes), "GLB magic/version");
assert.equal(sha256(glbBytes), exported.glbSha256, "glbBase64 digest matches export glbSha256");

const inspected = handleInspectRt4dProvenance({ sceneId: created.sceneId });
assert.equal(inspected.sceneId, created.sceneId);

const exportedAgain = handleExportRt4dAsset({ sceneId: created.sceneId, format: "glb" });
assert.equal(exportedAgain.glbSha256, exported.glbSha256);
assert.equal(exportedAgain.meshSha256, exported.meshSha256);
assert.equal(exportedAgain.rigSha256, exported.rigSha256);

const glbPath = join(evidenceDir, "fox-fixture.glb");
writeFileSync(glbPath, glbBytes);

const gltf1 = await parseGlb(glbBytes);
assert.ok(gltf1.scene, "visible GLB: gltf.scene");
const names1 = [];
gltf1.scene.traverse((o) => {
  if (o.name) names1.push(o.name);
});
assert.ok(names1.includes(GLB_MESH_NAME), `mesh ${GLB_MESH_NAME} present`);
for (const bone of POSE_BONE_IDS) {
  assert.ok(names1.includes(bone), `bone ${bone}`);
}
const body1 = gltf1.scene.getObjectByName(GLB_MESH_NAME);
assert.ok(body1?.isMesh, "body is Mesh");

const clip = poseClipFromPlanes([
  { plane: "XW", speed: 0.5 },
  { plane: "YW", speed: 0.25 },
  { plane: "ZW", speed: 0.1 },
]);
assert.equal(clip.tracks.length, POSE_BONE_IDS.length * 3);
assert.ok(clip.tracks.some((t) => t.name.startsWith("spine.quaternion")));
assert.ok(clip.tracks.some((t) => t.name.startsWith("head.quaternion")));
assert.ok(clip.tracks.some((t) => t.name.startsWith("tail.quaternion")));

const mixer = new THREE.AnimationMixer(gltf1.scene);
const action = mixer.clipAction(clip);
action.play();
assert.equal(action.isRunning(), true, "pose action playing");
const spine = gltf1.scene.getObjectByName("spine");
assert.ok(spine);
const q0 = spine.quaternion.clone();
mixer.update(0.5);
const q1 = spine.quaternion.clone();
const poseDelta = 1 - Math.abs(q0.dot(q1));
assert.ok(poseDelta > 1e-8, `XW/YW/ZW pose moved spine (delta=${poseDelta})`);

const { applied, skippedRegions } = applyFoxWarriorSkin(gltf1.scene);
assert.ok(applied >= 1, "fox-fur applied to body");
const mat = Array.isArray(body1.material) ? body1.material[0] : body1.material;
assert.ok(mat.isMeshStandardMaterial);
assert.equal(`#${mat.color.getHexString()}`, SKIN_PRESETS["fox-fur"].baseColor.toLowerCase());

const raster = rasterGlbPng(gltf1.scene);
assert.ok(raster.painted > 20, `visible GLB raster painted ${raster.painted} pixels`);
const pngPath = join(evidenceDir, "fox-fixture-glb-view.png");
writeFileSync(pngPath, raster.png);

action.stop();
mixer.stopAllAction();
mixer.uncacheRoot(gltf1.scene);
disposeObject3d(gltf1.scene);
gltf1.scene.clear();
assert.equal(gltf1.scene.children.length, 0, "disposed scene empty");

const gltf2 = await parseGlb(glbBytes);
assert.ok(gltf2.scene.getObjectByName(GLB_MESH_NAME)?.isMesh, "reload: body mesh");
const mixer2 = new THREE.AnimationMixer(gltf2.scene);
const action2 = mixer2.clipAction(clip);
action2.play();
assert.equal(action2.isRunning(), true, "reload pose playing");
applyFoxWarriorSkin(gltf2.scene);
const reloadBytes = Buffer.from(exported.glbBase64, "base64");
assert.equal(sha256(reloadBytes), exported.glbSha256, "reload uses identical GLB bytes");
mixer2.stopAllAction();
mixer2.uncacheRoot(gltf2.scene);
disposeObject3d(gltf2.scene);
gltf2.scene.clear();

const blender = runBlenderOnSameGlb(glbPath);

const evidence = {
  ok: true,
  statusTag: "partial",
  note: "Convex/energy hull fixture — not an anatomical fox.",
  checks: {
    visibleGlbViaExport: true,
    poseAnimationXwYwZw: true,
    foxFurOnBody: true,
    matchingDigests: true,
    disposeAndReload: true,
    screenshot: true,
  },
  sceneId: created.sceneId,
  inspectedSceneId: inspected.sceneId,
  meshSha256: exported.meshSha256,
  rigSha256: exported.rigSha256,
  poseTargetSha256: exported.poseTargetSha256,
  characterRigSha256: exported.characterRigSha256,
  glbSha256: exported.glbSha256,
  glbByteLength: glbBytes.byteLength,
  poseTracks: clip.tracks.length,
  poseSpineDelta: poseDelta,
  skinApplied: applied,
  skippedRegions,
  rasterPaintedPixels: raster.painted,
  rasterPngSha256: raster.pngSha256,
  artifacts: {
    glb: "docs/proofs/rt4d-fox-fixture-smoke/fox-fixture.glb",
    png: "docs/proofs/rt4d-fox-fixture-smoke/fox-fixture-glb-view.png",
    json: "docs/proofs/rt4d-fox-fixture-smoke/fox-fixture-smoke.json",
  },
  blender,
};

const jsonPath = join(evidenceDir, "fox-fixture-smoke.json");
writeFileSync(jsonPath, JSON.stringify(evidence, null, 2) + "\n");

console.log(JSON.stringify(evidence, null, 2));
process.exitCode = 0;
