/**
 * GpuDispatchContract — validation + capability binding for GPU-assisted compute.
 *
 * STATUS: **partial** — contract rules enforced in unit tests; no vendor I/O.
 * Assist NEVER routes into /printer/* or evidence SoT (Drive-G-1 / P5).
 */

import {
  getCapability,
  getForbiddenPrintCapabilityIds,
  resolveCapabilityId,
} from "./registry.js";

export const MODALITIES = Object.freeze(["image", "text", "video"]);
export const VENDOR_PREFERENCES = Object.freeze([
  "auto",
  "nvidia",
  "amd",
  "cpu",
]);
export const AUTHORITY_TAGS = Object.freeze(["authoritative", "assist"]);

/** Canonical capability classes from user SoT §A (plus prior registry IDs). */
export const CAPABILITY_CLASSES = Object.freeze([
  "gpu.inference.nvidia.tao",
  "gpu.compute.nvidia.cuda",
  "gpu.gen.nvidia.nim_flux",
  "gpu.inference.amd.rocm",
  "gpu.compute.amd.hip",
  // Prior registry IDs kept as valid classes / aliases
  "ai.gen.nvidia.flux",
  "ai.gen.nvidia.cosmos",
  "ai.vision.nvidia.llama",
  "gpu.optimize.nvidia.dynamo",
  "gpu.sim.nvidia.tilegym",
  "gpu.compute.amd.rocm",
  "cpu.rt4d.print",
]);

export const CONTRACT_CODES = Object.freeze({
  VALID: "VALID",
  INVALID_CONTRACT: "INVALID_CONTRACT",
  PRINTER_ROUTE_BANNED: "PRINTER_ROUTE_BANNED",
  EVIDENCE_SOT_BANNED: "EVIDENCE_SOT_BANNED",
  PRINT_SOT_BANNED: "PRINT_SOT_BANNED",
  UNKNOWN_CAPABILITY_CLASS: "UNKNOWN_CAPABILITY_CLASS",
  SOVEREIGNTY_OVERRIDE_CPU: "SOVEREIGNTY_OVERRIDE_CPU",
  DETERMINISM_CPU_ONLY: "DETERMINISM_CPU_ONLY",
});

const PRINTER_PATH_RE = /(?:^|\/)printer(?:\/|$)/i;
const EVIDENCE_SOT_MARKERS = Object.freeze([
  "printProvenance",
  "evidenceSoT",
  "beautySoT",
  "digital_print",
  "digital-print",
]);

/**
 * @typedef {object} GpuDispatchContract
 * @property {string} intentId
 * @property {"image"|"text"|"video"} modality
 * @property {boolean} determinismRequired
 * @property {"auto"|"nvidia"|"amd"|"cpu"} vendorPreference
 * @property {string} [capabilityClass]
 * @property {string} [route] optional path — /printer/* always rejected
 * @property {boolean} [asPrintSoT]
 * @property {boolean} [asEvidenceSoT]
 * @property {"assist"|"authoritative"} [authorityTag] assist default for GPU assist
 */

/**
 * @param {unknown} contract
 * @returns {{ ok: boolean, code: string, message: string, contract?: GpuDispatchContract }}
 */
