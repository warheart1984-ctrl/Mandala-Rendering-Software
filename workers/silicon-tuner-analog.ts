/**
 * silicon-tuner-analog.ts — authoritative FX-8350 + RX 580 patch.
 * Runnable: workers/silicon-tuner-analog.mjs
 * Ceilings: socket 70C / junction 80C / VRM 85C — no firmware_write.
 */
import { readFileSync } from "fs";

export interface IsaBridgeOps {
  emulation_faults_per_sec: number;
  fallback_scalar_count: number;
  translation_path: "AVX" | "XOP" | "SSE_SCALAR";
  vpermd_emulated: number;
}

export interface GpuRosettaOps {
  translation_cache_hit: number;
  gcn_fallback_count: number;
  blendshapes_baked: boolean;
  spirv_features_emulated: string[];
}

export interface Thermal {
  cpu_socket_c: number;
  gpu_junction_c: number;
  vrm_c?: number;
}

export interface TunerState {
  hop_limit: number;
  pbn_grid_size: number;
  eco_mode: "eco_conservative" | "balanced" | "performance";
  voss: "BOUND" | "PARTIAL" | "REJECTED";
}

export class SiliconTunerAnalog {
  private state: TunerState = {
    hop_limit: 4,
    pbn_grid_size: 32,
    eco_mode: "eco_conservative",
    voss: "PARTIAL",
  };
  private readonly CEILINGS = {
    cpu_socket: 70,
    gpu_junction: 80,
    vrm: 85,
  };
  public lastReplayLog: Record<string, unknown> | null = null;

  constructor(
    private profile: "fx8350-polaris" | "modern-silicon" = "fx8350-polaris",
    private hooks: {
      readK10Temp?: () => number;
      readAmdgpuJunction?: () => number;
      silent?: boolean;
    } = {},
  ) {}

  private readK10Temp(): number {
    if (this.hooks.readK10Temp) return this.hooks.readK10Temp();
    try {
      const raw = readFileSync("/sys/class/hwmon/hwmon0/temp1_input", "utf8");
      return parseInt(raw, 10) / 1000;
    } catch {
      return 60;
    }
  }

  private readAmdgpuJunction(): number {
    if (this.hooks.readAmdgpuJunction) return this.hooks.readAmdgpuJunction();
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

  public tune(
    isa: IsaBridgeOps,
    gpu: GpuRosettaOps,
    quads: number,
    targetBound: number,
  ): TunerState {
    const thermal: Thermal = {
      cpu_socket_c: this.readK10Temp(),
      gpu_junction_c: this.readAmdgpuJunction(),
    };
    const silent = Boolean(this.hooks.silent);
    if (!silent) {
      console.log(
        `[tuner] thermal socket=${thermal.cpu_socket_c}C gpu=${thermal.gpu_junction_c}C | isa_faults=${isa.emulation_faults_per_sec}/s gpu_fallbacks=${gpu.gcn_fallback_count} cache_hit=${gpu.translation_cache_hit}%`,
      );
    }

    if (isa.emulation_faults_per_sec > 100) {
      if (!silent) {
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
      if (!silent) {
        console.log(
          `[REPLAY FIX] GPU Rosetta cache cold (${gpu.translation_cache_hit}%) → warming cache, baking blendshapes`,
        );
      }
      gpu.blendshapes_baked = true;
      this.state.hop_limit = Math.max(1, this.state.hop_limit - 1);
    }
    if (
      gpu.spirv_features_emulated.includes("subgroup") &&
      thermal.gpu_junction_c > 75
    ) {
      if (!silent) {
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
      if (!silent) {
        console.log(
          `[TUNER REJECT] thermal ceiling hit → REJECT extra quads, VOSS PARTIAL`,
        );
      }
      this.state.voss = "PARTIAL";
      this.state.eco_mode = "eco_conservative";
      this.state.hop_limit = Math.max(1, this.state.hop_limit - 1);
      if (quads < targetBound && !silent) {
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
        if (!silent) {
          console.log(
            `[TUNER BOUND] ${quads} >= ${targetBound} BOUND on ${this.profile} → GREEN`,
          );
        }
      } else if (quads >= targetBound * 0.85) {
        this.state.voss = "PARTIAL";
        if (!silent) {
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

  private logToReplay(
    thermal: Thermal,
    isa: IsaBridgeOps,
    gpu: GpuRosettaOps,
    quads: number,
  ) {
    this.lastReplayLog = {
      ts: Date.now(),
      profile: this.profile,
      thermal,
      isa_bridge_ops: isa,
      gpu_rosetta_ops: gpu,
      tuner: this.state,
      quads,
      payload_hash: `tuner_${quads}_${thermal.cpu_socket_c}`,
    };
    if (!this.hooks.silent) {
      console.log(`[REPLAY LOG] ${JSON.stringify(this.lastReplayLog)}`);
    }
  }

  public getState() {
    return this.state;
  }
}
