#!/usr/bin/env node
/**
 * Write Hamiltonian artifacts under output/mandala-hamiltonian/
 *   node mandala/engine/hamiltonian/run.mjs
 */
import { writeHamiltonianArtifacts } from "./visualize.mjs";

const r = writeHamiltonianArtifacts({});
console.log("Mandala lattice Hamiltonian artifacts");
console.log(`  out: ${r.outDir}`);
console.log(`  heatmap: ${r.heatPath}`);
console.log(`  energy: ${r.energyPngPath}`);
console.log(`  scan: ${r.scanPath}`);
console.log(`  receipt: ${r.receiptPath}`);
console.log(`  H0 → Hfinal: ${r.receipt.physics.H0.toFixed(4)} → ${r.receipt.physics.Hfinal.toFixed(4)}`);
console.log(`  energy non-increasing: ${r.receipt.physics.energyNonIncreasing}`);
console.log(`  scan status: ${r.receipt.scanStatus} (no critical exponent claimed)`);