export function validateGpuDispatchContract(contract) {
  if (!contract || typeof contract !== "object") {
    return {
      ok: false,
      code: CONTRACT_CODES.INVALID_CONTRACT,
      message: "GpuDispatchContract must be a non-null object",
    };
  }

  const c = /** @type {Record<string, unknown>} */ (contract);

  if (typeof c.intentId !== "string" || !c.intentId.trim()) {
    return {
      ok: false,
      code: CONTRACT_CODES.INVALID_CONTRACT,
      message: "intentId must be a non-empty string",
    };
  }

  if (!MODALITIES.includes(/** @type {string} */ (c.modality))) {
    return {
      ok: false,
      code: CONTRACT_CODES.INVALID_CONTRACT,
      message: `modality must be one of: ${MODALITIES.join(", ")}`,
    };
  }

  if (typeof c.determinismRequired !== "boolean") {
    return {
      ok: false,
      code: CONTRACT_CODES.INVALID_CONTRACT,
      message: "determinismRequired must be boolean",
    };
  }

  if (!VENDOR_PREFERENCES.includes(/** @type {string} */ (c.vendorPreference))) {
    return {
      ok: false,
      code: CONTRACT_CODES.INVALID_CONTRACT,
      message: `vendorPreference must be one of: ${VENDOR_PREFERENCES.join(", ")}`,
    };
  }

  if (
    c.capabilityClass != null &&
    (typeof c.capabilityClass !== "string" || !c.capabilityClass.trim())
  ) {
    return {
      ok: false,
      code: CONTRACT_CODES.INVALID_CONTRACT,
      message: "capabilityClass, when set, must be a non-empty string",
    };
  }

  if (typeof c.route === "string" && PRINTER_PATH_RE.test(c.route)) {
    return {
      ok: false,
      code: CONTRACT_CODES.PRINTER_ROUTE_BANNED,
      message:
        "Assist MUST NEVER route into /printer/* — Digital Printer SoT is CPU RT4D only",
    };
  }

  if (c.asPrintSoT === true || c.asEvidenceSoT === true) {
    return {
      ok: false,
      code: CONTRACT_CODES.EVIDENCE_SOT_BANNED,
      message:
        "Assist cannot bind asPrintSoT / asEvidenceSoT — assistProvenance only",
    };
  }

  if (typeof c.route === "string") {
    const lower = c.route.toLowerCase();
    for (const marker of EVIDENCE_SOT_MARKERS) {
      if (lower.includes(marker.toLowerCase())) {
        return {
          ok: false,
          code: CONTRACT_CODES.EVIDENCE_SOT_BANNED,
          message: `Assist route must not target evidence SoT marker '${marker}'`,
        };
      }
    }
  }

  if (c.capabilityClass) {
    const resolved = resolveCapabilityId(String(c.capabilityClass).trim());
    const forbidden = getForbiddenPrintCapabilityIds();
    if (forbidden.has(resolved) || forbidden.has(String(c.capabilityClass))) {
      return {
        ok: false,
        code: CONTRACT_CODES.PRINT_SOT_BANNED,
        message: `capabilityClass '${c.capabilityClass}' is banned for print/evidence SoT`,
      };
    }
    if (
      resolved !== "cpu.rt4d.print" &&
      !getCapability(resolved) &&
      !CAPABILITY_CLASSES.includes(String(c.capabilityClass).trim())
    ) {
      return {
        ok: false,
        code: CONTRACT_CODES.UNKNOWN_CAPABILITY_CLASS,
        message: `Unknown capabilityClass '${c.capabilityClass}'`,
      };
    }
  }

  /** @type {GpuDispatchContract} */
  const normalized = {
    intentId: String(c.intentId).trim(),
    modality: /** @type {"image"|"text"|"video"} */ (c.modality),
    determinismRequired: c.determinismRequired === true,
    vendorPreference: /** @type {"auto"|"nvidia"|"amd"|"cpu"} */ (
      c.vendorPreference
    ),
    authorityTag: "assist",
  };
  if (c.capabilityClass) {
    normalized.capabilityClass = String(c.capabilityClass).trim();
  }
  if (typeof c.route === "string") {
    normalized.route = c.route;
  }

  return {
    ok: true,
    code: CONTRACT_CODES.VALID,
    message: "GpuDispatchContract valid (assist lane)",
    contract: normalized,
  };
}

/**
 * Default capability class by modality when caller omits capabilityClass.
 * @param {"image"|"text"|"video"} modality
 * @param {"nvidia"|"amd"|"cpu"} vendor
 */
export function defaultCapabilityClassFor(modality, vendor) {
  if (vendor === "cpu") return "cpu.rt4d.print";
  if (vendor === "amd") {
    if (modality === "text") return "gpu.inference.amd.rocm";
    return "gpu.compute.amd.hip";
  }
  // nvidia
  if (modality === "image") return "gpu.gen.nvidia.nim_flux";
  if (modality === "video") return "ai.gen.nvidia.cosmos";
  return "gpu.inference.nvidia.tao";
}

/**
 * Resolve assist capability binding.
 *
 * Rules:
 * - determinismRequired=true → CPU RT4D only
 * - vendor=auto → NVIDIA → AMD → CPU (sovereignty override if backend missing)
 * - authorityTag always **assist** for this contract surface
 * - never printer / evidence SoT
 *
 * @param {GpuDispatchContract} contract
 * @param {{ backendsAvailable?: { nvidia?: boolean, amd?: boolean, cpu?: boolean } }} [options]
 */
