/**
 * FBX export stub.
 * Status: skeleton — no FBX encoder in-repo; Blender not on PATH to convert GLB→FBX.
 */
import { writeFileSync } from "node:fs";

export function exportFbxStub(outPath, character) {
  const doc = {
    status: "skeleton",
    format: "fbx",
    note: "FBX encoder is not available in this repo and Blender CLI is not on PATH. Use char_rigged.glb (glTF 2.0) as the interchange format. This sidecar records the intended FBX contract.",
    intendedOutputs: ["char_wire.fbx", "char_rigged.fbx", "char_final.fbx"],
    useInstead: "character/models/exports/char_rigged.glb",
    assetId: character?.sourceId || "default-humanoid",
    bones: character?.boneOrder || [],
  };
  writeFileSync(outPath, JSON.stringify(doc, null, 2));
  return { status: "skeleton", path: outPath };
}
