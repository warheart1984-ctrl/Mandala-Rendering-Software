#!/usr/bin/env node
/**
 * Import / inspect a pipeline GLB (JSON chunk + extras).
 * Status: partial — reads glTF JSON; does not skin or upload to RT4D.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function inspectGlb(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546c67) throw new Error("Not a GLB (missing glTF magic)");
  const version = view.getUint32(4, true);
  const jsonLen = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  if (jsonType !== 0x4e4f534a) throw new Error("GLB JSON chunk missing");
  const jsonBytes = buf.subarray(20, 20 + jsonLen);
  const jsonText = Buffer.from(jsonBytes).toString("utf8").replace(/\0+$/g, "").trimEnd();
  const gltf = JSON.parse(jsonText);
  return {
    version,
    byteLength: buf.byteLength,
    scenes: (gltf.scenes || []).length,
    nodes: (gltf.nodes || []).map((n) => n.name),
    meshes: (gltf.meshes || []).map((m) => m.name),
    skins: (gltf.skins || []).map((s) => s.name),
    materials: (gltf.materials || []).map((m) => m.name),
    extras: gltf.extras || gltf.scenes?.[0]?.extras || null,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]).endsWith("import-character.mjs");
if (isMain) {
  const path = resolve(process.argv[2] || new URL("../models/exports/char_rigged.glb", import.meta.url).pathname);
  const buf = readFileSync(path);
  const info = inspectGlb(buf);
  console.log(JSON.stringify({ path, ...info }, null, 2));
}
