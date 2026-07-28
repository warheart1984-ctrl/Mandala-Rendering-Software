/**
 * UnrealHostBridge — JS constitutional routing for Unreal host.
 *
 * STATUS: Host constitutional routing **enforced** (node:test).
 * Unreal product host / PIE / MRQ remains **skeleton**.
 *
 * Thin native stub: `unreal/GovernedEnginePlugin/Source/GovernedEngine/Public/HostConstitutionalBridge.h`
 * documents calling this SoT (no PIE CI claim).
 */

import {
  route as constitutionalRoute,
  HostAction,
} from "./HostConstitutionalRouter.js";

export function getActorIdentity(overrides = {}) {
  return {
    actor: "runtime.unreal",
    host: "unreal",
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
    pieCi: false,
  });
}

/**
 * @param {string} action
 * @param {object} [payload]
 */
export function route(action, payload = {}) {
  return constitutionalRoute(action, payload, { host: "unreal" });
}

export { HostAction };

export default { getActorIdentity, getCapabilities, route, HostAction };
