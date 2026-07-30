/**
 * Legacy AMD efficient beauty — 3-Layer Path foothold (SX assist).
 *
 * Capability: gpu.compute.amd.legacy_efficient
 * Namespace: sx.capability.gpu.compute.amd.legacy_efficient
 *
 * STATUS: **partial** — governed sparse-tile schedule + metrics in-process;
 * optional Lemonade SD adapter + OpenCL Tonga still (host-dependent);
 * never Digital Printer SoT.
 *
 * Layers demonstrated:
 *   L1 Algorithmic — sparse tile selection (p · FLOPs_dense)
 *   L2 Memory     — tile-local bytes/FLOP estimate (declared)
 *   L3 Governance — intentId required before any approved work
 *
 * Drive-G-1: assistOnly; nonAuthoritative; metrics are schedule math, not GPU timers.
 */

import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateStillViaImageGenProviders,
  probeLemonadeCapabilities,
} from "./lemonadeSdAdapter.js";
import {
  buildConstitutionalImageGenLog,
} from "./ImageGenProvider.js";
import {
  probeLemonadeSdk,
  chatViaLemonadeSdk,
  PROVIDER_ID as LEMONADE_SDK_PROVIDER,
} from "./lemonadeSdkAdapter.js";
import {
  probeHipSdk,
  hipBeautyAssistSketch,
  resolveHipBeautyKernelStatus,
} from "./hipSdkProbe.js";
import { generateOpenClLegacyStill } from "./openclLegacyStill.js";
import {
  generateClGenStill,
  CL_GEN_PROVIDER,
} from "./openclGenProvider.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultProofDir = resolve(
  __dirname,
  "../../../../../docs/4d-engine/proofs/legacy-efficient",
);
const clGenProofDir = resolve(
  __dirname,
  "../../../../../docs/4d-engine/proofs/cl-gen",
);

export const CAPABILITY_ID = "gpu.compute.amd.legacy_efficient";

/**
 * @param {string} payload
 * @returns {string}
 */
export function stubReceiptHash(payload) {
  return createHash("sha256").update(String(payload)).digest("hex");
}

/**
 * Detect legacy GCN-class AMD (R9 380 / Tonga) from request.hostGpu or hints.
 * STATUS: **partial** — string heuristics; not a Vulkan/OpenCL live probe.
 *
 * @param {object} [hostGpu]
 * @returns {{ legacyGcn: boolean, vendor: string, name: string | null, routeHint: string }}
 */
export function detectLegacyAmdHost(hostGpu = {}) {
  const name = String(hostGpu.name || hostGpu.deviceName || "").toLowerCase();
  const vendor = String(hostGpu.vendor || "amd").toLowerCase();
  const explicit = hostGpu.legacyGcn === true || hostGpu.architecture === "tonga";
  const nameHit =
    /r9\s*380|tonga|hawaii|gcn/.test(name) ||
    /radeon \(tm\) r9 380/.test(name);
  const legacyGcn = explicit || nameHit;
  return {
    legacyGcn,
    vendor: vendor.includes("amd") || legacyGcn ? "amd" : vendor,
    name: hostGpu.name || hostGpu.deviceName || null,
    routeHint: legacyGcn
      ? CAPABILITY_ID
      : "gpu.compute.amd.hip",
  };
}

/**
 * Build salience field — center-weighted synthetic structure (deterministic).
 * Higher center = "subject" tiles; edges = background waste candidates.
 *
 * @param {number} tilesX
 * @param {number} tilesY
 * @param {number} [seed=0]
 * @returns {Float64Array} length tilesX*tilesY in [0,1]
 */
export function buildSalienceField(tilesX, tilesY, seed = 0) {
  const n = tilesX * tilesY;
  const out = new Float64Array(n);
  const cx = (tilesX - 1) / 2;
  const cy = (tilesY - 1) / 2;
  const maxD = Math.hypot(cx, cy) || 1;
  for (let y = 0; y < tilesY; y++) {
    for (let x = 0; x < tilesX; x++) {
      const d = Math.hypot(x - cx, y - cy) / maxD;
      // Deterministic jitter from seed+index (no Math.random)
      const h = stubReceiptHash(`sal|${seed}|${x}|${y}`).slice(0, 8);
      const jitter = (parseInt(h, 16) % 1000) / 10000; // 0..0.0999
      out[y * tilesX + x] = Math.max(0, Math.min(1, 1 - d + jitter * 0.05));
    }
  }
  return out;
}

/**
 * Select top-p tiles by salience (Layer 1 sparse).
 *
 * @param {Float64Array} salience
 * @param {number} p fraction in (0,1]
 * @returns {{ activeIndices: number[], threshold: number, occupancy: number }}
 */
