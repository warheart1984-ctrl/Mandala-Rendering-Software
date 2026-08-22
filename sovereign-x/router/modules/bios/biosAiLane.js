/**
 * BIOS AI NPU Lane — assist-only verification + Voss Binding gate.
 *
 * STATUS: **declared / partial** — host npuTops is self-asserted; hop verify is a stub.
 * Drive-G-1: never print SoT; cpu.rt4d.print remains authoritative.
 * Beauty pixels banned. Firmware writes banned. Voss Binding (Λ) is the apply gate
 * for the vendor-neutral silicon tuner analog (not an ASUS UEFI copy).
 */

import { createHash } from "node:crypto";
import {
  createCycleContext,
  serializeVossResult,
  vossBinding,
} from "../../../runtime/voss/vossBinding.js";
import { applySiliconTunerAnalog } from "./siliconTunerAnalog.js";
import {
  amdLegacyCaps,
  isAmdLegacyHost,
  predictAmdLegacyThermalCpo,
} from "./amdLegacyProfile.js";

export const CAPABILITY_ID = "bios.ai.npu";

/**
 * Probe for BIOS AI NPU presence via platform APIs.
 * Returns capability descriptor or null if not available.
 *
 * On this workspace AMD box (FX-8350 + RX 580), returns amd_legacy caps
 * with npuTops:0 / npu_boost_class:none — never invents NPU tops.
 *
 * @param {object} platformInfo - Optional platform hint from host
 * @returns {Promise<object|null>}
 */
export async function detectBiosAiNpu(platformInfo = {}) {
  const { npuTops, biosAiVersion, thermalModel, powerModel } = platformInfo;

  if (isAmdLegacyHost(platformInfo)) {
    return amdLegacyCaps(platformInfo);
  }

  if (typeof npuTops === "number" && npuTops > 0) {
    return {
      capabilityId: CAPABILITY_ID,
      vendor: "bios",
      backend: "npu",
      npuTops,
      biosAiVersion: biosAiVersion ?? "unknown",
      thermalModel: thermalModel ?? "default",
      powerModel: powerModel ?? "default",
      status: "detected",
      assistOnly: true,
      bans: ["printSoT", "beautyPixels", "digitalPrinterEvidence"],
      canDo: [
        "hashPayload",
        "verifyHop",
        "pbnGridQuantization",
        "capabilityCheck",
        "fanThermalPrediction",
        "vossBinding",
        "siliconTunerAnalog",
      ],
    };
  }

  return null;
}

/**
 * Canonical PBN grid quantization — reduces still to 16-color grid + key.
 * Deterministic, no ML inference — pure quantization for verification.
 *
 * @param {Uint8Array} rgba - RGBA pixel data (width * height * 4)
 * @param {number} width
 * @param {number} height
 * @returns {{ grid: number[][], key: number[], payloadHash: string }}
 */
export function quantizePbnGrid(rgba, width, height) {
  const gridSize = 16;
  const cellW = Math.max(1, Math.floor(width / 4));
  const cellH = Math.max(1, Math.floor(height / 4));
  const grid = [];
  const key = [];

  for (let gy = 0; gy < 4; gy++) {
    const row = [];
    for (let gx = 0; gx < 4; gx++) {
      let r = 0, g = 0, b = 0, count = 0;
      const x0 = gx * cellW;
      const y0 = gy * cellH;
      const x1 = Math.min(width, x0 + cellW);
      const y1 = Math.min(height, y0 + cellH);

      for (let y = y0; y < y1; y++) {
        const base = y * width * 4;
        for (let x = x0; x < x1; x++) {
          const i = base + x * 4;
          r += rgba[i];
          g += rgba[i + 1];
          b += rgba[i + 2];
          count++;
        }
      }
      const avgR = Math.round(r / count);
      const avgG = Math.round(g / count);
      const avgB = Math.round(b / count);
      const colorIndex = (avgR << 16) | (avgG << 8) | avgB;
      row.push(colorIndex);
      if (!key.includes(colorIndex)) key.push(colorIndex);
    }
    grid.push(row);
  }

  const canonical = JSON.stringify({ grid, key: key.slice(0, 16) });
  const payloadHash = createHash("sha256").update(canonical).digest("hex");

  return { grid, key: key.slice(0, 16), payloadHash };
}

/**
 * Verify mandala-link packet signature (ed25519 placeholder).
 * Real implementation uses NPU-backed keystore.
 *
 * @param {string} payloadHash
 * @param {string} signatureHex
 * @param {string} publicKeyHex
 * @returns {boolean}
 */
export function verifyHop(payloadHash, signatureHex, publicKeyHex) {
  return payloadHash.length === 64 && signatureHex.length === 128 && publicKeyHex.length === 64;
}

/**
 * Capability check — returns lane capabilities without invoking beauty.
 *
 * @param {object} caps - Detected capabilities from detectBiosAiNpu
 * @returns {object}
 */
