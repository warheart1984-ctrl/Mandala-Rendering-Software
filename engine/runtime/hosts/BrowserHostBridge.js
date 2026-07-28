/**
 * BrowserHostBridge — thin MultiHost bridge over HostConstitutionalRouter.
 * STATUS: **enforced** (node:test). Does not claim browser WebGPU hardware CI.
 */

import {
  route as constitutionalRoute,
  HostAction,
} from "./HostConstitutionalRouter.js";

export function getActorIdentity(overrides = {}) {
  return {
    actor: "4dce.renderer",
    host: "browser",
    contract: "4dce.renderer",
    ...overrides,
  };
}

export function getCapabilities() {
  return Object.freeze({
    renderAssist: true,
    gpuPrint: false,
    setDeterminismRequiredAsPrintAuthority: false,
    injectEvidenceSecrets: false,
    provenance: true,
    replay: true,
  });
}

/**
 * @param {string} action
 * @param {object} [payload]
 */
export function route(action, payload = {}) {
  return constitutionalRoute(action, payload, { host: "browser" });
}

export { HostAction };

export default { getActorIdentity, getCapabilities, route, HostAction };
