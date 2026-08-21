/**
 * One character asset — the single source for wire / rig / beauty stages.
 */
import { buildQuadHumanoid, quadsToTriangles, computeNormals, computeUVs, extractEdges, energyCurves } from "./topology.mjs";
import { inspectTopology } from "./retopo.mjs";
import { buildArmature, requiredBoneGroups, inverseBindMatrices } from "./armature.mjs";
import { paintWeights } from "./weights.mjs";

/**
 * @param {object} opts
 * @param {string} [opts.id]
 * @param {"human"|"anthro"} [opts.species]
 */
export function buildCharacterAsset(opts = {}) {
  const id = opts.id || "char";
  const species = opts.species === "anthro" ? "anthro" : "human";
  const mesh = buildQuadHumanoid({ species });
  const topo = inspectTopology(mesh);
  const armature = buildArmature(species);
  const bones = requiredBoneGroups(armature);
  const triangles = quadsToTriangles(mesh.quads);
  const normals = computeNormals(mesh.positions, triangles);
  const uvs = computeUVs(mesh.positions);
  const edges = extractEdges(mesh.quads);
  const energy = energyCurves(mesh);
  const skin = paintWeights(mesh.positions, armature, mesh.regions);
  const ibm = inverseBindMatrices(armature);

  return {
    id,
    species,
    status: topo.ok && bones.spine && bones.shoulders && bones.hips && bones.tail && bones.fingers
      ? "enforced"
      : "partial",
    mesh,
    topo,
    armature,
    bones,
    triangles,
    normals,
    uvs,
    edges,
    energy,
    skin,
    ibm,
  };
}