export function capabilityCheck(caps) {
  return {
    ok: true,
    capabilityId: CAPABILITY_ID,
    npuTops: caps?.npuTops ?? 0,
    canDo: caps?.canDo ?? [],
    bans: caps?.bans ?? ["printSoT", "beautyPixels"],
    assistOnly: true,
  };
}

/**
 * Fan/thermal prediction for CPO (Compute Pressure Optimizer) bounds.
 * Returns suggested hop_limit adjustment based on thermal model.
 *
 * AMD legacy (FX-8350 + RX 580 eco_conservative): uses 85C ceiling /
 * 80C hop-downclock curve. AMUL silhouette densify must not spuriously
 * throttle from npuTops=0.
 *
 * Generic NPU path (tests / other hosts): legacy temp×power score.
 *
 * @param {object} thermalTelemetry - { currentTempC, targetTempC, fanRpm, powerWatts, workload? }
 * @param {object} caps - NPU / AMD legacy capabilities
 * @returns {{ hopLimit: number, throttleRisk: "none" | "low" | "high", reason: string }}
 */
export function predictThermalCpo(thermalTelemetry, caps) {
  if (caps?.amdLegacy || caps?.thermalModel === "amd_legacy_fx8350_rx580") {
    return predictAmdLegacyThermalCpo(thermalTelemetry, caps);
  }

  const { currentTempC = 45, targetTempC = 80, fanRpm = 1200, powerWatts = 15 } = thermalTelemetry ?? {};
  const maxTops = caps?.npuTops ?? 10;
  const safeTops = Math.max(1, maxTops);

  const tempRatio = currentTempC / targetTempC;
  const powerRatio = powerWatts / (safeTops * 2);
  const throttleScore = tempRatio * 0.7 + powerRatio * 0.3;

  let hopLimit = 8;
  let throttleRisk = "none";
  let reason = "nominal";

  if (throttleScore > 0.85) {
    hopLimit = 2;
    throttleRisk = "high";
    reason = "thermal_throttle_imminent";
  } else if (throttleScore > 0.65) {
    hopLimit = 4;
    throttleRisk = "low";
    reason = "thermal_pressure_rising";
  }

  return { hopLimit, throttleRisk, reason, throttleScore: Number(throttleScore.toFixed(3)) };
}

/**
 * Main lane handler — assist-only, never claims beauty.
 *
 * @param {object} request
 * @returns {Promise<object>}
 */
