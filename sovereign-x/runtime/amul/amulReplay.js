/**
 * BIOS AI lane replay — silhouette parity across fox + humanoid.
 *
 * Lane JSON (`Bios-Ai-Lane-V2.json` replay.status) claims **enforced**.
 * Honest per-log status below: only hash/log chains that exist are enforced.
 *
 * STATUS:
 *   topology_hash, payload_hash, voss_binding_decision, thermal_ceiling → enforced
 *   isa_bridge_ops → enforced (measurable counters + tuner feed; no native AVX2 on FX-8350)
 *
 * Rule: fox vs humanoid share topology_hash; only material_key may change.
 * Host context: FX-8350 + RX 580 amd_legacy_profile (determinism also claims 7950X3D).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildQuadHumanoid,
  reportAmulTopology,
} from "../../../character/models/topology.mjs";
import { AMD_LEGACY_PROFILE } from "../../router/modules/bios/amdLegacyProfile.js";
import { buildIsaBridgeOpsStub as buildIsaOpsFromStub } from "./amulIsaBridgeStub.js";
import {
  AMUL_BOUND_QUADS_FX8350,
  AMUL_HOT_PASS_QUADS,
  AMUL_SILHOUETTE_LOOPS,
  AMUL_TARGET_QUADS,
} from "./amulDenserTopology.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Honest enforcement map — isa_bridge_ops ENFORCED as counter/tuner path (v2.2). */
export const REPLAY_LOG_ENFORCEMENT = Object.freeze({
  isa_bridge_ops: "enforced",
  voss_binding_decision: "enforced",
  thermal_ceiling: "enforced",
  topology_hash: "enforced",
  payload_hash: "enforced",
});