export function selectSparseTiles(salience, p) {
  const n = salience.length;
  const frac = Math.min(1, Math.max(1 / n, Number(p) || 0.1));
  const k = Math.max(1, Math.round(n * frac));
  const indexed = Array.from(salience, (v, i) => ({ i, v }));
  indexed.sort((a, b) => b.v - a.v || a.i - b.i);
  const active = indexed.slice(0, k).map((r) => r.i);
  active.sort((a, b) => a - b);
  const threshold = indexed[k - 1]?.v ?? 0;
  return {
    activeIndices: active,
    threshold,
    occupancy: active.length / n,
  };
}

/**
 * Layer 2 bytes/FLOP estimate for tiled vs dense schedule (declared arithmetic).
 *
 * @param {{ width: number, height: number, tileSize: number, activeTiles: number, totalTiles: number }} dims
 */
export function estimateBandwidthEfficiency(dims) {
  const { width, height, tileSize, activeTiles, totalTiles } = dims;
  const px = width * height;
  // Dense: full frame RGBA8 touch + fake 64 FLOPs/px beauty
  const denseBytes = px * 4;
  const denseFlops = px * 64;
  // Sparse tiled: only active tiles + one tile halo row/col overhead factor 1.125
  const tilePx = tileSize * tileSize;
  const sparseBytes = Math.round(activeTiles * tilePx * 4 * 1.125);
  const sparseFlops = activeTiles * tilePx * 64;
  const denseBpf = denseBytes / denseFlops;
  const sparseBpf = sparseBytes / Math.max(1, sparseFlops);
  const memGain =
    sparseBpf > 0 ? denseBpf / sparseBpf : 1;
  return {
    status: "declared",
    denseBytes,
    sparseBytes,
    denseFlops,
    sparseFlops,
    bytesPerFlopDense: denseBpf,
    bytesPerFlopSparse: sparseBpf,
    memoryEfficiencyGainEstimate: memGain,
    note: "Arithmetic estimate — not a device profiler measurement",
  };
}

/**
 * Governed 3-layer efficient beauty assist.
 *
 * @param {object} request
 * @returns {object}
 */
