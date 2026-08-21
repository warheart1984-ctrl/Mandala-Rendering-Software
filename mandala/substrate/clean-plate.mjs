#!/usr/bin/env node
/**
 * RHFD vacuum / Mandala clean plate.
 *
 * Empty scene is equilibrated substrate: hex dual-lattice + zero-mean η + ∇V=0,
 * no characters, no events. Wraps the RT4D miss path (gradient sky) rather than
 * rewriting the tracer.
 *
 * Status: **partial** — 64×64 / 1 spp visualization, not a measured RHFD vacuum.
 *
 * Usage:
 *   node mandala/substrate/clean-plate.mjs
 *   node mandala/substrate/clean-plate.mjs --out-dir output/simulation/rhfd-vacuum
 *
 * Does not write output/simulation/salt-atlas/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Scene4D } from "../../mrs/packages/renderer-core/src/render/rt4d/scene/Scene4D.js";
import { Camera4D } from "../../mrs/packages/renderer-core/src/render/rt4d/camera/Camera4D.js";
import {
  renderSceneFrame,
  encodePNG,
} from "../../mrs/packages/renderer-core/scripts/render-still.mjs";
import {
  createHexLattice,
  fillGroundState,
  etaMean,
  maxForceMagnitude,
  allHexLoopsConsistent,
} from "./dual-lattice.mjs";
import { describeRenderPipeline } from "./block-average.mjs";
import { axialToCartesian } from "./moebius.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

function parseArgs(argv) {
  const out = { outDir: resolve(ROOT, "output/simulation/rhfd-vacuum") };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out-dir" && argv[i + 1]) out.outDir = resolve(argv[++i]);
    else if (argv[i] === "--help" || argv[i] === "-h") out.help = true;
  }
  return out;
}

function rasterHexField(lattice, width, height, { showEta = true } = {}) {
  const rgba = Buffer.alloc(width * height * 4);
  const spacing = lattice.spacing;
  const radius = lattice.radius;
  const span = spacing * (2 * radius + 1) * 1.15;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const wx = ((x + 0.5) / width - 0.5) * span;
      const wy = (0.5 - (y + 0.5) / height) * span;
      let best = null;
      let bestD = Infinity;
      for (const n of lattice.nodes) {
        const d = (n.position[0] - wx) ** 2 + (n.position[1] - wy) ** 2;
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      const cellR = spacing * 0.48;
      const inside = Math.sqrt(bestD) < cellR;
      const eta = best && showEta ? best.eta : 0;
      const base = inside ? 0.42 : 0.18;
      const v = Math.min(1, Math.max(0, base + eta * 0.35));
      const idx = (y * width + x) * 4;
      rgba[idx] = Math.round(v * 210);
      rgba[idx + 1] = Math.round(v * 220);
      rgba[idx + 2] = Math.round(v * 235);
      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write("Usage: node mandala/substrate/clean-plate.mjs [--out-dir DIR]\n");
    return;
  }

  const width = 64;
  const height = 64;
  const samples = 1;
  const lattice = fillGroundState(createHexLattice({ radius: 2, spacing: 1 }), {
    seed: 42,
    etaAmplitude: 0.2,
  });

  mkdirSync(args.outDir, { recursive: true });

  const scene = new Scene4D();
  scene.build();
  const camera = new Camera4D({
    x: 0,
    y: 1.6,
    z: -5,
    w: 0,
    lx: 0,
    ly: 1,
    lz: 0,
    lw: 0,
    fovX: 52,
    fovY: 52,
    width,
    height,
  });

  const cleanPng = renderSceneFrame(scene, camera, {
    width,
    height,
    samples,
    maxDepth: 1,
    seed: 1,
    palette: { albedo: [0.45, 0.5, 0.62] },
    exposure: 1.8,
  });
  const cleanPath = resolve(args.outDir, "clean-plate.png");
  writeFileSync(cleanPath, cleanPng);

  const hexRgba = rasterHexField(lattice, width, height, { showEta: false });
  const hexPath = resolve(args.outDir, "hex-ground.png");
  writeFileSync(hexPath, encodePNG(width, height, hexRgba));

  const etaRgba = rasterHexField(lattice, width, height, { showEta: true });
  const etaPath = resolve(args.outDir, "eta-field.png");
  writeFileSync(etaPath, encodePNG(width, height, etaRgba));

  const pipeline = describeRenderPipeline({
    uvWidth: width,
    uvHeight: height,
    irWidth: width,
    irHeight: height,
    samples,
  });

  const receipt = {
    status: "partial",
    kind: "rhfd-vacuum-clean-plate",
    note: "Empty RT4D scene (miss-path sky) + hex dual-lattice diagnostic. Not a measured RHFD vacuum. No TAA. 64×64/1spp.",
    vacuum: {
      defects: lattice.defects.length,
      maxForce: maxForceMagnitude(lattice),
      etaMean: etaMean(lattice),
      hexLoopsConsistent: allHexLoopsConsistent(lattice),
      hexCells: lattice.nodes.length,
      hexOrigin: axialToCartesian(0, 0, 1),
    },
    pipeline,
    organs: { pixels: "Mandala", motion: "Simulation Chamber" },
    doNotOverwrite: "output/simulation/salt-atlas/",
    outputs: { cleanPath, hexPath, etaPath },
  };
  writeFileSync(
    resolve(args.outDir, "clean-plate-receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
  );

  process.stdout.write(`clean-plate: ${cleanPath}\n`);
  process.stdout.write(`hex-ground:  ${hexPath}\n`);
  process.stdout.write(`eta-field:   ${etaPath}\n`);
  process.stdout.write(
    `vacuum: hexLoopsConsistent=${receipt.vacuum.hexLoopsConsistent} maxForce=${receipt.vacuum.maxForce} etaMean=${receipt.vacuum.etaMean.toExponential(2)}\n`,
  );
}

const isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { main };
