/**
 * UnityHostBridge — JS constitutional routing for Unity host.
 *
 * STATUS: Host constitutional routing **enforced** (node:test).
 * Unity product host / Play Mode remains **skeleton**.
 *
 * Thin native stub: `unity/GovernedUnityProject/Assets/Engine/Runtime/HostConstitutionalBridge.cs`
 * documents calling this SoT (no Editor/PIE CI claim).
 */

import {
  route as constitutionalRoute,
  HostAction,
} from "./HostConstitutionalRouter.js";

export function getActorIdentity(overrides = {}) {
  return {
    actor: "runtime.unity",
    host: "unity",
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
    playModeCi: false,
  });
}

/**
 * @param {string} action
 * @param {object} [payload]
 */
export function route(action, payload = {}) {
  return constitutionalRoute(action, payload, { host: "unity" });
}

export { HostAction };

export default { getActorIdentity, getCapabilities, route, HostAction };
