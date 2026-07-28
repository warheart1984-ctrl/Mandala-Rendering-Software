/**
 * Engine3DWorldDocument → soft-raster meshes with full material binding.
 */

import type { Engine3DWorldDocument, UniversalMaterial } from "../../world/WorldObject.js";
import { createUniversalMaterial } from "../../world/WorldObject.js";
import { transformToMat4 } from "../../world/StaticMeshSystem.js";
import {
  createDefaultMaterialCatalog,
  rasterMaterialFromUniversal,
  type RasterMaterial,
} from "./RasterMaterial.js";
import { buildPrimitiveRasterMesh } from "./primitiveMeshes.js";
import type { RasterMesh } from "./HeadlessStillRenderer.js";

function materialMap(materials: readonly UniversalMaterial[]): Map<string, UniversalMaterial> {
  const map = new Map<string, UniversalMaterial>();
  for (const m of materials) map.set(m.id, m);
  // Ensure every catalog type is resolvable by id alias `default_<type>`.
  for (const m of createDefaultMaterialCatalog()) {
    if (!map.has(m.id)) map.set(m.id, m);
    if (!map.has(m.type)) map.set(m.type, m);
  }
  return map;
}

function resolveMaterial(
  map: Map<string, UniversalMaterial>,
  materialId: string | undefined,
): RasterMaterial {
  const fallback = createUniversalMaterial({
    id: "fallback_basic",
    type: "basic",
    baseColor: [0.75, 0.75, 0.8],
  });
  const uni =
    (materialId ? map.get(materialId) : undefined) ??
    map.get("basic") ??
    fallback;
  return rasterMaterialFromUniversal(uni);
}

/**
 * Expand world document primitives into material-aware RasterMeshes.
 * Skips camera/light/group objects without geometry.
 */
export function worldDocumentToRasterMeshes(world: Engine3DWorldDocument): RasterMesh[] {
  const map = materialMap(world.materials ?? []);
  const meshes: RasterMesh[] = [];
  for (const obj of world.objects ?? []) {
    if (obj.kind === "camera" || obj.kind === "light") continue;
    const prim = obj.geometry?.primitiveType;
    if (!prim && obj.kind !== "primitive") continue;
    if (!obj.geometry) continue;
    const mat = resolveMaterial(map, obj.material?.materialId);
    const model = transformToMat4(obj.transform);
    meshes.push(
      buildPrimitiveRasterMesh(obj.id, obj.geometry.primitiveType, mat, model),
    );
  }
  return meshes;
}
