/**
 * silicon-tuner-analog — reads isa_bridge_ops + gpu_rosetta_ops + thermal.
 * STATUS: partial — assist-only; no firmware_write / efivarfs / MSR.
 *
 * Runnable twin of workers/silicon-tuner-analog.ts (Node ESM).
 * Ceilings from docs/bios-ai-lane.v2.json: socket 70C / junction 80C / VRM 85C.
 */
import { readFileSync } from "node:fs";

/**
 * @typedef {{ emulation_faults_per_sec: number, fallback_scalar_count: number, translation_path: "AVX"|"XOP"|"SSE_SCALAR", vpermd_emulated: number }} IsaBridgeOps
 * @typedef {{ translation_cache_hit: number, gcn_fallback_count: number, blendshapes_baked: boolean, spirv_features_emulated: string[] }} GpuRosettaOps
 * @typedef {{ cpu_socket_c: number, gpu_junction_c: number, vrm_c?: number }} Thermal
 * @typedef {{ hop_limit: number, pbn_grid_size: number, eco_mode: "eco_conservative"|"balanced"|"performance", voss: "BOUND"|"PARTIAL"|"REJECTED" }} TunerState
 */

export class SiliconTunerAnalog {
  /**
   * @param {"fx8350-polaris"|"modern-silicon"} [profile]
   * @param {{ readK10Temp?: () => number, readAmdgpuJunction?: () => number, silent?: boolean }} [hooks]
   */
  constructor(profile = "fx8350-polaris", hooks = {}) {
    this.profile = profile;
    this.hooks = hooks;
    this.silent = Boolean(hooks.silent);
    /** @type {TunerState} */
    this.state = {
      hop_limit: 4,
      pbn_grid_size: 32,
      eco_mode: "eco_conservative",
      voss: "PARTIAL",
    };
    this.CEILINGS = Object.freeze({
      cpu_socket: 70,
      gpu_junction: 80,
      vrm: 85,
    });
    this.lastReplayLog = null;
  }

  readK10Temp() {
    if (typeof this.hooks.readK10Temp === "function") {
      return this.hooks.readK10Temp();
    }
    try {
      const raw = readFileSync("/sys/class/hwmon/hwmon0/temp1_input", "utf8");
      return parseInt(raw, 10) / 1000;
    } catch {
      return 60;
    }
  }

  readAmdgpuJunction() {
    if (typeof this.hooks.readAmdgpuJunction === "function") {
      return this.hooks.readAmdgpuJunction();
    }
    try {
      const raw = readFileSync(
        "/sys/class/drm/card0/device/hwmon/hwmon1/temp1_input",
        "utf8",
      );
      return parseInt(raw, 10) / 1000;
    } catch {
      return 65;
    }
  }

  /**
   * @param {IsaBridgeOps} isa
   * @param {GpuRosettaOps} gpu
   * @param {number} quads
   * @param {number} targetBound
   * @returns {TunerState}
   */
  tune(isa, gpu, quads, targetBound) {
    /** @type {Thermal} */
    const thermal = {
      cpu_socket_c: this.readK10Temp(),
      gpu_junction_c: this.readAmdgpuJunction(),
    };
    if (!this.silent) {
      console.log(
        `[tuner] thermal socket=${thermal.cpu_socket_c}C gpu=${thermal.gpu_junction_c}C | isa_faults=${isa.emulation_faults_per_sec}/s gpu_fallbacks=${gpu.gcn_fallback_count} cache_hit=${gpu.translation_cache_hit}%`,
      );
    }

    if (isa.emulation_faults_per_sec > 100) {
      if (!this.silent) {
        console.log(
          `[REPLAY FIX] ISA bridge hot → switching ${isa.translation_path} → SSE_SCALAR for next hop`,
        );
      }
      isa.translation_path = "SSE_SCALAR";
      this.state.hop_limit = Math.max(1, this.state.hop_limit - 1);
      this.state.pbn_grid_size = 40;
    }
    if (isa.vpermd_emulated > 500) {
      this.state.pbn_grid_size = 48;
    }

    if (gpu.translation_cache_hit < 70 && gpu.gcn_fallback_count > 30) {
      if (!this.silent) {
        console.log(
          `[REPLAY FIX] GPU Rosetta cache cold (${gpu.translation_cache_hit}%) → warming cache, baking blendshapes`,
        );
      }
      gpu.blendshapes_baked = true;
      this.state.hop_limit = Math.max(1, this.state.hop_limit - 1);
    }
    if (
      Array.isArray(gpu.spirv_features_emulated) &&
      gpu.spirv_features_emulated.includes("subgroup") &&
      thermal.gpu_junction_c > 75
    ) {
      if (!this.silent) {
        console.log(
          `[REPLAY FIX] subgroup emulated on Polaris → disable extra loops`,
        );
      }
      this.state.pbn_grid_size = 48;
    }

    if (
      thermal.cpu_socket_c >= this.CEILINGS.cpu_socket ||
      thermal.gpu_junction_c >= this.CEILINGS.gpu_junction
    ) {
      if (!this.silent) {
        console.log(
          `[TUNER REJECT] thermal ceiling hit → REJECT extra quads, VOSS PARTIAL`,
        );
      }
      this.state.voss = "PARTIAL";
      this.state.eco_mode = "eco_conservative";
      this.state.hop_limit = Math.max(1, this.state.hop_limit - 1);
      if (quads < targetBound && !this.silent) {
        console.log(
          `[GOVERNED] Holding at ${quads} BOUND for ${this.profile}, aspirational ${targetBound} PARTIAL deferred until <65C`,
        );
      }
      this.logToReplay(thermal, isa, gpu, quads);
      return this.state;
    }

    if (
      thermal.cpu_socket_c < 65 &&
      thermal.gpu_junction_c < 75 &&
      isa.emulation_faults_per_sec < 20
    ) {
      if (quads >= targetBound) {
        this.state.voss = "BOUND";
        this.state.pbn_grid_size = 32;
        if (!this.silent) {
          console.log(
            `[TUNER BOUND] ${quads} >= ${targetBound} BOUND on ${this.profile} → GREEN`,
          );
        }
      } else if (quads >= targetBound * 0.85) {
        this.state.voss = "PARTIAL";
        if (!this.silent) {
          console.log(
            `[TUNER PARTIAL] ${quads} close to ${targetBound}, thermal ok, pushing`,
          );
        }
        this.state.hop_limit += 1;
      }
    }

    this.logToReplay(thermal, isa, gpu, quads);
    return this.state;
  }

  logToReplay(thermal, isa, gpu, quads) {
    this.lastReplayLog = {
      ts: Date.now(),
      profile: this.profile,
      thermal,
      isa_bridge_ops: { ...isa },
      gpu_rosetta_ops: { ...gpu },
      tuner: { ...this.state },
      quads,
      payload_hash: `tuner_${quads}_${thermal.cpu_socket_c}`,
    };
    if (!this.silent) {
      console.log(`[REPLAY LOG] ${JSON.stringify(this.lastReplayLog)}`);
    }
  }

  getState() {
    return this.state;
  }
}
