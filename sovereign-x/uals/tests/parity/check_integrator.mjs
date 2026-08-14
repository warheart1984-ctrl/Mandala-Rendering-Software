import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderAxiomXIntegrator } from "../../../../mrs/packages/renderer-core/src/render/rt4d/print/AxiomXIntegrator.js";

const [wArg, hArg, sppArg, seedArg, binFile] = process.argv.slice(2);
if (!wArg || !hArg || !sppArg || !seedArg || !binFile) {
  console.error("usage: node check_integrator.mjs <w> <h> <spp> <seed> <gpu.bin>");
  process.exit(2);
}
const width = Number(wArg);
const height = Number(hArg);
const spp = Number(sppArg);
const seed = Number(seedArg);

const gpu = readFileSync(binFile);
const ref = renderAxiomXIntegrator(seed, spp, width, height);
const expected = width * height * 4;

let ok = gpu.length === expected && gpu.length === ref.length;
if (ok) {
  for (let i = 0; i < gpu.length; i++) {
    if (gpu[i] !== ref[i]) { ok = false; break; }
  }
}
const sha = (b) => createHash("sha256").update(b).digest("hex");
console.log(`cpu.rt4d.print integrator mirror vs OpenCL Axiom X integrator (${width}x${height} spp=${spp} seed=${seed})`);
console.log(`  gpu sha256: ${sha(gpu)}`);
console.log(`  ref sha256: ${sha(ref)}`);
console.log(ok ? "PARITY PASS (byte-exact)" : "PARITY FAIL");
process.exit(ok ? 0 : 1);