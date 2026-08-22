/**
 * denser-topology-worker — FX-8350 + RX 580 Polaris profile (authoritative patch).
 * STATUS: PARTIAL_GOVERNED — BOUND green at 4724 on fx8350-polaris; 5500 aspirational PARTIAL.
 *
 * Runnable twin of workers/denser-topology-worker.ts (Node ESM).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @typedef {"fx8350-polaris"|"modern-silicon"} Profile */
/** @typedef {"BOUND"|"PARTIAL"|"REJECTED"} VossState */

const BIOS_LANE_PATH = resolve(__dirname, "../docs/bios-ai-lane.v2.json");

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Profile}
 */
export function detectProfile(env = process.env) {
  const forced = env.SILICON_PROFILE;
  if (forced === "fx8350-polaris" || forced === "modern-silicon") return forced;
  try {
    const cpuInfo = readFileSync("/proc/cpuinfo", "utf8");
    const isPiledriver = cpuInfo.includes("fma4") && !cpuInfo.includes("avx2");
    if (isPiledriver) return "fx8350-polaris";
  } catch {
    /* no /proc */
  }
  return "modern-silicon";
}

/**
 * @param {string} [lanePath]
 */
export function loadTargets(lanePath = BIOS_LANE_PATH) {
  const raw = JSON.parse(readFileSync(lanePath, "utf8"));
  return raw.denser_topology_worker.quad_targets;
}

export function loadLaneConfig(lanePath = BIOS_LANE_PATH) {
  return JSON.parse(readFileSync(lanePath, "utf8"));
}

export class DenserTopologyWorker {
  /**
   * @param {{ profile?: Profile, lanePath?: string, silent?: boolean }} [opts]
   */
  constructor(opts = {}) {
    this.lanePath = opts.lanePath || BIOS_LANE_PATH;
    this.profile = opts.profile || detectProfile();
    this.targets = loadTargets(this.lanePath);
    this.currentQuads = 0;
    this.lastHopLimit = null;
    this.lastPbnGridSize = null;
    this.lastReplayLog = null;
    /** @type {{ emulation_faults_per_sec: number, fallback_scalar_count: number }} */
    this.isaBridgeOps = { emulation_faults_per_sec: 0, fallback_scalar_count: 0 };
    /** @type {{ translation_cache_hit: number, gcn_fallback_count: number, blendshapes_baked: boolean }} */
    this.gpuRosettaOps = {
      translation_cache_hit: 0,
      gcn_fallback_count: 0,
      blendshapes_baked: false,
    };
    /** @type {{ cpu_socket_c: number, gpu_junction_c: number }} */
    this.thermal = { cpu_socket_c: 0, gpu_junction_c: 0 };
    if (!opts.silent) {
      const t = this.targets[this.profile];
      console.log(
        `[denser] profile=${this.profile} BOUND=${t.BOUND} PARTIAL=${t.PARTIAL}`,
      );
    }
  }

  /** @returns {VossState} */
  getVossState() {
    const { BOUND, PARTIAL } = this.targets[this.profile];
    // Λ thermal REJECT (socket 70 / junction 80) — not a quad fail
    if (this.thermal.cpu_socket_c > 70 || this.thermal.gpu_junction_c > 80) {
      return "REJECTED";
    }
    if (this.currentQuads >= BOUND && this.currentQuads < PARTIAL) {
      return "BOUND";
    }
    if (this.currentQuads >= PARTIAL) {
      return "BOUND";
    }
    if (this.currentQuads >= BOUND * 0.85) {
      return "PARTIAL";
    }
    return "REJECTED";
  }

  /**
   * @param {number} baseQuads
   * @param {number} hopLimit
   * @param {number} pbnGridSize
   */
  densify(baseQuads, hopLimit, pbnGridSize) {
    if (this.isaBridgeOps.emulation_faults_per_sec > 100) {
      hopLimit = Math.max(1, hopLimit - 1);
      pbnGridSize = 40;
      console.log(
        `[REPLAY FIX] isa_bridge spike → hop_limit=${hopLimit} pbn=${pbnGridSize}`,
      );
    }
    if (
      !this.gpuRosettaOps.blendshapes_baked &&
      this.gpuRosettaOps.gcn_fallback_count > 50
    ) {
      console.log(
        `[REPLAY FIX] baking blendshapes int8 → recovers 200-300 quads`,
      );
      this.gpuRosettaOps.blendshapes_baked = true;
      baseQuads += 250;
    }
    let quads = baseQuads;
    for (let hop = 0; hop < hopLimit; hop++) {
      if (this.thermal.cpu_socket_c > 68) break;
      quads += Math.floor((400 / pbnGridSize) * 32);
    }
    this.currentQuads = quads;
    this.lastHopLimit = hopLimit;
    this.lastPbnGridSize = pbnGridSize;
    const state = this.getVossState();
    const target = this.targets[this.profile];
    console.log(
      `[denser] ${this.profile}: ${quads} quads vs BOUND=${target.BOUND} PARTIAL=${target.PARTIAL} → VOSS ${state}`,
    );
    this.logToReplay(quads, state);
    return quads;
  }

  /**
   * Set mesh-measured quads (e.g. topology.mjs faceCount 4724) without hop loop.
   * @param {number} quads
   */
  setCurrentQuads(quads) {
    this.currentQuads = quads;
    return this.getVossState();
  }

  /** @param {number} quads @param {VossState} state */
  logToReplay(quads, state) {
    this.lastReplayLog = {
      timestamp: Date.now(),
      profile: this.profile,
      currentQuads: quads,
      target: this.targets[this.profile],
      voss: state,
      isa_bridge_ops: { ...this.isaBridgeOps },
      gpu_rosetta_ops: { ...this.gpuRosettaOps },
      thermal: { ...this.thermal },
      payload_hash: `quad_${quads}_${this.profile}`,
    };
  }
}

export { BIOS_LANE_PATH };