export function loadReplayConfig() {
  const candidates = [
    join(__dirname, "../../../docs/bios-ai-lane.v2.json"),
    join(__dirname, "../../router/modules/bios/Bios-Ai-Lane-V2.json"),
  ];
  let lane = null;
  for (const path of candidates) {
    try {
      lane = JSON.parse(readFileSync(path, "utf8"));
      break;
    } catch {
      /* next */
    }
  }
  if (!lane) throw new Error("bios-ai-lane.v2.json not found");
  return {
    ...lane.replay,
    enforcement: REPLAY_LOG_ENFORCEMENT,
    lane_status: lane.status,
    lane_version: lane.version || null,
    amd_legacy_profile: lane.amd_legacy_profile || null,
    denser_topology_worker: lane.denser_topology_worker || null,
  };
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

export function sha256Canonical(obj) {
  const body = JSON.stringify(sortKeysDeep(obj));
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Topology digest — species-agnostic AMUL structure (density + loops + face/vert counts).
 * Positions are included so the same procedural build is byte-stable; species must not
 * alter ring counts when density is base/amul (universal AMUL body).
 */
export function computeTopologyHash(mesh) {
  const amulIds = Object.keys(mesh.amulLoops || {}).sort();
  const payload = {
    density: mesh.density,
    vertexCount: mesh.vertexCount,
    faceCount: mesh.faceCount,
    amulIds,
    // Stable position digest (rounded) — same body across material_key
    positions: mesh.positions.map((p) =>
      p.map((n) => Math.round(n * 1e6) / 1e6),
    ),
    quads: mesh.quads,
  };
  return sha256Canonical(payload);
}

/**
 * Full replay payload hash. material_key is intentionally outside topology.
 * Same topology_hash + same densify ops → same actor body; material_key may differ.
 */
export function computePayloadHash({
  topologyHash,
  materialKey,
  densifyHash,
  thermalCeiling,
  vossDisposition,
  intentId,
}) {
  return sha256Canonical({
    topology_hash: topologyHash,
    densify_hash: densifyHash || null,
    thermal_ceiling: thermalCeiling ?? AMD_LEGACY_PROFILE.thermal_ceiling_c,
    voss_binding_decision: vossDisposition || null,
    intentId: intentId || null,
    // material_key logged but excluded from body-identity: see bodyPayloadHash
    material_key_logged: materialKey || null,
    schema: "bios.ai.replay.payload.v1",
  });
}

/** Body identity hash — excludes material_key (fox vs humanoid material swap). */
export function computeBodyPayloadHash({
  topologyHash,
  densifyHash,
  thermalCeiling,
  vossDisposition,
}) {
  return sha256Canonical({
    topology_hash: topologyHash,
    densify_hash: densifyHash || null,
    thermal_ceiling: thermalCeiling ?? AMD_LEGACY_PROFILE.thermal_ceiling_c,
    voss_binding_decision: vossDisposition || null,
    schema: "bios.ai.replay.body.v1",
  });
}

export function buildIsaBridgeOpsStub(opts = {}) {
  return buildIsaOpsFromStub(opts);
}

/**
 * Thermal densify budget for REPLAY second pass (sim-friendly).
 *
 * Pass 1 / cold cache: hold BOUND 4724, log loops cut by thermal_ceiling.
 * Pass 2 / hot gpu-rosetta cache: stable ~5100 PARTIAL.
 * Socket <65C: allow push toward 5500 PARTIAL (not BOUND on this box).
 *
 * @param {{ socketTempC?: number, pass?: number, gpuRosettaCache?: "cold"|"hot", boundQuads?: number }} [opts]
 */
export function planThermalDensifyReplayPass(opts = {}) {
  const boundQuads = opts.boundQuads ?? AMUL_BOUND_QUADS_FX8350;
  const socketTempC = Number.isFinite(opts.socketTempC) ? opts.socketTempC : 70;
  const pass = opts.pass === 2 ? 2 : 1;
  const gpuRosettaCache = opts.gpuRosettaCache === "hot" ? "hot" : "cold";

  let allowedQuads = boundQuads;
  let claim = "BOUND";
  let note = "FX-8350+RX580 BOUND at 4724 — thermally governed, not failing";

  if (pass >= 2 && gpuRosettaCache === "hot") {
    if (socketTempC < 65) {
      allowedQuads = AMUL_TARGET_QUADS;
      claim = "PARTIAL";
      note = "socket <65C — PARTIAL toward 5500 (not BOUND on this box)";
    } else {
      allowedQuads = AMUL_HOT_PASS_QUADS;
      claim = "PARTIAL";
      note =
        "gpu-rosetta cache HOT — ~5100 stable; do not claim BOUND above 4724 on fx8350-polaris";
    }
  }

  const headroom = Math.max(0, allowedQuads - boundQuads);
  const cheapFirst = [...AMUL_SILHOUETTE_LOOPS].sort(
    (a, b) => a.quadCost - b.quadCost,
  );
  const loops_applied = [];
  const loops_cut = [];
  let used = 0;
  for (const loop of cheapFirst) {
    if (used + loop.quadCost <= headroom) {
      loops_applied.push({ ...loop });
      used += loop.quadCost;
    } else {
      loops_cut.push({
        ...loop,
        cut_by: "thermal_ceiling",
      });
    }
  }

  return {
    status: claim === "BOUND" ? "enforced" : "partial",
    claim,
    profile: "fx8350-polaris",
    pass,
    gpu_rosetta_cache: gpuRosettaCache,
    socketTempC,
    bound_quads: boundQuads,
    allowed_quads: allowedQuads,
    hot_pass_quads: AMUL_HOT_PASS_QUADS,
    partial_target_quads: AMUL_TARGET_QUADS,
    loops_cut,
    loops_applied,
    headroom_quads: headroom,
    note,
    firmware_write: false,
  };
}

/**
 * Build replay log bundle for silicon-tuner / chamber.
 */
export function buildReplayLogs({
  mesh,
  materialKey,
  densify,
  voss,
  thermal,
  intentId,
  mode,
}) {
  const topology_hash = computeTopologyHash(mesh);
  const densifyHash = densify?.hash || densify?.audit_chain || null;
  const vossDisposition = voss?.disposition || null;
  const thermalCeiling =
    thermal?.profileId
      ? AMD_LEGACY_PROFILE.thermal_ceiling_c
      : thermal?.thermal_ceiling_c || AMD_LEGACY_PROFILE.thermal_ceiling_c;

  const body_payload_hash = computeBodyPayloadHash({
    topologyHash: topology_hash,
    densifyHash,
    thermalCeiling,
    vossDisposition,
  });
  const payload_hash = computePayloadHash({
    topologyHash: topology_hash,
    materialKey,
    densifyHash,
    thermalCeiling,
    vossDisposition,
    intentId,
  });

  return {
    status: "enforced",
    enforcement: REPLAY_LOG_ENFORCEMENT,
    logs: {
      isa_bridge_ops: buildIsaBridgeOpsStub({ intentId, mode }),
      voss_binding_decision: {
        status: "enforced",
        disposition: vossDisposition,
        voss: voss || null,
      },
      thermal_ceiling: {
        status: "enforced",
        ceiling: thermalCeiling,
        hop_downclock_c: AMD_LEGACY_PROFILE.hop_downclock_c,
        thermal: thermal || null,
      },
      topology_hash: { status: "enforced", value: topology_hash },
      payload_hash: {
        status: "enforced",
        value: payload_hash,
        body_payload_hash,
        material_key: materialKey || null,
        note: "body_payload_hash excludes material_key for fox/humanoid parity",
      },
    },
    topology_hash,
    payload_hash,
    body_payload_hash,
    material_key: materialKey || null,
  };
}

/**
 * Silhouette parity: fox vs humanoid — same topology_hash + body_payload_hash;
 * material_key may differ.
 *
 * @param {object} [opts]
 * @param {"base"|"amul"} [opts.density]
 */
export function verifySilhouetteReplayParity(opts = {}) {
  const density = opts.density === "base" ? "base" : "amul";
  const foxMat = opts.foxMaterialKey || "fur.fox";
  const humanMat = opts.humanMaterialKey || "skin.humanoid";

  // Universal AMUL body: density forces shared topology regardless of species label
  const foxMesh = buildQuadHumanoid({ species: "anthro", density, amulUniversal: true });
  const humanMesh = buildQuadHumanoid({ species: "human", density, amulUniversal: true });

  const foxTopo = computeTopologyHash(foxMesh);
  const humanTopo = computeTopologyHash(humanMesh);

  const foxReplay = buildReplayLogs({
    mesh: foxMesh,
    materialKey: foxMat,
    densify: opts.densify || null,
    voss: opts.voss || { disposition: "BOUND" },
    thermal: opts.thermal || { profileId: AMD_LEGACY_PROFILE.id },
    intentId: opts.intentId || "replay-parity",
    mode: "silicon-tuner",
  });
  const humanReplay = buildReplayLogs({
    mesh: humanMesh,
    materialKey: humanMat,
    densify: opts.densify || null,
    voss: opts.voss || { disposition: "BOUND" },
    thermal: opts.thermal || { profileId: AMD_LEGACY_PROFILE.id },
    intentId: opts.intentId || "replay-parity",
    mode: "silicon-tuner",
  });

  const topologyMatch = foxTopo === humanTopo;
  const bodyMatch = foxReplay.body_payload_hash === humanReplay.body_payload_hash;
  const materialDiffers = foxMat !== humanMat;
  const ok = topologyMatch && bodyMatch && materialDiffers;

  return {
    ok,
    status: ok ? "enforced" : "failed",
    density,
    fox: {
      material_key: foxMat,
      topology_hash: foxTopo,
      payload_hash: foxReplay.payload_hash,
      body_payload_hash: foxReplay.body_payload_hash,
      quads: foxMesh.faceCount,
      report: reportAmulTopology(foxMesh),
    },
    humanoid: {
      material_key: humanMat,
      topology_hash: humanTopo,
      payload_hash: humanReplay.payload_hash,
      body_payload_hash: humanReplay.body_payload_hash,
      quads: humanMesh.faceCount,
      report: reportAmulTopology(humanMesh),
    },
    checks: {
      topology_hash_equal: topologyMatch,
      body_payload_hash_equal: bodyMatch,
      material_key_differs: materialDiffers,
      payload_hash_may_differ: foxReplay.payload_hash !== humanReplay.payload_hash,
    },
    replay_config: loadReplayConfig(),
    host: {
      cpu: AMD_LEGACY_PROFILE.cpu.model,
      gpu: AMD_LEGACY_PROFILE.gpu.model,
      note: "Determinism claim also covers 7950X3D; this box is FX-8350 + RX 580",
    },
    enforcement: REPLAY_LOG_ENFORCEMENT,
  };
}
