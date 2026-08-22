/**
 * Vendor-neutral silicon tuner analog — assist-only.
 *
 * Inspired by public Ai Tweaker *categories* (tuner mode, NPU boost class,
 * thermal ceiling). Not a copy of ASUS UEFI, assets, or menu strings.
 * Never writes firmware variables (Λ.7 + charter).
 *
 * STATUS: **partial** — in-memory profile after Voss Binding; AMD legacy
 * eco_conservative + AMUL densify on this box (FX-8350 + RX 580).
 */

import {
  BINDING_DISPOSITION,
  createCycleContext,
  serializeVossResult,
  vossBinding,
} from "../../../runtime/voss/vossBinding.js";
import { applyAmulTopologyDensify } from "../../../runtime/amul/amulDenserTopology.js";
import {
  buildReplayLogs,
  verifySilhouetteReplayParity,
} from "../../../runtime/amul/amulReplay.js";
import { buildQuadHumanoid } from "../../../../character/models/topology.mjs";
import {
  AMD_LEGACY_PROFILE,
  isAmdLegacyHost,
  predictAmdLegacyThermalCpo,
} from "./amdLegacyProfile.js";

export const TUNER_MODES = Object.freeze([
  "auto",
  "manual",
  "memory_profile",
  "eco_conservative",
]);
export const NPU_BOOST = Object.freeze(["off", "none", "low", "high"]);

function clampCeiling(n, fallback = 80) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(105, Math.max(40, n));
}

export function normalizeTunerProfile(raw = {}) {
  const amd = isAmdLegacyHost(raw) || raw.amd_legacy_profile === true || raw.useAmdLegacy === true;
  const defaultMode = amd ? "eco_conservative" : "auto";
  const defaultBoost = amd ? "none" : "off";
  const defaultCeiling = amd ? AMD_LEGACY_PROFILE.thermal_ceiling_c.cpu : 80;

  const tuner_mode = TUNER_MODES.includes(raw.tuner_mode) ? raw.tuner_mode : defaultMode;
  let npu_boost = NPU_BOOST.includes(raw.npu_boost)
    ? raw.npu_boost
    : NPU_BOOST.includes(raw.npu_boost_class)
      ? raw.npu_boost_class
      : defaultBoost;
  // Alias: lane JSON uses npu_boost_class "none"
  if (npu_boost === "off" && amd) npu_boost = "none";

  return {
    tuner_mode,
    npu_boost,
    npu_boost_class: npu_boost,
    thermal_ceiling_c: clampCeiling(raw.thermal_ceiling_c, defaultCeiling),
    amd_legacy: amd,
    firmware_write: false,
    mayProduceBeauty: false,
    printSoT: false,
  };
}

function hopLimitForBoost(boost, profile = {}) {
  if (boost === "high") return 8;
  if (boost === "low") return 4;
  if (boost === "none" || profile.tuner_mode === "eco_conservative") {
    // Eco on AMD: nominal hop 6 — thermal CPO may lower further at ≥80C
    return 6;
  }
  return 2;
}

/**
 * Gate a tuner request through Λ before any in-memory apply.
 * firmware_write:true or beauty/print requests invalidate the influence line.
 */
