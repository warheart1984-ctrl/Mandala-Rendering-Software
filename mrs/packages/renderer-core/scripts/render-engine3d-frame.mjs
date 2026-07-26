#!/usr/bin/env node
/**
 * Optional CLI: read an Engine3D bridge scene JSON and emit a headless receipt.
 *
 * Status: **partial** (null-headless only).
 * Does NOT replace scripts/render-still.mjs Genblaze archetypes.
 *
 * Usage:
 *   node scripts/render-engine3d-frame.mjs --scene path/to/bridge-scene.json
 *   echo '{...}' | node scripts/render-engine3d-frame.mjs --stdin
 *
 * Gate: only runs when --engine3d-frame is passed OR ENGINE3D_FRAME=1.
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import {
  renderEngine3dFrameReceipt,
  bridgeSceneToHypersphereDescriptors,
} from "../src/render/rt4d/bridge/engine3dBridgeScene.js";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const gated =
    args["engine3d-frame"] === true ||
    process.env.ENGINE3D_FRAME === "1" ||
    process.env.ENGINE3D_FRAME === "true";
  if (!gated) {
    process.stderr.write(
      "render-engine3d-frame: refused — pass --engine3d-frame or set ENGINE3D_FRAME=1\n" +
        "(Genblaze default stills remain scripts/render-still.mjs)\n",
    );
    process.exit(2);
  }

  let raw;
  if (args.stdin === true) {
    raw = readFileSync(0, "utf8");
  } else if (typeof args.scene === "string") {
    raw = readFileSync(args.scene, "utf8");
  } else {
    process.stderr.write("render-engine3d-frame: --scene <file> or --stdin required\n");
    process.exit(2);
  }

  let scene;
  try {
    scene = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`render-engine3d-frame: invalid JSON: ${err}\n`);
    process.exit(1);
  }

  const mapped = bridgeSceneToHypersphereDescriptors(scene);
  const receipt = renderEngine3dFrameReceipt(scene, {
    frameIndex: scene.frameIndex,
    seed: scene.seed,
  });
  process.stdout.write(
    JSON.stringify(
      {
        status: "partial",
        note: "Headless receipt only; PathTracer4D from Engine3D frames is declared",
        mapped,
        receipt,
      },
      null,
      2,
    ) + "\n",
  );
}

main();
