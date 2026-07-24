/**
 * FrameLoop boot example — Phase C **skeleton** (Drive-G-1).
 * Not a production demo. Safe default: wave.enabled = false.
 *
 * Browser (after bundling / import maps):
 *   import { FrameLoop } from "../src/render/rt4d/FrameLoop.js";
 *   import world from "./sample-world.json" assert { type: "json" };
 *   const loop = new FrameLoop(world, document.getElementById("c"));
 *   loop.start(); // no-ops with message in Node; rAF in browser
 *
 * Node smoke (no rAF):
 *   node --experimental-json-modules examples/frame-loop-boot.js
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FrameLoop } from "../src/render/rt4d/FrameLoop.js";

const dir = dirname(fileURLToPath(import.meta.url));
const world = JSON.parse(
  readFileSync(join(dir, "sample-world.json"), "utf8")
);

const loop = new FrameLoop(world, { width: 320, height: 240 }, {
  renderFrame: async (id) => ({ worldId: id, stub: true }),
});

const start = loop.start();
console.log("[frame-loop-boot]", start);
const tick = await loop.tick();
console.log("[frame-loop-boot] tick", tick);
