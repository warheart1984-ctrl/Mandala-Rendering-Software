/**
 * denser-topology-worker.ts — authoritative FX-8350 + RX 580 patch.
 * Runnable: workers/denser-topology-worker.mjs (Node ESM).
 * Lane SoT: docs/bios-ai-lane.v2.json
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

type Profile = "fx8350-polaris" | "modern-silicon";
type VossState = "BOUND" | "PARTIAL" | "REJECTED";

interface LaneConfig {
  quad_targets: Record<
    Profile,
    { BOUND: number; PARTIAL: number; rationale: string }
  >;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIOS_LANE_PATH = resolve(__dirname, "../docs/bios-ai-lane.v2.json");

export function detectProfile(
  env: NodeJS.ProcessEnv = process.env,
): Profile {
  const forced = env.SILICON_PROFILE as Profile | undefined;
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

export function loadTargets(lanePath = BIOS_LANE_PATH): LaneConfig["quad_targets"] {
  const raw = JSON.parse(readFileSync(lanePath, "utf8"));
  return raw.denser_topology_worker.quad_targets;
}

export class DenserTopologyWorker {
  private profile: Profile;
  private targets: LaneConfig["quad_targets"];
  private currentQuads = 0;
  public lastHopLimit: number | null = null;
  public lastPbnGridSize: number | null = null;
  public lastReplayLog: Record<string, unknown> | null = null;
  public isaBridgeOps = { emulation_faults_per_sec: 0, fallback_scalar_count: 0 };
  public gpuRosettaOps = {
    translation_cache_hit: 0,
    gcn_fallback_count: 0,
    blendshapes_baked: false,
  };
  public thermal = { cpu_socket_c: 0, gpu_junction_c: 0 };

  constructor(opts: { profile?: Profile; lanePath?: string; silent?: boolean } = {}) {
    this.profile = opts.profile || detectProfile();
    this.targets = loadTargets(opts.lanePath || BIOS_LANE_PATH);
    if (!opts.silent) {
      console.log(
        `[denser] profile=${this.profile} BOUND=${this.targets[this.profile].BOUND} PARTIAL=${this.targets[this.profile].PARTIAL}`,
      );
    }
  }

  public getVossState(): VossState {
    const { BOUND, PARTIAL } = this.targets[this.profile];
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

  public densify(baseQuads: number, hopLimit: number, pbnGridSize: number): number {
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

  public setCurrentQuads(quads: number): VossState {
    this.currentQuads = quads;
    return this.getVossState();
  }

  private logToReplay(quads: number, state: VossState) {
    this.lastReplayLog = {
      timestamp: Date.now(),
      profile: this.profile,
      currentQuads: quads,
      target: this.targets[this.profile],
      voss: state,
      isa_bridge_ops: this.isaBridgeOps,
      gpu_rosetta_ops: this.gpuRosettaOps,
      thermal: this.thermal,
      payload_hash: `quad_${quads}_${this.profile}`,
    };
  }
}