export function integrateLegacyEfficientBeauty(request = {}) {
  if (request.asPrintSoT === true || request.authority === "authoritative") {
    return {
      ok: false,
      code: "GPU_PRINT_SOT_DENIED",
      assistOnly: true,
      nonAuthoritative: true,
      status: "partial",
      capabilityId: CAPABILITY_ID,
      message:
        `${CAPABILITY_ID} cannot be print SoT — only cpu.rt4d.print is authoritative`,
    };
  }

  const intentId = request.intentId ?? request.intent?.id ?? null;
  if (intentId == null || String(intentId).trim() === "") {
    return {
      ok: false,
      code: "GOVERNANCE_INTENT_REQUIRED",
      assistOnly: true,
      nonAuthoritative: true,
      status: "partial",
      capabilityId: CAPABILITY_ID,
      layer: 3,
      message:
        "Layer 3 governance: intentId required before legacy efficient beauty work (Work_approved=0)",
      metrics: {
        workTotal: 0,
        workApproved: 0,
        workWaste: 0,
        usefulFraction: 0,
      },
    };
  }

  const width = Math.max(8, Math.min(2048, request.width ?? 64));
  const height = Math.max(8, Math.min(2048, request.height ?? 64));
  const tileSize = Math.max(4, Math.min(64, request.tileSize ?? 8));
  const p = Math.min(1, Math.max(0.01, request.salienceFraction ?? request.p ?? 0.1));
  const seed = Number.isFinite(request.seed) ? request.seed >>> 0 : 0;

  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);
  const totalTiles = tilesX * tilesY;

  const host = detectLegacyAmdHost(request.hostGpu || {});
  const salience = buildSalienceField(tilesX, tilesY, seed);
  const sparse = selectSparseTiles(salience, p);

  const workTotal = totalTiles;
  const workApproved = sparse.activeIndices.length;
  const workWaste = workTotal - workApproved;
  const usefulFraction = workApproved / workTotal;
  const algoGain = usefulFraction > 0 ? 1 / usefulFraction : 1;

  const mem = estimateBandwidthEfficiency({
    width,
    height,
    tileSize,
    activeTiles: workApproved,
    totalTiles,
  });

  // Layer 3: approved path already filtered by intent; usefulFraction here is schedule occupancy.
  // Combined illustrative: govUseful 0.9 / naive 0.6 = 1.5 when operator applies full stack.
  const governanceGainDeclared = 1.5;
  const combinedGainEstimate =
    governanceGainDeclared * algoGain * Math.max(1, mem.memoryEfficiencyGainEstimate);

  const receiptPayload = [
    CAPABILITY_ID,
    intentId,
    width,
    height,
    tileSize,
    p,
    seed,
    sparse.activeIndices.join(","),
  ].join("|");

  return {
    ok: true,
    capabilityId: CAPABILITY_ID,
    authority: "assist",
    assistOnly: true,
    nonAuthoritative: true,
    status: "partial",
    layers: {
      algorithmic: { status: "partial", gainEstimate: algoGain },
      memory: {
        status: "declared",
        gainEstimate: mem.memoryEfficiencyGainEstimate,
      },
      governance: {
        status: "partial",
        intentId: String(intentId),
        gainDeclared: governanceGainDeclared,
        note: "intent gate enforced in this module; CKL policies are consumers (not edited)",
      },
    },
    host,
    schedule: {
      width,
      height,
      tileSize,
      tilesX,
      tilesY,
      totalTiles,
      activeTiles: workApproved,
      occupancy: sparse.occupancy,
      salienceThreshold: sparse.threshold,
      activeIndices: sparse.activeIndices,
      salienceFractionTarget: p,
    },
    metrics: {
      workTotal,
      workApproved,
      workWaste,
      usefulFraction,
      tileOccupancy: sparse.occupancy,
      algorithmicGainEstimate: algoGain,
      bytesPerFlopEstimate: mem.bytesPerFlopSparse,
      memoryEfficiencyGainEstimate: mem.memoryEfficiencyGainEstimate,
      governanceGainDeclared,
      combinedGainEstimate,
      note:
        "Combined gain is schedule math (Useful FLOPs fraction × declared mem/gov factors) — not a claim of beating 4090 Total FLOPs/Time",
    },
    bandwidth: mem,
    plate: {
      kind: "legacyEfficientAssistStub",
      status: "skeleton",
      note: "Schedule + metrics only unless requestStill / beautyProvider is set (async path)",
    },
    receipt: {
      intentId: String(intentId),
      scheduleHash: stubReceiptHash(receiptPayload),
      status: "skeleton",
    },
    message:
      "Legacy AMD 3-layer efficient beauty assist: sparse tiles + bandwidth estimate + intent gate",
    provenanceKind: "assistProvenance",
  };
}

/**
 * Async path: schedule + optional Lemonade SD / Lemonade SDK chat / CL-Gen / OpenCL still.
 *
 * request.beautyProvider: "auto" | "lemonade" | "lemonade-sdk" | "opencl.gen" | "opencl" | "hip" | "none"
 * request.requestStill: boolean (same as beautyProvider auto when true)
 * request.chatPrompt: optional — used with lemonade-sdk for OpenAI chat
 * request.probeHip: optional — attach HIP SDK detection (also on auto/hip)
 *
 * Auto prefer: Lemonade SD → opencl.gen (CL-Gen) → opencl-legacy radial probe.
 * Lemonade held until pixelsProduced:true on this host.
 *
 * @param {object} request
 * @returns {Promise<object>}
 */
