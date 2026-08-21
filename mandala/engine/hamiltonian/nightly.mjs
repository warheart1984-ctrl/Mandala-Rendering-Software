#!/usr/bin/env node
/**
 * One Jacobi nightly pass on the JS H_gov demo graph.
 *   node mandala/engine/hamiltonian/nightly.mjs
 * Same energy as Python CPU (η=0.01, α=w=1). Not a cron daemon.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDemoGovernanceGraph,
  nightlyGovernanceRelaxation,
  rankGovFailures,
  NIGHTLY_ETA,
} from "./governance.mjs";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "../../../output/mandala-hamiltonian");
mkdirSync(outDir, { recursive: true });

const graph = createDemoGovernanceGraph();
const receipt = nightlyGovernanceRelaxation(graph);
const failures = rankGovFailures(graph, { k: 5 });
const payload = {
  ...receipt,
  failures: failures.top,
  gpu: "declared",
};
writeFileSync(join(outDir, "nightly-receipt.json"), JSON.stringify(payload, null, 2));
console.log("H_gov before:", receipt.H_before.toFixed(6));
console.log("H_gov after: ", receipt.H_after.toFixed(6));
console.log("deltaH:      ", receipt.deltaH.toFixed(6));
console.log("eta:         ", receipt.eta, "jacobi=", receipt.jacobi);
console.log("nodes:       ", receipt.nodesTouched);
console.log("receipt:     ", join(outDir, "nightly-receipt.json"));
if (receipt.eta !== NIGHTLY_ETA) {
  console.warn("eta override in use; nightly default is", NIGHTLY_ETA);
}
