/**
 * HostConstitutionalRouter — shared MultiHost constitutional SoT (JS).
 *
 * STATUS: **enforced** when `engine/constitution/test/multihost-constitution.test.js`
 * and host bridge tests pass under node:test. Does not claim Unity Play Mode /
 * Unreal PIE CI.
 *
 * Gates (Drive-G-1):
 * - GPU never print SoT (`gpu.print`, print mode on GPU caps)
 * - `setDeterminismRequired` is not print authority for GPU
 * - `injectEvidence` may not carry secrets (`apiKey`, tokens)
 * - `renderAssist` allowed (assist-only)
 *
 * Uses `gpuPrintSafeguard` + optional skills registry metadata when present.
 */

import {
  assertGpuPrintSafeguard,
  checkGpuPrintSafeguard,
  GPU_PRINT_SAFEGUARD_CODE,
} from "../../../sovereign-x/router/contracts/gpuPrintSafeguard.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const HOST_CONSTITUTIONAL_ROUTER_CODE = "HOST_CONSTITUTIONAL_DENY";

/** @typedef {'gpu.print'|'setDeterminismRequired'|'injectEvidence'|'renderAssist'|string} HostAction */

export const HostAction = Object.freeze({
  GPU_PRINT: "gpu.print",
  SET_DETERMINISM_REQUIRED: "setDeterminismRequired",
  INJECT_EVIDENCE: "injectEvidence",
  RENDER_ASSIST: "renderAssist",
});

const SECRET_EVIDENCE_KEYS = Object.freeze([
  "apiKey",
  "api_key",
  "token",
  "accessToken",
  "secret",
  "password",
  "authorization",
]);

let _registryCache = undefined;

/**
 * Load GPU skills registry if present (assist-only metadata). Soft-fail.
 * @returns {object|null}
 */
export function loadGpuSkillsRegistry() {
  if (_registryCache !== undefined) return _registryCache;
  try {
    const p = path.resolve(
      __dirname,
      "../../../sovereign-x/router/registry/gpuSkillsRegistry.json",
    );
    _registryCache = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    _registryCache = null;
  }
  return _registryCache;
}

/**
 * @param {object} [evidence]
 * @returns {string|null} first forbidden secret key found
 */
export function findSecretEvidenceKey(evidence) {
  if (!evidence || typeof evidence !== "object") return null;
  for (const key of SECRET_EVIDENCE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(evidence, key) && evidence[key] != null) {
      return key;
    }
  }
  // Nested common bags
  for (const bag of ["headers", "credentials", "auth", "secrets"]) {
    const nested = evidence[bag];
    if (nested && typeof nested === "object") {
      const hit = findSecretEvidenceKey(nested);
      if (hit) return `${bag}.${hit}`;
    }
  }
  return null;
}

/**
 * Soft denial envelope (never throws).
 * @param {string} code
 * @param {string} message
 * @param {object} [extra]
 */
function deny(code, message, extra = {}) {
  return {
    ok: false,
    denied: true,
    assistOnly: true,
    nonAuthoritative: true,
    code,
    message,
    ...extra,
  };
}

function allow(extra = {}) {
  return {
    ok: true,
    denied: false,
    assistOnly: extra.assistOnly !== false,
    nonAuthoritative: extra.nonAuthoritative !== false,
    ...extra,
  };
}

/**
 * Route a host-level constitutional action.
 * @param {HostAction} action
 * @param {object} [payload]
 * @param {object} [context]
 */
