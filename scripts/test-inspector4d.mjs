#!/usr/bin/env node
/**
 * MRSInspector4D smoke + wire-protocol round-trip (no Unity).
 * Drive-G-1: proves handleWireMessage / resultToWire shapes; not production scene binding.
 */
import { createRequire } from "node:module";
import {
  MRSInspector4D,
  buildInspectorEvidenceBundle,
  resultToWire,
} from "../4d-renderer/src/inspector/index.js";
import { createDefaultInspectorTestMesh } from "../4d-renderer/src/inspector/defaultTestMesh.js";
import { LiveLinkServer } from "../4d-renderer/src/live-link/LiveLinkServer.js";

// Resolve `ws` from 4d-renderer (root package does not declare it).
const require = createRequire(new URL("../4d-renderer/src/live-link/LiveLinkServer.js", import.meta.url));
const { WebSocket } = require("ws");

const mesh = createDefaultInspectorTestMesh();

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
  schemaVersion: "1.1",
  primitiveId: 0,
  localParams: [0.2, 0.2, 0, 0],
});
if (!wire.ok) {
  console.error("wire failed", wire);
  process.exit(1);
}
if (!Array.isArray(wire.position) || wire.position.length !== 4) {
  console.error("wire position must be number[4] per INSPECTOR_PROTOCOL.md", wire.position);
  process.exit(1);
}
if (!wire.tangentBasis?.t1 || !Array.isArray(wire.tangentBasis.t1)) {
  console.error("wire tangentBasis.t1 must be array", wire.tangentBasis);
  process.exit(1);
}
if (!wire.curvature?.curvatureStub) {
  console.error("expected curvatureStub on wire curvature", wire.curvature);
  process.exit(1);
}

const miss = resultToWire({ ok: false, error: "no_hit", schemaVersion: "1.1" });
if (miss.ok !== false || miss.error !== "no_hit" || miss.type !== "inspect_result") {
  console.error("miss wire shape", miss);
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

// Live WebSocket round-trip via LiveLinkServer + MRSInspector4D (same as npm run inspector:ws).
const port = 19490;
const server = new LiveLinkServer({ port, host: "127.0.0.1", inspector });
await server.start();

const wsResult = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("ws round-trip timeout")), 5000);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/mrs_inspector`);
  ws.on("open", () => {
    ws.send(
      JSON.stringify({
        type: "inspect_ray",
        schemaVersion: "1.1",
        origin: [0.1, 0.1, -1, 0],
        direction: [0, 0, 1, 0],
      }),
    );
  });
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "inspect_result") {
        clearTimeout(timer);
        ws.close();
        resolve(msg);
      }
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
  ws.on("error", (e) => {
    clearTimeout(timer);
    reject(e);
  });
});

server.stop();

if (!wsResult.ok || !Array.isArray(wsResult.position)) {
  console.error("ws round-trip failed", wsResult);
  process.exit(1);
}

console.log("ok inspector4d", {
  face: rayHit.provenance.faceIndex,
  neighbors: rayHit.topology.neighborCellIds.length,
  curvatureStub: rayHit.curvature.curvatureStub,
  wirePosition: wire.position,
  wsOk: wsResult.ok,
  hash: bundle.hash.slice(0, 24),
});
