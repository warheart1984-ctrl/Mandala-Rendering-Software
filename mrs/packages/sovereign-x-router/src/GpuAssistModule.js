/**
 * GpuAssistModule — assist-only routing stubs for look-dev / SceneSpec / embeddings.
 *
 * Exports: routeLookDev, routeSceneSpecAssist, routeEmbeddings
 *
 * Policy:
 * - determinismRequired=true → CPU RT4D only
 * - vendor=auto → NVIDIA → AMD → CPU
 * - Governance: assistProvenance only; never printProvenance
 *
 * STATUS: **partial** — binding decisions enforced in tests; no vendor runtime invoke.
 */

import {
  CONTRACT_CODES,
  resolveAssistBinding,
  validateGpuDispatchContract,
} from "./GpuDispatchContract.js";
import { dispatchVendorCapability } from "./dispatch.js";

export const ASSIST_ROUTE_KINDS = Object.freeze({
  LOOK_DEV: "lookDev",
  SCENE_SPEC: "sceneSpecAssist",
  EMBEDDINGS: "embeddings",
});

/**
 * @param {object} contract GpuDispatchContract fields
 * @param {"lookDev"|"sceneSpecAssist"|"embeddings"} kind
 * @param {{ backendsAvailable?: { nvidia?: boolean, amd?: boolean, cpu?: boolean } }} [options]
 */
function routeAssist(contract, kind, options = {}) {
  const validation = validateGpuDispatchContract(contract);
  if (!validation.ok) {
    return {
      ok: false,
      kind,
      code: validation.code,
      message: validation.message,
      authorityTag: "assist",
      provenanceKind: "assistProvenance",
      printProvenance: false,
    };
  }

  const binding = resolveAssistBinding(validation.contract, options);
  if (!binding.ok) {
    return { ...binding, kind, printProvenance: false };
  }

  // Defense-in-depth: if bound to a registry GPU id, still reject print lane.
  if (binding.resolvedCapabilityId && binding.resolvedCapabilityId !== "cpu.rt4d.print") {
    const gate = dispatchVendorCapability(binding.resolvedCapabilityId, {
      intentId: binding.intentId,
      intentLane:
        kind === ASSIST_ROUTE_KINDS.LOOK_DEV
          ? "lookdev"
          : kind === ASSIST_ROUTE_KINDS.SCENE_SPEC
            ? "scenespec"
            : "ai",
      asPrintSoT: false,
    });
    if (!gate.ok) {
      return {
        ok: false,
        kind,
        code: gate.code,
        message: gate.message,
        authorityTag: "assist",
        provenanceKind: "assistProvenance",
        printProvenance: false,
        binding,
      };
    }
  }

  return {
    ok: true,
    kind,
    code: binding.code,
    message: `GpuAssistModule.${kind}: ${binding.message}`,
    authorityTag: "assist",
    provenanceKind: "assistProvenance",
    printProvenance: false,
    binding: {
      vendor: binding.vendor,
      capabilityClass: binding.capabilityClass,
      resolvedCapabilityId: binding.resolvedCapabilityId,
      modality: binding.modality,
      intentId: binding.intentId,
    },
    // Explicit: never attach print provenance on assist routes
    assistProvenance: {
      intentId: binding.intentId,
      kind,
      vendor: binding.vendor,
      capabilityClass: binding.capabilityClass,
      determinismRequired: validation.contract.determinismRequired,
      status: "declared",
    },
  };
}

/**
 * Look-dev assist (previews, denoise prototypes, concept polish).
 * @param {object} contract
 * @param {{ backendsAvailable?: object }} [options]
 */
export function routeLookDev(contract, options = {}) {
  return routeAssist(contract, ASSIST_ROUTE_KINDS.LOOK_DEV, options);
}

/**
 * SceneSpec draft assist (non-print).
 * @param {object} contract
 * @param {{ backendsAvailable?: object }} [options]
 */
export function routeSceneSpecAssist(contract, options = {}) {
  return routeAssist(contract, ASSIST_ROUTE_KINDS.SCENE_SPEC, options);
}

/**
 * Embeddings / vision search assist.
 * @param {object} contract
 * @param {{ backendsAvailable?: object }} [options]
 */
export function routeEmbeddings(contract, options = {}) {
  const withClass =
    contract?.capabilityClass != null
      ? contract
      : {
          ...contract,
          capabilityClass:
            contract?.vendorPreference === "amd" ||
            (contract?.vendorPreference === "auto" &&
              options.backendsAvailable?.nvidia === false)
              ? "gpu.inference.amd.rocm"
              : "ai.vision.nvidia.llama",
        };
  return routeAssist(withClass, ASSIST_ROUTE_KINDS.EMBEDDINGS, options);
}

export { CONTRACT_CODES };