export async function integrateLegacyEfficientBeautyAsync(request = {}) {
  const base = integrateLegacyEfficientBeauty(request);
  if (!base.ok) return base;

  const providerRaw = String(
    request.beautyProvider || (request.requestStill ? "auto" : "none"),
  ).toLowerCase();
  if (providerRaw === "none" || providerRaw === "") {
    return base;
  }

  const intentId = String(request.intentId ?? request.intent?.id ?? "still");
  const outDir = request.stillOutDir
    ? resolve(String(request.stillOutDir))
    : defaultProofDir;
  const lemonadeOut = join(outDir, "lemonade-sx-still.png");
  const clGenOut = join(
    request.clGenOutDir ? resolve(String(request.clGenOutDir)) : clGenProofDir,
    "opencl-gen-dim-room.png",
  );
  const openclLegacyOut = join(outDir, "opencl-tonga-still.png");

  /** @type {any} */
  const beauty = {
    providerRequested: providerRaw,
    lemonade: null,
    lemonadeSdk: null,
    hip: null,
    openclGen: null,
    opencl: null,
    stillPath: null,
    stillProvider: null,
  };

  const wantHip =
    providerRaw === "hip" ||
    providerRaw === "auto" ||
    request.probeHip === true;
  if (wantHip) {
    const hipProbe = probeHipSdk();
    const hipResolved = resolveHipBeautyKernelStatus(hipProbe);
    beauty.hip = {
      probe: hipProbe,
      sketch: hipBeautyAssistSketch(hipProbe),
      kernelStatus: hipResolved.kernelStatus,
      helloProof: hipResolved.helloProof,
      note: hipResolved.note,
    };
  }

  const wantSdk =
    providerRaw === "lemonade-sdk" ||
    providerRaw === LEMONADE_SDK_PROVIDER ||
    providerRaw === "auto";
  const wantLemonadeSd =
    providerRaw === "auto" || providerRaw === "lemonade";
  const wantClGen =
    providerRaw === "auto" ||
    providerRaw === "opencl.gen" ||
    providerRaw === CL_GEN_PROVIDER ||
    providerRaw === "opencl" ||
    // lemonade-sdk is LLM-only; still pixels fall through to CL-Gen when requested
    (providerRaw === "lemonade-sdk" && request.requestStill === true);
  const wantOpenclLegacy =
    providerRaw === "opencl-legacy" ||
    // Last-resort radial probe only after CL-Gen fails on auto/opencl paths
    ((providerRaw === "auto" ||
      providerRaw === "opencl" ||
      providerRaw === "opencl.gen") &&
      request.allowOpenclLegacyFallback !== false);

  if (wantSdk && (providerRaw === "lemonade-sdk" || request.chatPrompt || request.probeSdk)) {
    const sdkProbe = await probeLemonadeSdk();
    /** @type {any} */
    const sdkBlock = { probe: sdkProbe, chat: null };
    if (request.chatPrompt || providerRaw === "lemonade-sdk") {
      sdkBlock.chat = await chatViaLemonadeSdk({
        prompt:
          request.chatPrompt ||
          request.prompt ||
          "Summarize in one short sentence: legacy AMD efficient beauty assist.",
        model: request.lemonadeSdkModel || request.llmModel,
        max_tokens: request.chatMaxTokens ?? 64,
        timeoutMs: request.lemonadeSdkTimeoutMs ?? 120_000,
      });
    }
    beauty.lemonadeSdk = sdkBlock;
  }

  if (wantLemonadeSd) {
    const probe = await probeLemonadeCapabilities({ verifyWeights: false });
    const hostGpuBlocked = (probe.blockers || []).some((b) =>
      ["HOST_LEGACY_GCN", "LEMONADE_UNREACHABLE"].includes(b.code),
    );
    // CCC-ImageGen: do not hard-BLOCK on GPU/sd-server; cascade providers.
    // When local.gpu fails, cascade prefers opencl.gen before local.cpu stubs.
    const cascade = await generateStillViaImageGenProviders({
      prompt:
        request.stillPrompt ||
        (providerRaw === "lemonade"
          ? request.prompt
          : null) ||
        "simple red ceramic sphere on white table, soft light, photoreal still, legacy efficient beauty",
      size: request.stillSize || "512x512",
      steps: request.stillSteps ?? 4,
      model: request.lemonadeModel || "SD-Turbo-GGUF",
      outPath: lemonadeOut,
      retries: request.lemonadeRetries ?? 1,
      maxModels: request.lemonadeMaxModels ?? 2,
      timeoutMs: request.lemonadeTimeoutMs ?? 45_000,
      localGpuAvailable: !!probe.serverUp && !hostGpuBlocked,
      assumeGpuDown: request.assumeGpuDown === true,
      requireLawfulWeights: request.requireLawfulWeights,
      intentId,
      worldId: request.worldId || "interior.dim-room",
      engine3dContext: request.engine3dContext,
      // Prefer CL-Gen out path when cascade lands on opencl.gen
      openclGenOutPath: clGenOut,
    });
    const gen = cascade.result || cascade;
    beauty.lemonade = {
      probe,
      generate: gen,
      cascade,
      constitutionalLog:
        cascade.constitutionalLog ||
        buildConstitutionalImageGenLog({
          imageGenProvider: cascade.imageGenProvider,
          localGpuAvailable: !!probe.serverUp && !hostGpuBlocked,
          fallbackUsed: !!cascade.fallbackUsed,
          reason: cascade.message || cascade.imagesStatus || "",
        }),
    };
    if (cascade.pixelsProduced && (cascade.result?.outPath || gen.outPath)) {
      beauty.stillPath = cascade.result?.outPath || gen.outPath;
      beauty.stillProvider = cascade.imageGenProvider || "lemonade-local";
      if (beauty.stillProvider === CL_GEN_PROVIDER || beauty.stillProvider === "opencl.gen") {
        beauty.openclGen = cascade.result || gen;
      }
    }
  }

  // Explicit opencl.gen (or opencl alias) without going through Lemonade cascade
  if (
    !beauty.stillPath &&
    wantClGen &&
    (providerRaw === "opencl.gen" ||
      providerRaw === CL_GEN_PROVIDER ||
      providerRaw === "opencl" ||
      providerRaw === "lemonade-sdk")
  ) {
    const oclGen = await generateClGenStill({
      outPath: clGenOut,
      reportPath: join(dirname(clGenOut), "opencl-gen-dim-room.json"),
      width: Math.min(512, request.width ?? 512),
      height: Math.min(512, request.height ?? 512),
      intentId,
      worldId: request.worldId || "interior.dim-room",
      engine3dContext: request.engine3dContext,
      sceneJson: request.sceneJson,
    });
    beauty.openclGen = oclGen;
    if (oclGen.ok && oclGen.outPath) {
      beauty.stillPath = oclGen.outPath;
      beauty.stillProvider = CL_GEN_PROVIDER;
    }
  }

  // Last resort: legacy radial probe (not first-class CL-Gen)
  if (!beauty.stillPath && wantOpenclLegacy) {
    const ocl = await generateOpenClLegacyStill({
      outPath: openclLegacyOut,
      reportPath: join(outDir, "opencl-tonga-probe.json"),
      width: Math.min(512, request.width ?? 256),
      height: Math.min(512, request.height ?? 256),
    });
    beauty.opencl = ocl;
    if (ocl.ok && ocl.outPath) {
      beauty.stillPath = ocl.outPath;
      beauty.stillProvider = "opencl-legacy";
    }
  }

  const stillOk = !!beauty.stillPath;
  const sdkChatOk = !!beauty.lemonadeSdk?.chat?.ok;
  const sdkOnly =
    providerRaw === "lemonade-sdk" && !request.requestStill && !stillOk;

  return {
    ...base,
    beauty,
    plate: {
      kind: stillOk
        ? "legacyEfficientStill"
        : sdkChatOk || beauty.lemonadeSdk
          ? "legacyEfficientSdkAssist"
          : "legacyEfficientAssistStub",
      status: stillOk || sdkChatOk || beauty.lemonadeSdk?.probe?.serverUp
        ? "partial"
        : "skeleton",
      stillPath: beauty.stillPath,
      stillProvider: beauty.stillProvider,
      lemonadeSdkProvider: beauty.lemonadeSdk ? LEMONADE_SDK_PROVIDER : null,
      note: stillOk
        ? `Still via ${beauty.stillProvider} (assist-only; not print SoT; not SDXL)`
        : sdkOnly
          ? beauty.lemonadeSdk?.probe?.serverUp
            ? `Lemonade SDK probe/chat attached (LLM assist; no still pixels)`
            : "Lemonade SDK unreachable on :8000/:13305"
          : beauty.lemonade?.constitutionalLog?.fallbackUsed
            ? `No still pixels — CCC-ImageGen fallback used (${beauty.lemonade.constitutionalLog.imageGenProvider}); degraded/partial, not architecture-blocked-on-GPU`
            : "No still produced — Lemonade SD degraded and/or OpenCL unavailable; schedule metrics remain partial",
    },
    receipt: {
      ...base.receipt,
      intentId,
      stillProvider: beauty.stillProvider,
      lemonadeSdk: sdkChatOk || !!beauty.lemonadeSdk,
      imageGenConstitutionalLog: beauty.lemonade?.constitutionalLog || null,
      status: stillOk || sdkChatOk || beauty.lemonadeSdk?.probe?.serverUp
        ? "partial"
        : beauty.lemonade?.cascade?.status === "degraded"
          ? "degraded"
          : "skeleton",
    },
    message: stillOk
      ? `Legacy efficient beauty: schedule + still (${beauty.stillProvider})`
      : sdkChatOk
        ? `Legacy efficient beauty: schedule + Lemonade SDK chat (${beauty.lemonadeSdk.chat.model})`
        : beauty.lemonadeSdk?.probe?.serverUp
          ? base.message + " (Lemonade SDK reachable; chat/LLM model may be missing)"
          : beauty.lemonade?.constitutionalLog?.fallbackUsed
            ? base.message +
              ` (CCC-ImageGen fallbackUsed=true; ${beauty.lemonade.constitutionalLog.reason})`
            : base.message + " (still request did not produce pixels)",
  };
}

export default {
  CAPABILITY_ID,
  detectLegacyAmdHost,
  buildSalienceField,
  selectSparseTiles,
  estimateBandwidthEfficiency,
  integrateLegacyEfficientBeauty,
  integrateLegacyEfficientBeautyAsync,
  stubReceiptHash,
};
