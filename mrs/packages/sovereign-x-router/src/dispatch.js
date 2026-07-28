/**
 * Thin Sovereign X Router dispatch stubs.
 *
 * ALLOW: registered upstream capability IDs for non-print intents.
 * REJECT: forbidden print-SoT IDs; any asPrintSoT / print lane request;
 *         unknown IDs.
 *
 * STATUS: **partial** — stubs return structured decisions only; no vendor I/O.
 */

import {
  getCapability,
  getForbiddenPrintCapabilityIds,
  loadVendorCapabilityRegistry,
} from "./registry.js";

export const DISPATCH_CODES = Object.freeze({
  ALLOWED_UPSTREAM: "ALLOWED_UPSTREAM",
  FORBIDDEN_FOR_PRINT: "FORBIDDEN_FOR_PRINT",
  PRINT_SOT_BANNED: "PRINT_SOT_BANNED",
  UNKNOWN_CAPABILITY: "UNKNOWN_CAPABILITY",
  INVALID_REQUEST: "INVALID_REQUEST",
});

/**
 * @typedef {object} DispatchRequest
 * @property {string} [intentId]
 * @property {"upstream"|"lookdev"|"scenespec"|"parity"|"ai"|"print"} [intentLane]
 * @property {boolean} [asPrintSoT]
 * @property {boolean} [hostCapable] host advertises vendor GPU (AMD host-capability driven)
 */

/**
 * @param {string} capabilityId
 * @param {DispatchRequest} [request]
 * @returns {{
 *   ok: boolean,
 *   code: string,
 *   capabilityId: string,
 *   message: string,
 *   lane?: string,
 *   status?: string,
 *   skillNames?: string[],
 *   hostCapabilityDriven?: boolean,
 *   registryStatus?: string
 * }}
 */
export function dispatchVendorCapability(capabilityId, request = {}) {
  if (typeof capabilityId !== "string" || !capabilityId.trim()) {
    return {
      ok: false,
      code: DISPATCH_CODES.INVALID_REQUEST,
      capabilityId: String(capabilityId ?? ""),
      message: "capabilityId must be a non-empty string",
    };
  }

  const id = capabilityId.trim();
  const asPrintSoT = request.asPrintSoT === true;
  const intentLane = request.intentLane ?? "upstream";
  const printIntent = asPrintSoT || intentLane === "print";

  const forbidden = getForbiddenPrintCapabilityIds();
  if (forbidden.has(id)) {
    const doc = loadVendorCapabilityRegistry();
    const row = (doc.forbiddenPrintCapabilityIds ?? []).find(
      (r) => r.id === id,
    );
    return {
      ok: false,
      code: DISPATCH_CODES.PRINT_SOT_BANNED,
      capabilityId: id,
      message:
        row?.reason ??
        `Capability '${id}' is constitutionally banned for Digital Printer SoT`,
      registryStatus: doc.status,
    };
  }

  const cap = getCapability(id);
  if (!cap) {
    return {
      ok: false,
      code: DISPATCH_CODES.UNKNOWN_CAPABILITY,
      capabilityId: id,
      message: `Unknown vendor capability '${id}' — not in Sovereign X registry`,
    };
  }

  if (printIntent) {
    return {
      ok: false,
      code: DISPATCH_CODES.FORBIDDEN_FOR_PRINT,
      capabilityId: id,
      message:
        `Capability '${id}' is upstream-only (printLane=${cap.printLane}). ` +
        `Digital Printer SoT remains CPU/deterministic (mulberry32, evidence, CONTRACT_DIGITAL_PRINT). ` +
        `Skills expand the router; they do not override the printer contract.`,
      lane: cap.lane,
      status: cap.status,
      skillNames: [...(cap.skillNames ?? [])],
      hostCapabilityDriven: Boolean(cap.hostCapabilityDriven),
    };
  }

  // Defense-in-depth: any registered capability tagged forbidden_for_print
  // must still reject explicit print SoT (covered above). Upstream allow path:
  if (cap.lane !== "upstream") {
    return {
      ok: false,
      code: DISPATCH_CODES.FORBIDDEN_FOR_PRINT,
      capabilityId: id,
      message: `Capability '${id}' lane '${cap.lane}' is not dispatchable as upstream`,
      lane: cap.lane,
      status: cap.status,
    };
  }

  // AMD: host-capability driven — allow registration/dispatch decision even
  // when Mandala has no in-repo AMD backend; note when hostCapable is false.
  const hostNote =
    cap.hostCapabilityDriven && request.hostCapable === false
      ? " Host did not advertise capability; dispatch allowed as registry stub only (no backend invoke)."
      : "";

  return {
    ok: true,
    code: DISPATCH_CODES.ALLOWED_UPSTREAM,
    capabilityId: id,
    message:
      `Upstream dispatch stub ALLOWED for '${id}' (status=${cap.status}).` +
      ` No vendor runtime invoke in this thin registration.` +
      hostNote,
    lane: cap.lane,
    status: cap.status,
    skillNames: [...(cap.skillNames ?? [])],
    hostCapabilityDriven: Boolean(cap.hostCapabilityDriven),
  };
}

/**
 * List capability IDs the router may allow on the upstream lane.
 * @returns {string[]}
 */
export function listUpstreamCapabilityIds() {
  const doc = loadVendorCapabilityRegistry();
  return doc.capabilities
    .filter((c) => c.lane === "upstream")
    .map((c) => c.id);
}

/**
 * List print-SoT IDs the router must reject.
 * @returns {string[]}
 */
export function listForbiddenPrintCapabilityIds() {
  return [...getForbiddenPrintCapabilityIds()];
}
