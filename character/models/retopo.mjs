/**
 * Retopo / topology hygiene checks for animation-ready quads.
 *
 * STATUS: enforced (validators). Interactive retopo tools: declared.
 */
import { isAllQuads } from "./topology.mjs";

export function inspectTopology(mesh) {
  const issues = [];
  if (!isAllQuads(mesh)) issues.push({ code: "non-quad", message: "Mesh contains non-quad faces" });
  if (mesh.vertexCount < 64) issues.push({ code: "too-sparse", message: "Vertex count below animation minimum" });
  if (mesh.faceCount < 64) issues.push({ code: "too-few-faces", message: "Face count below animation minimum" });

  const valence = new Array(mesh.vertexCount).fill(0);
  for (const q of mesh.quads) {
    for (const v of q) valence[v]++;
  }
  const poles = valence.filter((v) => v > 6).length;
  if (poles > mesh.vertexCount * 0.08) {
    issues.push({ code: "poles", message: `High-valence poles: ${poles}` });
  }

  const requiredLoops = ["hips", "waist", "chest", "shoulders", "neck"];
  for (const name of requiredLoops) {
    if (!mesh.loops?.[name]) issues.push({ code: "missing-loop", message: `Missing edge loop '${name}'` });
  }

  if (mesh.density === "amul" || mesh.density === "base") {
    const amulIds = [
      "AMUL::SHOULDER_L", "AMUL::SHOULDER_R", "AMUL::CHEST",
      "AMUL::LAT_L", "AMUL::LAT_R", "AMUL::HIP_L", "AMUL::HIP_R",
      "AMUL::KNEE_L", "AMUL::KNEE_R", "AMUL::TAIL_ROOT",
    ];
    for (const id of amulIds) {
      if (!mesh.amulLoops?.[id]) {
        issues.push({ code: "missing-amul-loop", message: `Missing AMUL loop '${id}'` });
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    quads: mesh.faceCount,
    verts: mesh.vertexCount,
    poles,
    density: mesh.density || "sparse",
  };
}
