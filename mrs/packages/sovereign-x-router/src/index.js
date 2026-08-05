/**
 * Package entry — re-exports prior vendor registry + canonical sovereign-x/ SoT.
 *
 * STATUS: **partial** — stubs + contract tests; no live GPU; print SoT = cpu.rt4d.print.
 */

export {
  REGISTRY_PATH,
  loadVendorCapabilityRegistry,
  getCapability,
  getForbiddenPrintCapabilityIds,
  indexCapabilitiesById,
  resolveCapabilityId,
  listCanonicalCapabilityClasses,
  clearRegistryCache,
} from "./registry.js";

export {
  DISPATCH_CODES,
  dispatchVendorCapability,
  listUpstreamCapabilityIds,
  listForbiddenPrintCapabilityIds,
} from "./dispatch.js";

export { callGateway, routedRequest } from "./gatewayRouter.js";

export {
  MODALITIES,
  VENDOR_PREFERENCES,
  AUTHORITY_TAGS,
  CAPABILITY_CLASSES,
  CONTRACT_CODES,
  validateGpuDispatchContract,
  resolveAssistBinding,
  defaultCapabilityClassFor,
} from "./GpuDispatchContract.js";

export {
  ASSIST_ROUTE_KINDS,
  routeLookDev,
  routeSceneSpecAssist,
  routeEmbeddings,
} from "./GpuAssistModule.js";

export {
  LOOKDEV_ENGINE_STATUS,
  LOOKDEV_STEPS,
  planLookDevPipeline,
} from "./lookdev/SovereignLookDevEngine.js";

// Canonical SoT: repo-root sovereign-x/
export {
  route,
  resolveCapability,
  loadGpuSkillsRegistry,
  clearGpuSkillsRegistryCache,
  GPU_SKILLS_REGISTRY_PATH,
} from "../../../../sovereign-x/router/index.js";

export { validate as validateGpuDispatchContractCanonical } from "../../../../sovereign-x/router/contracts/gpuDispatchContract.js";
export {
  assertGpuPrintSafeguard,
  checkGpuPrintSafeguard,
} from "../../../../sovereign-x/router/contracts/gpuPrintSafeguard.js";
export { GpuAssistModule } from "../../../../sovereign-x/router/modules/gpu/gpuAssistModule.js";
export { LookDevEngine } from "../../../../sovereign-x/router/modules/gpu/assist/lookDevEngine.js";
export { extractFluxSceneSpec } from "../../../../sovereign-x/router/modules/gpu/assist/fluxSceneSpecExtractor.js";
export {
  integrateDeterministicAssist,
  mulberry32,
} from "../../../../sovereign-x/router/modules/gpu/integrator/deterministicGpuIntegrator.js";
export {
  fluxGenerate,
  buildFluxStub,
  loadImageBase64,
  resolveFluxEndpoint,
} from "../../../../sovereign-x/skills/nvidia-gpu-assist/flux_generate.js";
export {
  runFaceCreationAssist,
  sceneToCharacterSpec,
  runCharacterBuilderPipeline,
} from "../../../../sovereign-x/integrations/genblaze/modes/faceCreationAssist.js";

// Aliases matching user API names
export { routeLookDev as handleLookDev } from "./GpuAssistModule.js";
export { routeSceneSpecAssist as handleSceneSpecAssist } from "./GpuAssistModule.js";
export { routeEmbeddings as handleEmbeddings } from "./GpuAssistModule.js";