export function resolveAssistBinding(contract, options = {}) {
  const validation = validateGpuDispatchContract(contract);
  if (!validation.ok) {
    return {
      ok: false,
      code: validation.code,
      message: validation.message,
      authorityTag: "assist",
      provenanceKind: "assistProvenance",
    };
  }

  const c = validation.contract;
  const backends = {
    nvidia: options.backendsAvailable?.nvidia !== false,
    amd: options.backendsAvailable?.amd !== false,
    cpu: options.backendsAvailable?.cpu !== false,
  };

  /** @type {"nvidia"|"amd"|"cpu"} */
  let vendor;
  /** @type {string} */
  let code = CONTRACT_CODES.VALID;
  let message = "Assist binding resolved";

  if (c.determinismRequired) {
    vendor = "cpu";
    code = CONTRACT_CODES.DETERMINISM_CPU_ONLY;
    message =
      "determinismRequired=true → CPU RT4D only (GPU assist suppressed)";
  } else if (c.vendorPreference === "cpu") {
    vendor = "cpu";
  } else if (c.vendorPreference === "nvidia") {
    if (backends.nvidia) {
      vendor = "nvidia";
    } else if (backends.amd) {
      vendor = "amd";
      code = CONTRACT_CODES.SOVEREIGNTY_OVERRIDE_CPU;
      message =
        "NVIDIA preference unmet; sovereignty override → AMD (then CPU if needed)";
    } else {
      vendor = "cpu";
      code = CONTRACT_CODES.SOVEREIGNTY_OVERRIDE_CPU;
      message =
        "NVIDIA preference unmet and AMD unavailable; sovereignty override → CPU";
    }
  } else if (c.vendorPreference === "amd") {
    if (backends.amd) {
      vendor = "amd";
    } else if (backends.cpu) {
      vendor = "cpu";
      code = CONTRACT_CODES.SOVEREIGNTY_OVERRIDE_CPU;
      message = "AMD preference unmet; sovereignty override → CPU";
    } else {
      vendor = "cpu";
      code = CONTRACT_CODES.SOVEREIGNTY_OVERRIDE_CPU;
      message = "No GPU backend available; sovereignty override → CPU";
    }
  } else {
    // auto: NVIDIA → AMD → CPU
    if (backends.nvidia) {
      vendor = "nvidia";
      message = "vendor=auto → NVIDIA preferred";
    } else if (backends.amd) {
      vendor = "amd";
      code = CONTRACT_CODES.SOVEREIGNTY_OVERRIDE_CPU;
      message = "vendor=auto; NVIDIA missing → AMD (sovereignty cascade)";
    } else {
      vendor = "cpu";
      code = CONTRACT_CODES.SOVEREIGNTY_OVERRIDE_CPU;
      message = "vendor=auto; NVIDIA+AMD missing → CPU (sovereignty cascade)";
    }
  }

  // If preferred GPU still missing after cascade edge cases, force CPU.
  if (vendor === "nvidia" && !backends.nvidia) {
    vendor = backends.amd ? "amd" : "cpu";
    code = CONTRACT_CODES.SOVEREIGNTY_OVERRIDE_CPU;
    message = "Backend missing; sovereignty override applied";
  }
  if (vendor === "amd" && !backends.amd) {
    vendor = "cpu";
    code = CONTRACT_CODES.SOVEREIGNTY_OVERRIDE_CPU;
    message = "AMD backend missing; sovereignty override → CPU";
  }

  const capabilityClass =
    c.capabilityClass ?? defaultCapabilityClassFor(c.modality, vendor);
  const resolvedId =
    capabilityClass === "cpu.rt4d.print"
      ? "cpu.rt4d.print"
      : resolveCapabilityId(capabilityClass);

  return {
    ok: true,
    code,
    message,
    intentId: c.intentId,
    modality: c.modality,
    vendor,
    capabilityClass:
      resolvedId === "cpu.rt4d.print" ? "cpu.rt4d.print" : capabilityClass,
    resolvedCapabilityId: resolvedId,
    authorityTag: "assist",
    provenanceKind: "assistProvenance",
    printProvenance: false,
    backendsAvailable: backends,
  };
}
