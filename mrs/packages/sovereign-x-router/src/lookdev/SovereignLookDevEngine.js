/**
 * SovereignLookDevEngine — architectural skeleton (Steps 1–4 assistOnly).
 *
 * STATUS: **declared** / **skeleton** — pipeline shape only; final print remains
 * CPU RT4D Digital Printer SoT. See:
 * docs/superpowers/specs/2026-07-28-sovereign-lookdev-engine-plan.md
 */

import {
  routeEmbeddings,
  routeLookDev,
  routeSceneSpecAssist,
} from "../GpuAssistModule.js";
import { validateGpuDispatchContract } from "../GpuDispatchContract.js";

export const LOOKDEV_ENGINE_STATUS = "declared";

export const LOOKDEV_STEPS = Object.freeze({
  1: "ingest_intent",
  2: "assist_lookdev",
  3: "assist_scenespec_or_embeddings",
  4: "hand_off_cpu_print",
});

/**
 * Run the declared assist-only look-dev pipeline.
 * Step 4 returns a hand-off token for CPU RT4D print — never invokes printer.
 *
 * @param {object} contract GpuDispatchContract
 * @param {{ backendsAvailable?: object, includeEmbeddings?: boolean }} [options]
 */
export function planLookDevPipeline(contract, options = {}) {
  const validation = validateGpuDispatchContract(contract);
  if (!validation.ok) {
    return {
      ok: false,
      status: LOOKDEV_ENGINE_STATUS,
      code: validation.code,
      message: validation.message,
      assistOnly: true,
    };
  }

  const step1 = {
    step: 1,
    name: LOOKDEV_STEPS[1],
    assistOnly: true,
    intentId: validation.contract.intentId,
    modality: validation.contract.modality,
  };

  const lookDev = routeLookDev(validation.contract, options);
  const step2 = {
    step: 2,
    name: LOOKDEV_STEPS[2],
    assistOnly: true,
    result: lookDev,
  };

  const assist3 = options.includeEmbeddings
    ? routeEmbeddings(validation.contract, options)
    : routeSceneSpecAssist(validation.contract, options);
  const step3 = {
    step: 3,
    name: LOOKDEV_STEPS[3],
    assistOnly: true,
    result: assist3,
  };

  // Final print is ALWAYS CPU RT4D — assist must not enter /printer/* here.
  const step4 = {
    step: 4,
    name: LOOKDEV_STEPS[4],
    assistOnly: false,
    printBackend: "cpu.rt4d.print",
    authorityTag: "authoritative",
    provenanceKind: "printProvenance",
    message:
      "Hand off to Digital Printer / CPU RT4D SoT — GPU assist ends before printer",
    printerRoute: null,
    bannedAssistIntoPrinter: true,
  };

  return {
    ok: lookDev.ok && assist3.ok,
    status: LOOKDEV_ENGINE_STATUS,
    assistOnlyThroughStep: 3,
    finalPrint: "cpu.rt4d.print",
    steps: [step1, step2, step3, step4],
    provenanceSplit: {
      assistProvenance: true,
      printProvenance: "cpu_rt4d_only_after_handoff",
    },
  };
}