export async function handleBiosAiLane(request = {}) {
  const { intentId, payload, thermalTelemetry, platformInfo, workloadClass = "balanced", recommendedPlacement = "cpu" } = request;
  const hasTunerFields = Boolean(
    request.npu_boost ||
      request.tuner_mode ||
      payload?.npu_boost ||
      payload?.tuner_mode ||
      payload?.profile ||
      request.profile
  );
  const mode =
    request.mode || (hasTunerFields ? "silicon-tuner" : request.mode);

  if (!intentId) {
    return {
      ok: false,
      code: "GOVERNANCE_INTENT_REQUIRED",
      message: "intentId required for BIOS AI lane",
      assistOnly: true,
      capabilityId: CAPABILITY_ID,
      pixelsProduced: false,
      workloadClass,
      recommendedPlacement,
    };
  }

  if (mode === "replay-parity") {
    const { verifySilhouetteReplayParity } = await import(
      "../../../runtime/amul/amulReplay.js"
    );
    const parity = verifySilhouetteReplayParity({
      density: payload?.density === "base" ? "base" : "amul",
      intentId,
      foxMaterialKey: payload?.foxMaterialKey || "fur.fox",
      humanMaterialKey: payload?.humanMaterialKey || "skin.humanoid",
      voss: { disposition: "BOUND" },
      thermal: { profileId: "amd_legacy_profile" },
    });
    return {
      ok: parity.ok,
      capabilityId: CAPABILITY_ID,
      authority: "assist",
      assistOnly: true,
      nonAuthoritative: true,
      pixelsProduced: false,
      firmware_write: false,
      mode: "replay-parity",
      status: parity.status,
      replayParity: parity,
      provenanceKind: "vossBindingDeclared",
      audit: { intentId, lane: CAPABILITY_ID, op: "replay-parity" },
      workloadClass,
      recommendedPlacement,
    };
  }

  if (mode === "voss-bind") {
    const ctx = createCycleContext();
    const protagonist = payload?.protagonist || {
      state: CAPABILITY_ID,
      bound: false,
      valid: true,
      context: { assistOnly: true, firmware_write: false },
    };
    const external = payload?.external || {
      state: "operator",
      bound: false,
      valid: true,
      context: { intentId },
    };
    const binding = vossBinding(ctx, protagonist, external);
    return {
      ok: binding.disposition !== "REJECTED",
      capabilityId: CAPABILITY_ID,
      authority: "assist",
      assistOnly: true,
      nonAuthoritative: true,
      pixelsProduced: false,
      firmware_write: false,
      mode: "voss-bind",
      provenanceKind: "vossBindingDeclared",
      voss: serializeVossResult(binding, ctx),
      audit: { intentId, lane: CAPABILITY_ID, op: "voss-bind" },
      workloadClass,
      recommendedPlacement,
    };
  }

  if (mode === "silicon-tuner") {
    const tunerPayload = {
      ...(payload || request.profile || request),
      // Default this workspace host to AMD legacy when caller opts in via platformInfo
      ...(isAmdLegacyHost(platformInfo || {})
        ? {
            amdLegacy: true,
            useAmdLegacy: true,
            tuner_mode:
              payload?.tuner_mode ||
              request.tuner_mode ||
              "eco_conservative",
            npu_boost_class: "none",
            npu_boost: payload?.npu_boost || request.npu_boost || "none",
          }
        : {}),
    };
    const analog = applySiliconTunerAnalog(tunerPayload);
    return {
      ...analog,
      capabilityId: CAPABILITY_ID,
      mode: "silicon-tuner",
      provenanceKind: "vossBindingDeclared",
      audit: { intentId, lane: CAPABILITY_ID, op: "silicon-tuner" },
      workloadClass,
      recommendedPlacement,
    };
  }

  const caps = await detectBiosAiNpu(platformInfo);

  if (!caps) {
    return {
      ok: false,
      code: "NPU_NOT_AVAILABLE",
      message: "BIOS AI NPU not detected or npuTops not reported",
      assistOnly: true,
      capabilityId: CAPABILITY_ID,
      workloadClass,
      recommendedPlacement,
    };
  }

  switch (mode) {
    case "pbn-quantize": {
      if (!payload || !payload.rgba || !payload.width || !payload.height) {
        return {
          ok: false,
          code: "INVALID_PAYLOAD",
          message: "pbn-quantize requires {rgba, width, height}",
          assistOnly: true,
          capabilityId: CAPABILITY_ID,
          workloadClass,
          recommendedPlacement,
        };
      }
      const { grid, key, payloadHash } = quantizePbnGrid(
        payload.rgba,
        payload.width,
        payload.height
      );
      return {
        ok: true,
        capabilityId: CAPABILITY_ID,
        authority: "assist",
        assistOnly: true,
        mode: "pbn-quantize",
        grid,
        key,
        payloadHash,
        provenanceKind: "biosAiProvenance",
        audit: { intentId, lane: CAPABILITY_ID, op: "pbn-quantize" },
        workloadClass,
        recommendedPlacement,
      };
    }

    case "verify-hop": {
      if (!payload || !payload.payloadHash || !payload.signature || !payload.publicKey) {
        return {
          ok: false,
          code: "INVALID_PAYLOAD",
          message: "verify-hop requires {payloadHash, signature, publicKey}",
          assistOnly: true,
          capabilityId: CAPABILITY_ID,
          workloadClass,
          recommendedPlacement,
        };
      }
      const verified = verifyHop(payload.payloadHash, payload.signature, payload.publicKey);
      return {
        ok: verified,
        capabilityId: CAPABILITY_ID,
        authority: "assist",
        assistOnly: true,
        mode: "verify-hop",
        verified,
        provenanceKind: "biosAiProvenance",
        audit: { intentId, lane: CAPABILITY_ID, op: "verify-hop" },
        workloadClass,
        recommendedPlacement,
      };
    }

    case "capability-check": {
      const check = capabilityCheck(caps);
      return {
        ok: true,
        capabilityId: CAPABILITY_ID,
        authority: "assist",
        assistOnly: true,
        mode: "capability-check",
        ...check,
        provenanceKind: "biosAiProvenance",
        audit: { intentId, lane: CAPABILITY_ID, op: "capability-check" },
        workloadClass,
        recommendedPlacement,
      };
    }

    case "thermal-cpo": {
      const prediction = predictThermalCpo(thermalTelemetry, caps);
      return {
        ok: true,
        capabilityId: CAPABILITY_ID,
        authority: "assist",
        assistOnly: true,
        mode: "thermal-cpo",
        ...prediction,
        provenanceKind: "biosAiProvenance",
        audit: { intentId, lane: CAPABILITY_ID, op: "thermal-cpo" },
        workloadClass,
        recommendedPlacement,
      };
    }

    default:
      return {
        ok: false,
        code: "UNKNOWN_MODE",
        message: `Unknown BIOS AI mode: ${mode}. Supported: pbn-quantize, verify-hop, capability-check, thermal-cpo, voss-bind, silicon-tuner, replay-parity`,
        assistOnly: true,
        capabilityId: CAPABILITY_ID,
        workloadClass,
        recommendedPlacement,
      };
  }
}