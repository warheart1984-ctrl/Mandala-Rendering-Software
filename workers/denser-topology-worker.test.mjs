/**
 * FX-8350 + RX 580 denser / tuner lane tests (v2.2-fx8350-polaris).
 * BOUND green at 4724 — not FAIL vs 5500.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DenserTopologyWorker,
  detectProfile,
  loadTargets,
} from "./denser-topology-worker.mjs";
import { SiliconTunerAnalog } from "./silicon-tuner-analog.mjs";
import {
  applyIsaFaultEcoThrottle,
  buildIsaBridgeOpsStub,
} from "../sovereign-x/runtime/amul/amulIsaBridgeStub.js";
import {
  resolveBlendshapesForPolaris,
  AMUL_BOUND_QUADS_FX8350,
} from "../sovereign-x/runtime/amul/amulDenserTopology.js";
import {
  planThermalDensifyReplayPass,
  verifySilhouetteReplayParity,
} from "../sovereign-x/runtime/amul/amulReplay.js";
import { buildQuadHumanoid } from "../character/models/topology.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LANE = resolve(__dirname, "../docs/bios-ai-lane.v2.json");

describe("docs/bios-ai-lane.v2.json fx8350-polaris", () => {
  it("SoT version + quad_targets BOUND 4724 / PARTIAL 5500", () => {
    const lane = JSON.parse(readFileSync(LANE, "utf8"));
    assert.equal(lane.version, "v2.2-fx8350-polaris");
    assert.equal(lane.denser_topology_worker.status, "PARTIAL_GOVERNED");
    assert.equal(lane.denser_topology_worker.quad_targets["fx8350-polaris"].BOUND, 4724);
    assert.equal(lane.denser_topology_worker.quad_targets["fx8350-polaris"].PARTIAL, 5500);
    assert.equal(lane.denser_topology_worker.quad_targets["modern-silicon"].BOUND, 5500);
    assert.equal(lane.isa_bridge_ops.status, "ENFORCED");
    assert.equal(lane.gpu_rosetta_polaris.status, "PARTIAL");
    assert.equal(lane.gpu_rosetta_polaris.blendshapes.separate_gcn_kernels, false);
    assert.equal(lane.governance.thermal_ceiling.cpu_socket_c, 70);
    assert.equal(lane.governance.thermal_ceiling.gpu_junction_c, 80);
  });
});

describe("DenserTopologyWorker fx8350-polaris", () => {
  it("detectProfile honors SILICON_PROFILE env", () => {
    assert.equal(detectProfile({ SILICON_PROFILE: "fx8350-polaris" }), "fx8350-polaris");
    assert.equal(detectProfile({ SILICON_PROFILE: "modern-silicon" }), "modern-silicon");
  });

  it("loadTargets matches lane SoT", () => {
    const t = loadTargets(LANE);
    assert.equal(t["fx8350-polaris"].BOUND, 4724);
    assert.equal(t["modern-silicon"].BOUND, 5500);
  });

  it("GREEN BOUND at mesh 4724 on fx8350-polaris (not FAIL vs 5500)", () => {
    const worker = new DenserTopologyWorker({
      profile: "fx8350-polaris",
      lanePath: LANE,
      silent: true,
    });
    const mesh = buildQuadHumanoid({ density: "amul", amulUniversal: true });
    assert.equal(mesh.faceCount, AMUL_BOUND_QUADS_FX8350);
    const state = worker.setCurrentQuads(mesh.faceCount);
    assert.equal(state, "BOUND");
    assert.ok(worker.currentQuads < worker.targets["fx8350-polaris"].PARTIAL);
  });

  it("ISA fault >100/s drops 1 hop and sets pbn_grid_size 40", () => {
    const worker = new DenserTopologyWorker({
      profile: "fx8350-polaris",
      lanePath: LANE,
      silent: true,
    });
    worker.isaBridgeOps.emulation_faults_per_sec = 120;
    worker.thermal = { cpu_socket_c: 55, gpu_junction_c: 60 };
    worker.densify(3080, 4, 32);
    assert.equal(worker.lastHopLimit, 3);
    assert.equal(worker.lastPbnGridSize, 40);
    assert.ok(worker.lastReplayLog);
  });

  it("blendshape bake recovers +250 when GCN fallbacks spike", () => {
    const worker = new DenserTopologyWorker({
      profile: "fx8350-polaris",
      lanePath: LANE,
      silent: true,
    });
    worker.gpuRosettaOps.gcn_fallback_count = 51;
    worker.gpuRosettaOps.blendshapes_baked = false;
    worker.thermal = { cpu_socket_c: 50, gpu_junction_c: 55 };
    const quads = worker.densify(3080, 0, 32);
    assert.equal(worker.gpuRosettaOps.blendshapes_baked, true);
    assert.equal(quads, 3330);
  });

  it("modern-silicon still requires 5500 for BOUND", () => {
    const worker = new DenserTopologyWorker({
      profile: "modern-silicon",
      lanePath: LANE,
      silent: true,
    });
    assert.equal(worker.setCurrentQuads(4724), "PARTIAL");
    assert.equal(worker.setCurrentQuads(5500), "BOUND");
  });
});

describe("SiliconTunerAnalog + ISA eco throttle", () => {
  it("applyIsaFaultEcoThrottle fires at >100/s → hop-1, grid 40", () => {
    const eco = applyIsaFaultEcoThrottle({
      hopLimit: 6,
      pbnGridSize: 32,
      isaBridgeOps: buildIsaBridgeOpsStub({ fault_rate_per_sec: 101 }),
    });
    assert.equal(eco.isaFaultThrottle, true);
    assert.equal(eco.hopLimit, 5);
    assert.equal(eco.pbnGridSize, 40);
    assert.equal(eco.topology_hash_stable, true);
  });

  it("tuner switches path on ISA spike; does not force 5500 when hot", () => {
    const tuner = new SiliconTunerAnalog("fx8350-polaris", {
      silent: true,
      readK10Temp: () => 71,
      readAmdgpuJunction: () => 72,
    });
    const isa = {
      emulation_faults_per_sec: 150,
      fallback_scalar_count: 10,
      translation_path: "AVX",
      vpermd_emulated: 0,
    };
    const gpu = {
      translation_cache_hit: 90,
      gcn_fallback_count: 0,
      blendshapes_baked: true,
      spirv_features_emulated: [],
    };
    const state = tuner.tune(isa, gpu, 4724, 4724);
    assert.equal(isa.translation_path, "SSE_SCALAR");
    assert.equal(state.pbn_grid_size, 40);
    assert.equal(state.voss, "PARTIAL");
    assert.ok(state.hop_limit <= 3);
  });

  it("tuner BOUND when cool and quads >= profile BOUND", () => {
    const tuner = new SiliconTunerAnalog("fx8350-polaris", {
      silent: true,
      readK10Temp: () => 58,
      readAmdgpuJunction: () => 60,
    });
    const isa = {
      emulation_faults_per_sec: 5,
      fallback_scalar_count: 0,
      translation_path: "XOP",
      vpermd_emulated: 0,
    };
    const gpu = {
      translation_cache_hit: 95,
      gcn_fallback_count: 0,
      blendshapes_baked: true,
      spirv_features_emulated: [],
    };
    const state = tuner.tune(isa, gpu, 4724, 4724);
    assert.equal(state.voss, "BOUND");
    assert.equal(state.pbn_grid_size, 32);
  });
});

describe("Polaris blendshapes + REPLAY thermal pass", () => {
  it("resolveBlendshapesForPolaris never claims separate GCN kernels", () => {
    const baked = resolveBlendshapesForPolaris({ mode: "int8", species: "anthro" });
    assert.equal(baked.separate_gcn_kernels, false);
    assert.equal(baked.status, "partial");
    assert.ok(baked.deltas.fox_snout instanceof Int8Array);
  });

  it("pass1 cold: BOUND 4724 with thermal-cut loops logged", () => {
    const plan = planThermalDensifyReplayPass({
      pass: 1,
      gpuRosettaCache: "cold",
      socketTempC: 70,
    });
    assert.equal(plan.claim, "BOUND");
    assert.equal(plan.allowed_quads, 4724);
    assert.ok(plan.loops_cut.length > 0);
    assert.equal(plan.loops_cut[0].cut_by, "thermal_ceiling");
  });

  it("pass2 hot cache: ~5100 PARTIAL; <65C allows 5500 PARTIAL", () => {
    const hot = planThermalDensifyReplayPass({
      pass: 2,
      gpuRosettaCache: "hot",
      socketTempC: 68,
    });
    assert.equal(hot.claim, "PARTIAL");
    assert.equal(hot.allowed_quads, 5100);
    const cool = planThermalDensifyReplayPass({
      pass: 2,
      gpuRosettaCache: "hot",
      socketTempC: 60,
    });
    assert.equal(cool.allowed_quads, 5500);
    assert.equal(cool.claim, "PARTIAL");
  });

  it("fox↔humanoid topology/body hash parity preserved", () => {
    const parity = verifySilhouetteReplayParity({ density: "amul" });
    assert.equal(parity.ok, true);
    assert.equal(parity.checks.topology_hash_equal, true);
    assert.equal(parity.checks.body_payload_hash_equal, true);
    assert.equal(parity.enforcement.isa_bridge_ops, "enforced");
    assert.equal(parity.fox.quads, 4724);
  });
});
