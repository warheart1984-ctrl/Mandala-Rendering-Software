/**
 * GLB importer (inspect only).
 * STATUS: partial — reads header + JSON chunk; does not rebuild CharacterAsset.
 */
import { readFileSync } from "node:fs";

export function inspectGlb(path) {
  const buf = readFileSync(path);
  if (buf.length < 20) throw new Error("GLB too small");
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error("Not a GLB");
  const version = buf.readUInt32LE(4);
  const jsonLen = buf.readUInt32LE(12);
  const jsonType = buf.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) throw new Error("Missing JSON chunk");
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  return {
    version,
    byteLength: buf.readUInt32LE(8),
    meshCount: json.meshes?.length ?? 0,
    nodeCount: json.nodes?.length ?? 0,
    hasSkin: Array.isArray(json.skins) && json.skins.length > 0,
    extras: json.asset?.extras || {},
  };
}
