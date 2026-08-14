/** Singularity Tree Demo — render a deterministic Yggdrasil continuum as an
 *  SVG wireframe projection of the 4D→3D manifold, illustrating the
 *  hierarchical generative geometry architecture.
 *
 *  Demonstrates: createRoot → generateWorldForObservation (adaptive refinement)
 *  → assembleContinuum → project4DTo3D → SVG wireframe.
 *
 *  Output: output/singularity-tree/continuum.svg
 */

import { createRoot, generateWorldForObservation, EXECUTION_MODES } from "../src/singularity-tree/index.js";
import { project4DTo3D } from "../src/singularity-tree/projection/Project4DTo3D.js";
import { createObservation } from "../src/singularity-tree/refinement/AdaptiveRefinementPolicy.js";
import { writeFile } from "fs/promises";
import { mkdir } from "fs/promises";

const main = async () => {
  // 1. Create the root (deterministic seed 0xc0ffee)
  const root = createRoot({ deterministicSeed: 0xc0ffee });
  console.log("Root created, seed:", root.seed);

  // 2. Define an observation (camera at (2.2,0,0,0) looking at origin)
  const obs = createObservation({
    cameraPosition: { x: 2.2, y: 0, z: 0, w: 0 },
    focusPoint: { x: 0, y: 0, z: 0, w: 0 },
    focusRadius: 0.55,
    nearLevel: 7,
    farLevel: 1,
    falloff: 1.6,
  });

  // 3. Generate the world graph adaptive to the observation
  const w = generateWorldForObservation({}, obs);
  const leaves = w.hierarchy.leaves();
  console.log(`Generated ${leaves.length} leaves at adaptive levels`);

  // 4. Assemble the continuum (S³ manifold + welded mesh)
  const config = w.config;
  const { assembleContinuum } = await import("../src/singularity-tree/continuum/ContinuumAssembler.js");
  const m = assembleContinuum(w.hierarchy, config);
  const mesh = m.mesh;

  // 5. Project the 4D mesh to 3D screen space
  const projected = project4DTo3D(mesh, {
    d4: config.projectionD4,
    width: 800,
    height: 600,
    scale: 220,
  });

  // 6. Build an SVG wireframe
  const vertexMap = new Map();
  const svgParts = [];

  // Project each vertex to 3D and add to SVG
  const project = (v) => {
    const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    if (!vertexMap.has(key)) {
      const p3 = projected(v);
      vertexMap.set(key, { x: p3.x, y: p3.y });
    }
    return vertexMap.get(key);
  };

  // Add SVG header
  svgParts.push('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">');

  // Draw edges as thin lines
  const seenEdges = new Set();
  for (const edge of mesh.edges) {
    const [a, b] = edge;
    const va = vertexMap.get(`${mesh.vertices[a].x.toFixed(4)},${mesh.vertices[a].y.toFixed(4)},${mesh.vertices[a].w.toFixed(4)}`);
    const vb = vertexMap.get(`${mesh.vertices[b].x.toFixed(4)},${mesh.vertices[b].y.toFixed(4)},${mesh.vertices[b].w.toFixed(4)}`);
    if (va && vb) {
      const key = `${a}<${b}>`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        const da = Math.hypot(va.x - vb.x, va.y - vb.y);
        svgParts.push(`<line x1="${va.x}" y1="${va.y}" x2="${vb.x}" y2="${vb.y}" stroke="rgba(200,200,250,0.6)" stroke-width="${Math.max(1, 2 - Math.floor(da*0.5))}" />`);
      }
    }
  }

  // Add SVG footer
  svgParts.push("</svg>");

  const svgContent = svgParts.join("\n");
  const outDir = "output/singularity-tree";
  await mkdir(outDir, { recursive: true });
  await writeFile(`${outDir}/continuum.svg`, svgContent);
  console.log(`SVG wireframe written to ${outDir}/continuum.svg`);
  console.log(`Vertices: ${mesh.vertices.length}, Edges: ${mesh.edges.length}`);
  console.log("Done — open the SVG in a browser to view the wireframe.");
};

main().catch(err => {
  console.error("Demo failed:", err);
  process.exit(1);
});