export function applySiliconTunerAnalog(request = {}) {
  const requested = request.profile || request;
  const profile = normalizeTunerProfile(requested);
  const ctx = createCycleContext({ current_state: "0001" });

  const protagonist = {
    state: "bios.ai.npu",
    bound: false,
    valid: true,
    context: {
      assistOnly: true,
      mayProduceBeauty: false,
      firmware_write: false,
      printSoT: false,
      lane: "sovereign-x.silicon-tuner-analog",
    },
  };

  const writeAttempt = requested.firmware_write === true;
  const beautyAttempt = requested.mayProduceBeauty === true || requested.printSoT === true;
  const external = {
    state: "silicon-tuner-analog",
    bound: false,
    valid: !writeAttempt && !beautyAttempt,
    context: profile,
  };

  const binding = vossBinding(ctx, protagonist, external);
  const voss = serializeVossResult(binding, ctx);

  if (binding.disposition === BINDING_DISPOSITION.REJECTED) {
    return {
      ok: false,
      code: "VOSS_REJECTED",
      message: writeAttempt
        ? "firmware_write is blocked — analog never writes UEFI vars (Λ.3/Λ.7)"
        : "Voss Binding REJECTED — tuner analog halted",
      assistOnly: true,
      authority: "assist",
      pixelsProduced: false,
      firmware_write: false,
      mayProduceBeauty: false,
      voss,
    };
  }

  let hopLimit = hopLimitForBoost(profile.npu_boost, profile);
  let thermal = null;
  if (profile.amd_legacy || profile.tuner_mode === "eco_conservative") {
    const amul = Boolean(requested.amul_topology || requested.topology_densify);
    thermal = predictAmdLegacyThermalCpo(
      {
        currentTempC: requested.currentTempC ?? requested.hwmon_temp ?? 55,
        cpuTempC: requested.cpuTempC,
        gpuTempC: requested.gpuTempC,
        workload: amul ? "amul_topology" : requested.workload,
        amulDensify: amul,
      },
      {
        amdLegacy: true,
        profile: AMD_LEGACY_PROFILE,
        workload: amul ? "amul_topology" : requested.workload,
      },
    );
    hopLimit = Math.min(hopLimit, thermal.hopLimit);
  }

  const result = {
    ok: true,
    code: "TUNER_ANALOG_BOUND",
    assistOnly: true,
    authority: "assist",
    nonAuthoritative: true,
    pixelsProduced: false,
    firmware_write: false,
    mayProduceBeauty: false,
    status: profile.amd_legacy ? "partial" : "declared",
    profile,
    hopLimit,
    thermal,
    note: profile.amd_legacy
      ? "AMD legacy eco_conservative (FX-8350 + RX 580). In-memory only — no MSR/efivarfs/ROCm."
      : "In-memory analog only. Does not flash BIOS or write efivarfs.",
    voss,
  };

  // PARTIAL AMUL silhouette densify — meta hash chain, no pixels
  if (requested.amul_topology === true || requested.topology_densify === true) {
    const densify = applyAmulTopologyDensify({
      quads: requested.quads,
      prev_hash: requested.prev_hash,
      source: requested.source,
      firmware_write: false,
      mayProduceBeauty: false,
      printSoT: false,
    });
    result.amul = densify;
    result.code = densify.ok ? "TUNER_AMUL_PARTIAL" : densify.code;
    if (!densify.ok) {
      result.ok = false;
    }

    // Replay logs: topology_hash / payload_hash / isa_bridge_ops enforced (v2.2 counter path)
    const density = requested.density === "base" ? "base" : "amul";
    const mesh = buildQuadHumanoid({
      species: requested.species === "human" ? "human" : "anthro",
      density,
      amulUniversal: true,
    });
    const materialKey =
      requested.material_key ||
      mesh.materialKeyHint ||
      (requested.species === "human" ? "skin.humanoid" : "fur.fox");
    result.replay = buildReplayLogs({
      mesh,
      materialKey,
      densify: densify.densify || densify,
      voss,
      thermal,
      intentId: requested.intentId || null,
      mode: "silicon-tuner",
    });
    result.mesh = {
      density,
      quads: mesh.faceCount,
      verts: mesh.vertexCount,
      topology_hash: result.replay.topology_hash,
      status: "partial",
    };
  }

  if (requested.replay_parity === true || requested.verifyReplayParity === true) {
    result.replayParity = verifySilhouetteReplayParity({
      density: requested.density === "base" ? "base" : "amul",
      densify: result.amul?.densify || null,
      voss,
      thermal,
      intentId: requested.intentId || "replay-parity",
      foxMaterialKey: requested.foxMaterialKey || "fur.fox",
      humanMaterialKey: requested.humanMaterialKey || "skin.humanoid",
    });
    if (!result.replayParity.ok) result.ok = false;
  }

  return result;
}

export const TUNER_CAPABILITY_ID = "bios.silicon.tuner";

/**
 * Router-facing handler — same contract as other Sovereign X assist lanes.
 */
export async function handleSiliconTunerLane(request = {}) {
  const {
    intentId,
    workloadClass = "balanced",
    recommendedPlacement = "cpu",
  } = request;

  if (!intentId) {
    return {
      ok: false,
      code: "GOVERNANCE_INTENT_REQUIRED",
      message: "intentId required for silicon tuner analog",
      assistOnly: true,
      capabilityId: TUNER_CAPABILITY_ID,
      pixelsProduced: false,
      firmware_write: false,
      workloadClass,
      recommendedPlacement,
    };
  }

  if (request.determinismRequired === true || request.asPrintSoT === true) {
    return {
      ok: false,
      code: "TUNER_PRINT_SOT_DENIED",
      message:
        "Silicon tuner analog cannot satisfy print SoT or determinismRequired — use cpu.rt4d.print",
      assistOnly: true,
      authority: "assist",
      nonAuthoritative: true,
      capabilityId: TUNER_CAPABILITY_ID,
      pixelsProduced: false,
      firmware_write: false,
      workloadClass,
      recommendedPlacement,
    };
  }

  const analog = applySiliconTunerAnalog(request.payload || request.profile || request);
  return {
    ...analog,
    capabilityId: TUNER_CAPABILITY_ID,
    mode: "silicon-tuner",
    provenanceKind: "vossBindingDeclared",
    audit: { intentId, lane: TUNER_CAPABILITY_ID, op: "silicon-tuner" },
    workloadClass,
    recommendedPlacement,
  };
}
