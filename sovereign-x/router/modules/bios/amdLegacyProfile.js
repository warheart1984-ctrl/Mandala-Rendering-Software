/**
 * AMD-only host profile for this box — FX-8350 + RX 580 (Polaris).
 *
 * STATUS: partial — assist telemetry / CPO bounds only.
 * No MSR write, no efivarfs, no ROCm, no invented NPU tops.
 * R9 380 / Tonga is NOT installed; do not use Tonga assumptions.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Confirmed workspace hardware — do not invent alternate GPUs. */
export const AMD_LEGACY_PROFILE = Object.freeze({
  id: "amd_legacy_profile",
  status: "partial",
  vendor: "amd",
  cpu: {
    model: "FX-8350",
    family: "Fam15h",
    sensors: ["k10temp", "fam15h_power"],
    tdp_w: 125,
    msr_write: false,
    year_class: 2012,
  },
  gpu: {
    model: "RX 580",
    arch: "Polaris",
    sensors: ["amdgpu"],
    year_class: 2017,
    rocm: false,
    hip: false,
    compute: "vulkan",
    note: "Vulkan compute only. ROCm/HIP disabled/unavailable. Not Vega; R9 380/Tonga not installed.",
  },
  npu_boost_class: "none",
  npuTops: 0,
  // v2.2-fx8350-polaris SoT (docs/bios-ai-lane.v2.json) — socket 70 / junction 80 / VRM 85
  thermal_ceiling_c: Object.freeze({ cpu: 70, gpu_junction: 80, vrm: 85 }),
  hop_downclock_c: 68,
  cool_push_c: 65,
  tuner_mode: "eco_conservative",
  pbn_grid_size: Object.freeze({ thermal: 32, isa_fault_eco: 40, deep_eco: 48, critical: 16 }),
  profile_alias: "fx8350-polaris",
  bound_quads: 4724,
  partial_quads: 5500,
  forbidden: Object.freeze([
    "firmware_write",
    "efivarfs_write",
    "msr_write",
    "beauty_print",
  ]),
});

/**
 * Load amd_legacy_profile from Bios-Ai-Lane-V2.json when present,
 * else fall back to the confirmed in-code profile.
 */
export function loadAmdLegacyProfileFromLaneV2() {
  try {
    const path = join(__dirname, "Bios-Ai-Lane-V2.json");
    const lane = JSON.parse(readFileSync(path, "utf8"));
    if (lane.amd_legacy_profile && typeof lane.amd_legacy_profile === "object") {
      return { ...AMD_LEGACY_PROFILE, ...normalizeLaneAmdBlock(lane.amd_legacy_profile) };
    }
  } catch {
    /* lane file optional at import time */
  }
  return AMD_LEGACY_PROFILE;
}

function normalizeLaneAmdBlock(raw) {
  return {
    summary: {
      cpu: raw.cpu,
      gpu: raw.gpu,
      npu_boost_class: raw.npu_boost_class,
      thermal_ceiling: raw.thermal_ceiling,
      tuner_mode: raw.tuner_mode,
      pbn_grid_size: raw.pbn_grid_size,
    },
    npu_boost_class: raw.npu_boost_class === "none" ? "none" : AMD_LEGACY_PROFILE.npu_boost_class,
    tuner_mode:
      raw.tuner_mode === "eco_conservative"
        ? "eco_conservative"
        : AMD_LEGACY_PROFILE.tuner_mode,
  };
}

/**
 * True when platformInfo declares this AMD box (or defaults to this workspace profile).
 */
export function isAmdLegacyHost(platformInfo = {}) {
  if (platformInfo.amdLegacy === true || platformInfo.amd_legacy_profile === true) {
    return true;
  }
  if (platformInfo.profileId === "amd_legacy_profile") return true;
  const cpu = String(platformInfo.cpuModel || platformInfo.cpu || "").toLowerCase();
  const gpu = String(platformInfo.gpuModel || platformInfo.gpu || "").toLowerCase();
  if (/fx-?8350|fam15h/.test(cpu) && /rx\s*580|polaris/.test(gpu)) return true;
  // Explicit opt-out
  if (platformInfo.amdLegacy === false) return false;
  return false;
}

/**
 * Caps descriptor for bios.ai.npu on this AMD box — no fake NPU.
 */
