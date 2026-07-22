#!/usr/bin/env node
/**
 * Minimal MRS Inspector WebSocket server.
 *
 * Speaks INSPECTOR_PROTOCOL.md (inspect_screen / inspect_ray / inspect_primitive → inspect_result).
 * Reuses LiveLinkServer + UnityClientProtocol so inspect shares the live-link transport pattern.
 *
 * Status (Drive-G-1): prepares a local wire endpoint for Unity Editor / smoke tests.
 * Does not claim production scene binding — default mesh is a test fixture (not HCL RT implicits).
 *
 * Usage:
 *   npm run inspector:ws
 *   node scripts/inspector-ws-server.mjs [--port 9490] [--host 127.0.0.1]
 *
 * Unity default: ws://127.0.0.1:9490  (path /mrs_inspector is documentary; ws ignores path)
 */

import { LiveLinkServer } from "../4d-renderer/src/live-link/LiveLinkServer.js";
import { MRSInspector4D } from "../4d-renderer/src/inspector/index.js";
import { createDefaultInspectorTestMesh } from "../4d-renderer/src/inspector/defaultTestMesh.js";

function parseArgs(argv) {
  const out = { port: 9490, host: "127.0.0.1" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port" && argv[i + 1]) out.port = Number(argv[++i]);
    else if (argv[i] === "--host" && argv[i + 1]) out.host = argv[++i];
  }
  return out;
}

const { port, host } = parseArgs(process.argv.slice(2));

const mesh = createDefaultInspectorTestMesh();
const inspector = new MRSInspector4D({
  mesh,
  hyperplanes: [{ normal: { x: 0, y: 0, z: 1, w: 0 }, d: -0.1 }],
  rotationPlanes: [
    {
      axisA: { x: 1, y: 0, z: 0, w: 0 },
      axisB: { x: 0, y: 0, z: 0, w: 1 },
      angle: 0.1,
      label: "x-w",
    },
  ],
});

const server = new LiveLinkServer({
  port,
  host,
  inspector,
  onClientConnect: (c) => {
    console.log(`[inspector-ws] connect ${c.id} path=${c.path}`);
  },
  onClientDisconnect: (c) => {
    console.log(`[inspector-ws] disconnect ${c.id}`);
  },
});

await server.start();
console.log(
  `[inspector-ws] listening ws://${host}:${port} (MRSInspector4D + default test mesh, ${mesh.faces.length} faces)`,
);
console.log(`[inspector-ws] Unity: MRS / 4D Inspector → Connect to ws://${host}:${port}`);

process.on("SIGINT", () => {
  server.stop();
  process.exit(0);
});
