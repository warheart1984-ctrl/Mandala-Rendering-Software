#!/usr/bin/env node
/**
 * Minimal MRS Inspector WebSocket server.
 *
 * Speaks INSPECTOR_PROTOCOL.md (inspect_* + scene_push/scene_bind → scene_bound).
 * Reuses LiveLinkServer + UnityClientProtocol so inspect shares the live-link transport pattern.
 *
 * Status (Drive-G-1): prepares a local wire endpoint for Unity Editor / smoke tests.
 * Starts on default_test_mesh; Unity may push the live inspectable scene via scene_push.
 * Does not claim production multi-user scene sync.
 *
 * Usage:
 *   npm run inspector:ws
 *   node scripts/inspector-ws-server.mjs [--port 9490] [--host 127.0.0.1]
 *
 * Unity default: ws://127.0.0.1:9490  (path /mrs_inspector is documentary; ws ignores path)
 */

import { LiveLinkServer } from "../4d-renderer/src/live-link/LiveLinkServer.js";
import {
  MRSInspector4D,
  createDefaultSceneBinding,
  defaultMeshesRoot,
} from "../4d-renderer/src/inspector/index.js";

function parseArgs(argv) {
  const out = { port: 9490, host: "127.0.0.1" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port" && argv[i + 1]) out.port = Number(argv[++i]);
    else if (argv[i] === "--host" && argv[i + 1]) out.host = argv[++i];
  }
  return out;
}

const { port, host } = parseArgs(process.argv.slice(2));
const meshesRoot = defaultMeshesRoot();
const defaults = createDefaultSceneBinding();

const inspector = new MRSInspector4D({
  mesh: defaults.mesh,
  camera: defaults.camera,
  hyperplanes: defaults.hyperplanes,
  rotationPlanes: defaults.rotationPlanes,
  sceneStatus: defaults.status,
  meshesRoot,
});

const handle = inspector.handleWireMessage.bind(inspector);
inspector.handleWireMessage = (msg) => {
  const out = handle(msg);
  if (
    msg?.type === "scene_push" ||
    msg?.type === "scene_bind" ||
    msg?.type === "scene_reset"
  ) {
    console.log(
      `[inspector-ws] ${inspector.getSceneLabel()} source=${inspector.sceneStatus?.source} v=${inspector.mesh?.vertices?.length} f=${inspector.mesh?.faces?.length}`,
    );
  }
  return out;
};

const server = new LiveLinkServer({
  port,
  host,
  inspector,
  onClientConnect: (c) => {
    console.log(
      `[inspector-ws] connect ${c.id} path=${c.path} ${inspector.getSceneLabel()}`,
    );
  },
  onClientDisconnect: (c) => {
    console.log(`[inspector-ws] disconnect ${c.id}`);
  },
});

await server.start();
console.log(
  `[inspector-ws] listening ws://${host}:${port} (${inspector.getSceneLabel()}, ${defaults.mesh.faces.length} faces)`,
);
console.log(`[inspector-ws] meshesRoot=${meshesRoot}`);
console.log(`[inspector-ws] Unity: MRS / 4D Inspector → Connect (auto scene_push) to ws://${host}:${port}`);

process.on("SIGINT", () => {
  server.stop();
  process.exit(0);
});
