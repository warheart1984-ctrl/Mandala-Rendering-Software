#!/usr/bin/env node
import { MRSInspector4D, buildInspectorEvidenceBundle } from "../4d-renderer/src/inspector/index.js";

const mesh = {
  vertices: [
    { x: 0, y: 0, z: 0, w: 0 },
    { x: 1, y: 0, z: 0, w: 0 },
    { x: 0, y: 1, z: 0, w: 0 },
    { x: 0, y: 0, z: 1, w: 0 },
  ],
  faces: [
    [0, 1, 2],
    [0, 1, 3],
  ],
};

const inspector = new MRSInspector4D({
  mesh,
  hyperplanes: [{ normal: { x: 0, y: 0, z: 1, w: 0 }, d: 0 }],
});

const rayHit = inspector.inspectAtRay(
  { x: 0.1, y: 0.1, z: -1, w: 0 },
  { x: 0, y: 0, z: 1, w: 0 },
);

if (!rayHit.ok) {
  console.error("expected hit", rayHit);
  process.exit(1);
}

const prim = inspector.inspectPrimitive(0, { x: 0.3, y: 0.3, z: 0, w: 0 });
if (!prim.ok) {
  console.error("expected primitive inspect", prim);
  process.exit(1);
}

const wire = inspector.handleWireMessage({
  type: "inspect_primitive",
  primitiveId: 0,
  localParams: [0.2, 0.2, 0, 0],
});
if (!wire.ok) {
  console.error("wire failed", wire);
  process.exit(1);
}

const bundle = buildInspectorEvidenceBundle(rayHit, {
  frameIndex: 1,
  rayInput: { origin: [0.1, 0.1, -1, 0], direction: [0, 0, 1, 0] },
});
if (!bundle.hash) {
  console.error("missing hash");
  process.exit(1);
}

if (!rayHit.curvature?.curvatureStub) {
  console.error("expected curvatureStub marker (MRS-IC 3.5)", rayHit.curvature);
  process.exit(1);
}

console.log("ok inspector4d", {
  face: rayHit.provenance.faceIndex,
  neighbors: rayHit.topology.neighborCellIds.length,
  curvatureStub: rayHit.curvature.curvatureStub,
  hash: bundle.hash.slice(0, 24),
});
