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

  return {
    ok: issues.length === 0,
    issues,
    quads: mesh.faceCount,
    verts: mesh.vertexCount,
    poles,
  };
}