export function amdLegacyCaps(platformInfo = {}) {
  const profile = loadAmdLegacyProfileFromLaneV2();
  return {
    capabilityId: "bios.ai.npu",
    vendor: "amd",
    backend: "cpu+vulkan",
    npuTops: 0,
    npu_boost_class: "none",
    biosAiVersion: platformInfo.biosAiVersion ?? "amd-legacy-partial",
    thermalModel: "amd_legacy_fx8350_rx580",
    powerModel: "fam15h_125w_tdp",
    status: "partial",
    assistOnly: true,
    amdLegacy: true,
    profile,
    rocm: false,
    hip: false,
    compute: "vulkan",
    bans: ["printSoT", "beautyPixels", "digitalPrinterEvidence", "firmware_write", "efivarfs_write", "msr_write"],
    canDo: [
      "hashPayload",
      "verifyHop",
      "pbnGridQuantization",
      "capabilityCheck",
      "fanThermalPrediction",
      "vossBinding",
      "siliconTunerAnalog",
      "amulTopologyDensify",
    ],
  };
}

/**
 * PBN grid size for this box: 32 under thermal pressure, 16 at critical.
 */
export function pbnGridSizeForTemps(cpuTempC, gpuTempC, profile = AMD_LEGACY_PROFILE) {
  const ceilCpu = profile.thermal_ceiling_c.cpu;
  const ceilGpu = profile.thermal_ceiling_c.gpu_junction;
  const critical =
    (Number.isFinite(cpuTempC) && cpuTempC >= ceilCpu) ||
    (Number.isFinite(gpuTempC) && gpuTempC >= ceilGpu);
  return critical ? profile.pbn_grid_size.critical : profile.pbn_grid_size.thermal;
}

/**
 * FX-8350 + RX 580 eco_conservative thermal curve (v2.2-fx8350-polaris).
 *
 * - Ceiling 70C CPU socket / 80C GPU junction / 85C VRM
 * - Eco hop break at 68C socket
 * - Cool push toward PARTIAL 5500 only when socket <65C
 * - AMUL silhouette densify is CPU meta (no pixels) — must NOT spuriously
 *   throttle from npuTops=0 or densify quad count
 * - No MSR / efivarfs side effects
 *
 * @returns {{ hopLimit: number, throttleRisk: "none"|"low"|"high", reason: string, throttleScore: number, pbnGridSize: number, profileId: string }}
 */
export function predictAmdLegacyThermalCpo(thermalTelemetry = {}, caps = {}) {
  const profile = caps.profile || AMD_LEGACY_PROFILE;
  const ceilingCpu = profile.thermal_ceiling_c?.cpu ?? 70;
  const ceilingGpu = profile.thermal_ceiling_c?.gpu_junction ?? 80;
  const downclockAt = profile.hop_downclock_c ?? 68;
  const coolPushAt = profile.cool_push_c ?? 65;
  const cpuTemp =
    thermalTelemetry.cpuTempC ??
    thermalTelemetry.currentTempC ??
    45;
  const gpuTemp =
    thermalTelemetry.gpuTempC ??
    thermalTelemetry.gpuJunctionC ??
    cpuTemp;
  const workload = String(
    thermalTelemetry.workload ||
      caps.workload ||
      thermalTelemetry.context_profile ||
      "",
  );
  const amulMeta =
    workload === "amul_topology" ||
    workload === "topology_densify" ||
    workload === "silicon-tuner-amul" ||
    thermalTelemetry.amulDensify === true;

  const hot = Math.max(cpuTemp, gpuTemp);
  const ceiling = Math.min(ceilingCpu, ceilingGpu);
  const throttleScore = Number((hot / ceilingGpu).toFixed(3));
  const pbnGridSize = pbnGridSizeForTemps(cpuTemp, gpuTemp, profile);

  const ecoNominalHop = profile.tuner_mode === "eco_conservative" ? 6 : 8;

  let hopLimit = ecoNominalHop;
  let throttleRisk = "none";
  let reason = amulMeta
    ? "amul_densify_meta_nominal_eco"
    : "amd_legacy_eco_nominal";

  if (cpuTemp >= ceilingCpu || gpuTemp >= ceilingGpu) {
    hopLimit = 2;
    throttleRisk = "high";
    reason = "thermal_ceiling_70c_socket_or_80c_junction";
  } else if (cpuTemp >= downclockAt) {
    hopLimit = amulMeta ? 4 : 3;
    throttleRisk = "low";
    reason = "hop_eco_break_68c_socket";
  } else if (amulMeta) {
    hopLimit = ecoNominalHop;
    throttleRisk = "none";
    reason =
      cpuTemp < coolPushAt
        ? "amul_densify_cool_push_under_65c"
        : "amul_densify_eco_conservative_pass";
  }

  return {
    hopLimit,
    throttleRisk,
    reason,
    throttleScore,
    pbnGridSize,
    profileId: profile.id,
    profileAlias: profile.profile_alias || "fx8350-polaris",
    boundQuads: profile.bound_quads ?? 4724,
    partialQuads: profile.partial_quads ?? 5500,
    cpuTempC: cpuTemp,
    gpuTempC: gpuTemp,
    npu_boost_class: "none",
    rocm: false,
    firmware_write: false,
  };
}
