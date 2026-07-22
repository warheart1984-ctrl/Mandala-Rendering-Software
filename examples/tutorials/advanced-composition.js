/**
 * Tutorial: SurfaceComposition API (multi-surface combine).
 *
 * Evidence: SurfaceComposition.sampleAll merges sampled meshes for registered ops.
 * Does not claim full SDF boolean meshing for every surface.
 *
 *   node examples/tutorials/advanced-composition.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SurfaceComposition,
  OP_UNION,
  OP_BLEND,
} from "../../4d-renderer/src/surfaces/composition.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../../output/examples-export");
fs.mkdirSync(outDir, { recursive: true });

const composition = new SurfaceComposition({ blendRadius: 0.15, mergeWeld: true });
composition
  .addOperation(OP_UNION, "tesseract", {})
  .addOperation(OP_BLEND, "torus-3d", { resolution: 12 });

const mesh = composition.sampleAll(12);
const report = {
  status: "sampleAll-ok",
  operations: composition.operations.map((o) => ({
    op: o.op,
    surfaceId: o.surfaceId,
    enabled: o.enabled,
  })),
  meshSummary: {
    vertices: mesh.vertices.length,
    faces: mesh.faces.length,
    edges: mesh.edges.length,
  },
  note: "sampleAll merges meshes; OP_BLEND here is recorded on the op list — density blend path is separate (evaluateDensity).",
};

const out = path.join(outDir, "composition-report.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`Wrote ${out}`);
