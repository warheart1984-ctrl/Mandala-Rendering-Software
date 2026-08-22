/**
 * AMUL denser topology worker — CLI + re-export.
 *
 * SoT workers: workers/denser-topology-worker.{ts,mjs}
 * Lane SoT: docs/bios-ai-lane.v2.json (synced → Bios-Ai-Lane-V2.json)
 *
 *   node character/tools/amul/amul-denser-topology-worker.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AMUL_BASE_QUADS,
  addSilhouetteLoops,
} from "../../../sovereign-x/runtime/amul/amulDenserTopology.js";

export {
  AMUL_BASE_QUADS,
  AMUL_SILHOUETTE_LOOPS,
  AMUL_TARGET_QUADS,
  AMUL_BOUND_QUADS_FX8350,
  PARITY_TARGETS,
  addSilhouetteLoops,
  applyAmulTopologyDensify,
  resolveBlendshapesForPolaris,
  vossApplyGate,
  loadBiosAiLaneV2,
  BLENDSHAPES_STATUS,
} from "../../../sovereign-x/runtime/amul/amulDenserTopology.js";

export {
  DenserTopologyWorker,
  detectProfile,
  loadTargets,
} from "../../../workers/denser-topology-worker.mjs";

export { SiliconTunerAnalog } from "../../../workers/silicon-tuner-analog.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function main() {
  const base = {
    quads: AMUL_BASE_QUADS,
    prev_hash: "biosAiLane:19_voss:6_partial_genesis",
    source: "fox_reference",
  };
  const out = addSilhouetteLoops(base);
  for (const op of out.ops) {
    const cost = op.quads_after - op.quads_before;
    console.log(`[AMUL] ${op.id}: ${op.quads_before} -> ${op.quads_after} quads (+${cost})`);
  }
  console.log(JSON.stringify(out, null, 2));

  const outDir = resolve(__dirname, "../../../tmp/amul-densify");
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, "amul_denser_output.json");
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log("\n[WORKER] PARTIAL_GOVERNED lane complete — ready for SoT print gate.");
  console.log(`[WORKER] wrote ${path}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
