#!/usr/bin/env node
/**
 * MRSInspector4D smoke + wire-protocol round-trip (no Unity).
 * Drive-G-1: proves handleWireMessage / resultToWire / scene_push bind; not production scene sync.
 */
import { createRequire } from "node:module";
import {
  MRSInspector4D,
  buildInspectorEvidenceBundle,
  resultToWire,
  createDefaultSceneBinding,
  DEFAULT_SCENE_ID,
} from "../mrs/packages/renderer-core/src/inspector/index.js";
import { createDefaultInspectorTestMesh } from "../mrs/packages/renderer-core/src/inspector/defaultTestMesh.js";
import { LiveLinkServer } from "../mrs/packages/renderer-core/src/live-link/LiveLinkServer.js";

const require = createRequire(new URL("../mrs/packages/renderer-core/src/live-link/LiveLinkServer.js", import.meta.url));
const { WebSocket } = require("ws");

const mesh = createDefaultInspectorTestMesh();

const inspector = new MRSInspector4D({
  mesh,
  hyperplanes: [{ normal: { x: 0, y: 0, z: 1, w: 0 }, d: 0 }],
  sceneStatus: {
    id: DEFAULT_SCENE_ID,
    source: "default",
    label: `scene: ${DEFAULT_SCENE_ID}`,
    meshAssetId: null,
    vertexCount: mesh.vertices.length,
    faceCount: mesh.faces.length,
    boundAt: null,
  },
});

if (!inspector.getSceneLabel().includes(DEFAULT_SCENE_ID)) {
  console.error("expected default scene label", inspector.getSceneLabel());
  process.exit(1);
}

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

const pushUnitSquare = inspector.handleWireMessage({
  type: "scene_push",
  schemaVersion: "1.1",
  sceneId: "unity_bound",
  camera: { d4: 4, d3: 4, scale: 2 },
  mesh: {
    vertices: [
      [0, 0, 0, 0],
      [2, 0, 0, 0],
      [0, 2, 0, 0],
    ],
    faces: [[0, 1, 2]],
  },
});
if (!pushUnitSquare.ok || pushUnitSquare.type !== "scene_bound") {
  console.error("scene_push failed", pushUnitSquare);
  process.exit(1);
}
if (pushUnitSquare.sceneId !== "unity_bound" || pushUnitSquare.faceCount !== 1) {
  console.error("unexpected scene_bound", pushUnitSquare);
  process.exit(1);
}
if (!inspector.getSceneLabel().includes("unity_bound")) {
  console.error("expected unity_bound label", inspector.getSceneLabel());
  process.exit(1);
}

const pushedHit = inspector.handleWireMessage({
  type: "inspect_ray",
  schemaVersion: "1.1",
  origin: [0.4, 0.4, -1, 0],
  direction: [0, 0, 1, 0],
});
if (!pushedHit.ok || pushedHit.provenance?.faceIndex !== 0) {
  console.error("expected hit on pushed triangle face 0", pushedHit);
  process.exit(1);
}

const assetBind = inspector.handleWireMessage({
  type: "scene_bind",
  schemaVersion: "1.1",
  sceneId: "asset:tesseract",
  meshAssetId: "tesseract",
  camera: { d4: 4, d3: 4, scale: 2 },
});
if (!assetBind.ok || assetBind.source !== "mesh_asset") {
  console.error("meshAssetId bind failed", assetBind);
  process.exit(1);
}
const tessHit = inspector.inspectAtRay(
  { x: 0, y: 0, z: -3, w: 0 },
  { x: 0, y: 0, z: 1, w: 0 },
);
if (!tessHit.ok) {
  console.error("expected tesseract ray hit after asset bind", tessHit);
  process.exit(1);
}

const statusMsg = inspector.handleWireMessage({ type: "scene_status", schemaVersion: "1.1" });
if (statusMsg.type !== "scene_status" || !statusMsg.ok) {
  console.error("scene_status failed", statusMsg);
  process.exit(1);
}

const port = 19490;
const wsInspector = new MRSInspector4D(createDefaultSceneBinding());
const server = new LiveLinkServer({ port, host: "127.0.0.1", inspector: wsInspector });
await server.start();

const wsResult = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("ws round-trip timeout")), 5000);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/mrs_inspector`);
  let phase = "push";
  ws.on("open", () => {
    ws.send(
      JSON.stringify({
        type: "scene_push",
        schemaVersion: "1.1",
        sceneId: "unity_bound",
        mesh: {
          vertices: [
            [0, 0, 0, 0],
            [1, 0, 0, 0],
            [0, 1, 0, 0],
          ],
          faces: [[0, 1, 2]],
        },
        camera: { d4: 4, d3: 4, scale: 80 },
      }),
    );
  });
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (phase === "push") {
        if (msg.type !== "scene_bound" || !msg.ok) {
          clearTimeout(timer);
          reject(new Error(`expected scene_bound ok, got ${JSON.stringify(msg)}`));
          return;
        }
        phase = "inspect";
        ws.send(
          JSON.stringify({
            type: "inspect_ray",
            schemaVersion: "1.1",
            origin: [0.2, 0.2, -1, 0],
            direction: [0, 0, 1, 0],
          }),
        );
        return;
      }
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
  console.error("ws scene_push+inspect round-trip failed", wsResult);
  process.exit(1);
}
if (wsResult.provenance?.faceIndex !== 0) {
  console.error("ws hit expected face 0", wsResult.provenance);
  process.exit(1);
}

console.log("ok inspector4d", {
  face: rayHit.provenance.faceIndex,
  neighbors: rayHit.topology.neighborCellIds.length,
  curvatureStub: rayHit.curvature.curvatureStub,
  wirePosition: wire.position,
  scenePush: pushUnitSquare.sceneId,
  assetBind: assetBind.meshAssetId,
  wsOk: wsResult.ok,
  hash: bundle.hash.slice(0, 24),
});
