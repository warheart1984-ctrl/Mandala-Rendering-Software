#!/usr/bin/env node
/**
 * GLB load smoke: encode fixture → three.js GLTFLoader.parse
 * Status: partial hull, not anatomical fox.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  encodeDemoFixtureGlb,
  glbMagicOk,
  GLB_MESH_NAME,
  POSE_BONE_IDS,
} from "../../shared/encode-glb.ts";
import { poseClipFromPlanes } from "../src/pose-animation.ts";
import { applyFoxWarriorSkin } from "../src/skin-layer-applier.ts";

const widgetRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const threeVersion = JSON.parse(
  readFileSync(join(widgetRoot, "node_modules/three/package.json"), "utf8")
).version;

const glb = encodeDemoFixtureGlb();
assert.ok(glbMagicOk(glb), "GLB magic/version");
assert.ok(glb.byteLength > 64, "GLB not empty");

const loader = new GLTFLoader();
const arrayBuffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);

const gltf = await new Promise((resolve, reject) => {
  loader.parse(arrayBuffer, "", resolve, reject);
});

assert.ok(gltf.scene, "gltf.scene");
const names = [];
gltf.scene.traverse((obj) => {
  if (obj.name) names.push(obj.name);
});
assert.ok(
  names.includes(GLB_MESH_NAME),
  `mesh ${GLB_MESH_NAME} present, got ${names.join(",")}`
);
for (const bone of ["root", "spine", "head", "tail"]) {
  assert.ok(names.includes(bone), `animation target ${bone} missing`);
}

const body = gltf.scene.getObjectByName(GLB_MESH_NAME);
assert.ok(body instanceof THREE.Mesh, "body is Mesh");

const clip = poseClipFromPlanes([
  { plane: "XW", speed: 0.5 },
  { plane: "YW", speed: 0.25 },
  { plane: "ZW", speed: 0.1 },
]);
assert.equal(clip.tracks.length, POSE_BONE_IDS.length * 3);
assert.ok(clip.tracks.some((t) => t.name.startsWith("spine.")));

const { applied, skippedRegions } = applyFoxWarriorSkin(gltf.scene);
assert.ok(applied >= 1, "fox-fur applied to body");
assert.ok(skippedRegions.includes("belly"));

console.log(
  JSON.stringify(
    {
      ok: true,
      statusTag: "partial",
      glbBytes: glb.byteLength,
      nodeNames: names,
      poseTracks: clip.tracks.length,
      skinApplied: applied,
      skippedRegions,
      three: threeVersion,
      note: "Fixture hull GLB loaded in three.js — not anatomical fox.",
    },
    null,
    2
  )
);
