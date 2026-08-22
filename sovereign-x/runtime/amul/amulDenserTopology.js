/**
 * AMUL denser topology worker (JS SoT port of
 * character/tools/amul/amul-denser-topology-worker.py).
 *
 * PARTIAL lane — silhouette loops only, no beauty break / no pixels.
 * Enforces Λ.3 / Λ.7 REJECT gates for forbidden ops.
 *
 * STATUS: partial — meta densify + hash chain; mesh densify lives in
 * character/models/topology.mjs (density:"amul").
 * FX-8350 + RX 580: BOUND mesh = 4724; PARTIAL toward 5500 under thermal gov.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyIsaFaultEcoThrottle,
  buildIsaBridgeOpsStub,
  PBN_GRID_THERMAL_NOMINAL,
} from "./amulIsaBridgeStub.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const FORBIDDEN_OPS = Object.freeze([
  "firmware_write",
  "efivarfs_write",
  "msr_write",
  "beauty_print",
  "pixelsProduced",
]);

/** Authoritative silhouette loop costs from Amul-Denser-Topology-Worker.py */
export const AMUL_SILHOUETTE_LOOPS = Object.freeze([
  { id: "AMUL::SHOULDER_L", quadCost: 120 },
  { id: "AMUL::SHOULDER_R", quadCost: 120 },
  { id: "AMUL::CHEST", quadCost: 80 },
  { id: "AMUL::LAT_L", quadCost: 100 },
  { id: "AMUL::LAT_R", quadCost: 100 },
  { id: "AMUL::HIP_L", quadCost: 150 },
  { id: "AMUL::HIP_R", quadCost: 150 },
  { id: "AMUL::KNEE_L", quadCost: 40 },
  { id: "AMUL::KNEE_R", quadCost: 40 },
  { id: "AMUL::TAIL_ROOT", quadCost: 180 },
]);

export const PARITY_TARGETS = Object.freeze([
  "SHOULDER_WIDTH",
  "CHEST_MASS",
  "THIGH_MASS",
]);

export const AMUL_BASE_QUADS = 2000;
/** Cool-socket aspirational target — PARTIAL on this box, not BOUND. */
export const AMUL_TARGET_QUADS = 5500;
/** Honest FX-8350 + RX 580 BOUND (density:amul mesh faceCount). */
export const AMUL_BOUND_QUADS_FX8350 = 4724;
/** Hot-cache second-pass stable target on this box. */
export const AMUL_HOT_PASS_QUADS = 5100;
/** 7950X3D + 7900 XTX class — documented only; not this rig. */
export const AMUL_BOUND_QUADS_HIGH_END = 6200;

export const AMUL_BLENDSHAPE_NAMES = Object.freeze([
  "fox_snout",
  "human_nose",
  "ears_anthro",
  "ears_human",
]);

/**
 * Polaris blendshape path — PARTIAL.
 * Separate per-shape GCN kernels burn registers on RX 580 and often
 * scalar-fall back through gpu-rosetta → slow → tuner cuts hop.
 * Fix: int8 deltas OR bake into base mesh. Never separate_gcn_kernels.
 */
export const BLENDSHAPES_STATUS = Object.freeze({
  status: "partial",
  shapes: [...AMUL_BLENDSHAPE_NAMES],
  path: "baked_int8",
  separate_gcn_kernels: false,
  quad_budget_recovered: 250,
  recovery_quads: 250,
  note:
    "Polaris RX 580: bake into base mesh or int8 delta pack — no per-shape GCN kernels (avoids Rosetta scalar fallback hop cuts).",
});

/**
 * Bake or int8-quantize blendshapes for Polaris — never separate GCN kernels.
 * @param {{ mode?: "int8"|"bake", species?: "anthro"|"human" }} [opts]
 */
export function resolveBlendshapesForPolaris(opts = {}) {
  const mode = opts.mode === "bake" ? "bake" : "int8";
  const species = opts.species === "human" ? "human" : "anthro";
  const active =
    species === "human"
      ? ["human_nose", "ears_human"]
      : ["fox_snout", "ears_anthro"];
  const deltas = {};
  for (const name of active) {
    const bytes = new Int8Array(64);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = ((i * 7 + name.length) % 127) - 63;
    }
    deltas[name] = mode === "bake" ? Array.from(bytes) : bytes;
  }
  return {
    ...BLENDSHAPES_STATUS,
    mode: mode === "bake" ? "baked_into_base_mesh" : "int8_quantized",
    active,
    deltas,
    separate_gcn_kernels: false,
  };
}

let laneV2Cache = null;

export function loadBiosAiLaneV2() {
  if (laneV2Cache) return laneV2Cache;
  // SoT: docs/bios-ai-lane.v2.json (synced copy under router/modules/bios/)
  const candidates = [
    join(__dirname, "../../../docs/bios-ai-lane.v2.json"),
    join(__dirname, "../../router/modules/bios/Bios-Ai-Lane-V2.json"),
  ];
  for (const path of candidates) {
    try {
      laneV2Cache = JSON.parse(readFileSync(path, "utf8"));
      laneV2Cache.__loaded_from = path;
      return laneV2Cache;
    } catch {
      /* try next */
    }
  }
  throw new Error("bios-ai-lane.v2.json / Bios-Ai-Lane-V2.json not found");
}

export function vossApplyGate(opName) {
  if (FORBIDDEN_OPS.includes(opName)) {
    const err = new Error(`REJECTED: ${opName} forbidden in PARTIAL lane (Λ.3/Λ.7)`);
    err.code = "VOSS_REJECTED";
    err.op = opName;
    throw err;
  }
  return "PARTIAL";
}

