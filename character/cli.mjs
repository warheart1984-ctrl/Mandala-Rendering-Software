#!/usr/bin/env node
/**
 * Character pipeline CLI.
 *
 *   node character/cli.mjs build --id char --species anthro --out character/renders/char
 *   node character/cli.mjs build --id aven --species human --out character/renders/aven --turntable
 */
import { buildPipeline } from "./tools/pipeline.mjs";

const args = process.argv.slice(2);
const cmd = args[0] || "build";
const opts = { id: "char", species: "human", outDir: "character/renders/char", turntable: false };

for (let i = 1; i < args.length; i++) {
  if (args[i] === "--id" && args[i + 1]) opts.id = args[++i];
  else if (args[i] === "--species" && args[i + 1]) opts.species = args[++i];
  else if (args[i] === "--out" && args[i + 1]) opts.outDir = args[++i];
  else if (args[i] === "--width" && args[i + 1]) opts.width = parseInt(args[++i], 10);
  else if (args[i] === "--sim-frames" && args[i + 1]) opts.simFrames = parseInt(args[++i], 10);
  else if (args[i] === "--turntable") opts.turntable = true;
}

if (cmd !== "build") {
  console.error("Usage: node character/cli.mjs build [--id char] [--species human|anthro] [--out dir] [--turntable]");
  process.exit(1);
}

console.log(`Character pipeline — ${opts.id} (${opts.species})`);
const result = buildPipeline(opts);
console.log(`  topology: ${result.asset.mesh.vertexCount} verts, ${result.asset.mesh.faceCount} quads, ok=${result.asset.topo.ok}`);
console.log(`  armature: spine=${result.asset.bones.spine} shoulders=${result.asset.bones.shoulders} hips=${result.asset.bones.hips} tail=${result.asset.bones.tail} fingers=${result.asset.bones.fingers}`);
console.log(`  sim: ran=${result.sim.ran} frames=${result.sim.frames} cloakMoved=${result.sim.cloakMoved} [${result.sim.status}]`);
console.log(`  exports:`);
for (const [k, v] of Object.entries(result.paths)) {
  if (k === "manifest") continue;
  console.log(`    ${k}: ${v}`);
}
console.log(`  out: ${opts.outDir}`);