export function routeHostAction(action, payload = {}, context = {}) {
  const act = String(action || "");
  const host = context.host ?? "unknown";

  if (act === HostAction.GPU_PRINT || act === "gpu.print" || act === "print.gpu") {
    return deny(
      HOST_CONSTITUTIONAL_ROUTER_CODE,
      `GPU print SoT denied on host '${host}' — use cpu.rt4d.print`,
      { action: act, host, reason: "gpu_never_print_sot" },
    );
  }

  if (act === HostAction.SET_DETERMINISM_REQUIRED || act === "setDeterminismRequired") {
    const asPrintAuthority =
      payload.asPrintAuthority === true ||
      payload.printAuthority === true ||
      payload.capabilityClass === "print" ||
      payload.mode === "print";
    const forGpu =
      payload.gpu === true ||
      String(payload.capabilityId || "").startsWith("gpu.") ||
      payload.backend?.startsWith?.("gpu.");

    if (asPrintAuthority || forGpu) {
      return deny(
        HOST_CONSTITUTIONAL_ROUTER_CODE,
        `setDeterminismRequired is not print authority for GPU — use cpu.rt4d.print`,
        { action: act, host, reason: "determinism_not_print_authority" },
      );
    }

    // Non-GPU, non-print-authority: acknowledged but not a print SoT grant.
    return allow({
      action: act,
      host,
      determinismRequired: payload.value === true || payload.determinismRequired === true,
      message: "determinism flag recorded; does not authorize GPU print SoT",
    });
  }

  if (act === HostAction.INJECT_EVIDENCE || act === "injectEvidence") {
    const evidence = payload.evidence ?? payload;
    const secretKey = findSecretEvidenceKey(evidence);
    if (secretKey) {
      return deny(
        HOST_CONSTITUTIONAL_ROUTER_CODE,
        `injectEvidence denied — secret field '${secretKey}' must not enter evidence`,
        { action: act, host, reason: "evidence_purity", secretKey },
      );
    }
    return allow({
      action: act,
      host,
      evidenceId: evidence?.id ?? payload.id ?? null,
      message: "evidence accepted (no secrets)",
    });
  }

  if (act === HostAction.RENDER_ASSIST || act === "renderAssist") {
    const registry = loadGpuSkillsRegistry();
    return allow({
      action: act,
      host,
      assistOnly: true,
      nonAuthoritative: true,
      authoritativePrint: registry?.authoritativePrint ?? "cpu.rt4d.print",
      message: "GPU/host render assist allowed — not Digital Printer SoT",
    });
  }

  // Capability-shaped actions (gpu.*) — reuse print safeguard.
  if (act.startsWith("gpu.")) {
    const check = checkGpuPrintSafeguard(act, payload);
    if (check) {
      return deny(check.code || GPU_PRINT_SAFEGUARD_CODE, check.message, {
        action: act,
        host,
        reason: "gpu_print_safeguard",
        capabilityId: act,
      });
    }
    return allow({
      action: act,
      host,
      capabilityId: act,
      authority: "assist",
      message: "GPU capability assist-only",
    });
  }

  return deny(
    HOST_CONSTITUTIONAL_ROUTER_CODE,
    `Unknown host action '${act}'`,
    { action: act, host, reason: "unknown_action" },
  );
}

/**
 * Capability dispatch gate (throws on hard deny via assert, or soft via check).
 * Prefer soft `routeCapability` for host adapters.
 * @param {string} capabilityId
 * @param {object} [request]
 * @param {{ soft?: boolean }} [opts]
 */
export function routeCapability(capabilityId, request = {}, opts = {}) {
  const soft = opts.soft !== false;
  if (soft) {
    const check = checkGpuPrintSafeguard(capabilityId, request);
    if (check) {
      return deny(check.code || GPU_PRINT_SAFEGUARD_CODE, check.message, {
        capabilityId,
        reason: "gpu_print_safeguard",
      });
    }
    if (String(capabilityId || "").startsWith("gpu.")) {
      return allow({
        capabilityId,
        authority: "assist",
        message: "GPU capability assist-only",
      });
    }
    return allow({ capabilityId, message: "capability allowed" });
  }
  assertGpuPrintSafeguard(capabilityId, request);
  return allow({ capabilityId });
}

/**
 * Unified route() for host bridges — action string or capability id.
 * @param {string} actionOrCapability
 * @param {object} [payload]
 * @param {object} [context]
 */
export function route(actionOrCapability, payload = {}, context = {}) {
  const id = String(actionOrCapability || "");
  if (
    id === HostAction.GPU_PRINT ||
    id === HostAction.SET_DETERMINISM_REQUIRED ||
    id === HostAction.INJECT_EVIDENCE ||
    id === HostAction.RENDER_ASSIST ||
    id === "print.gpu" ||
    id === "gpu.print"
  ) {
    return routeHostAction(id, payload, context);
  }
  if (id.startsWith("gpu.") || id.startsWith("cpu.")) {
    return routeCapability(id, payload, { soft: true });
  }
  return routeHostAction(id, payload, context);
}

export default {
  HostAction,
  route,
  routeHostAction,
  routeCapability,
  findSecretEvidenceKey,
  loadGpuSkillsRegistry,
  HOST_CONSTITUTIONAL_ROUTER_CODE,
  GPU_PRINT_SAFEGUARD_CODE,
};