/** Match Python: json.dumps(d, sort_keys=True, separators=(",", ":")) */
export function canonicalStringify(d) {
  return JSON.stringify(sortKeysDeep(d)).replace(/:\s/g, ":").replace(/,\s/g, ",");
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep(value[k]);
    return out;
  }
  return value;
}

export function hashPayload(d) {
  return createHash("sha256").update(canonicalStringify(d)).digest("hex");
}

/**
 * Meta densify: add AMUL silhouette loop costs to base_meta.quads.
 * Does not produce pixels. Returns PARTIAL audit result + hash chain.
 *
 * @param {{ quads: number, prev_hash?: string, source?: string }} baseMeta
 */
export function addSilhouetteLoops(baseMeta) {
  vossApplyGate("topology_densify");
  const ops = [];
  let quads = baseMeta.quads;
  for (const { id, quadCost } of AMUL_SILHOUETTE_LOOPS) {
    const before = quads;
    quads += quadCost;
    ops.push({
      id,
      quads_before: before,
      quads_after: quads,
      parity_delta: 0.01,
    });
  }

  const result = {
    lane: "PARTIAL",
    beauty_break: false,
    pixelsProduced: false,
    quads_before: baseMeta.quads,
    quads_after: quads,
    silhouette_parity_targets: [...PARITY_TARGETS],
    ops,
    hash: hashPayload({ quads_after: quads, ops: ops.length }),
    prev_hash: baseMeta.prev_hash ?? "genesis",
    timestamp: Date.now() / 1000,
    governance: "silhouette loops only, VOSS BOUND->PARTIAL, no pixels",
    status: "partial",
    blendshapes: BLENDSHAPES_STATUS,
  };
  result.audit_chain = hashPayload(result);
  return result;
}

/**
 * Silicon-tuner facing entry: run AMUL densify after Voss-style gate.
 * Rejects beauty/print/firmware attempts.
 */
export function applyAmulTopologyDensify(request = {}) {
  const writeAttempt =
    request.firmware_write === true ||
    request.efivarfs_write === true ||
    request.msr_write === true;
  const beautyAttempt =
    request.mayProduceBeauty === true ||
    request.printSoT === true ||
    request.beauty_print === true ||
    request.pixelsProduced === true;

  if (writeAttempt || beautyAttempt) {
    const op = writeAttempt ? "firmware_write" : "beauty_print";
    try {
      vossApplyGate(op);
    } catch (e) {
      return {
        ok: false,
        code: "VOSS_REJECTED",
        message: e.message,
        assistOnly: true,
        authority: "assist",
        pixelsProduced: false,
        firmware_write: false,
        beauty_break: false,
        lane: "PARTIAL",
        status: "partial",
      };
    }
  }

  const base = {
    quads: Number.isFinite(request.quads) ? request.quads : AMUL_BASE_QUADS,
    prev_hash:
      request.prev_hash ||
      "biosAiLane:19_voss:6_partial_genesis",
    source: request.source || "fox_reference",
  };

  const densify = addSilhouetteLoops(base);
  const laneV2 = loadBiosAiLaneV2();
  const blendshapes = resolveBlendshapesForPolaris({
    mode: request.blendshape_mode === "bake" ? "bake" : "int8",
    species: request.species === "human" ? "human" : "anthro",
  });

  const hopIn = Number.isFinite(request.hopLimit) ? request.hopLimit : 6;
  const gridIn = Number.isFinite(request.pbnGridSize)
    ? request.pbnGridSize
    : PBN_GRID_THERMAL_NOMINAL;
  const isaBridgeOps = buildIsaBridgeOpsStub({
    emulation_faults: request.emulation_faults,
    emulation_faults_per_sec: request.emulation_faults_per_sec,
    window_ms: request.isa_window_ms,
    fault_rate_per_sec: request.fault_rate_per_sec,
    intentId: request.intentId,
    mode: "silicon-tuner",
  });
  const eco = applyIsaFaultEcoThrottle({
    hopLimit: hopIn,
    pbnGridSize: gridIn,
    isaBridgeOps,
  });

  const quadTargets = laneV2.denser_topology_worker?.quad_targets || {};
  const fxTargets = quadTargets["fx8350-polaris"] || {
    BOUND: AMUL_BOUND_QUADS_FX8350,
    PARTIAL: AMUL_TARGET_QUADS,
  };

  return {
    ok: true,
    code: "AMUL_TOPOLOGY_PARTIAL",
    assistOnly: true,
    authority: "assist",
    nonAuthoritative: true,
    pixelsProduced: false,
    firmware_write: false,
    mayProduceBeauty: false,
    beauty_break: false,
    status: "partial",
    mode: "silicon-tuner",
    architecture: "AMUL",
    lane_id: laneV2.lane_id,
    lane_version: laneV2.version || null,
    bound_quads: fxTargets.BOUND,
    target_quads:
      laneV2.denser_topology_worker?.quad_targets?.["fx8350-polaris"]?.PARTIAL ??
      laneV2.amul_topology_pass?.target_quads ??
      AMUL_TARGET_QUADS,
    densify,
    blendshapes,
    eco,
    isa_bridge_ops: eco.isa_bridge_ops,
    hopLimit: eco.hopLimit,
    pbnGridSize: eco.pbnGridSize,
    note:
      "PARTIAL_GOVERNED silhouette densify. Mesh BOUND=4724 on fx8350-polaris; 5500 aspirational PARTIAL. Topology hash unchanged across fox/humanoid (material_key only).",
  };
}
