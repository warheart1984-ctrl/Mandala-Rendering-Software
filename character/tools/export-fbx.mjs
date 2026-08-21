/**
 * FBX interchange.
 * STATUS: declared — GLB is the governed interchange. FBX needs Autodesk
 * SDK or Blender; this module records the contract without pretending.
 */
export const FBX_STATUS = "declared";

export function exportFbx(_asset, _stage) {
  return {
    status: FBX_STATUS,
    error: "FBX export is declared. Use exportCharacterGlb() (enforced) or Blender glTF→FBX.",
  };
}

export function importFbx(_path) {
  return {
    status: FBX_STATUS,
    error: "FBX import is declared. Convert to GLB first.",
  };
}
