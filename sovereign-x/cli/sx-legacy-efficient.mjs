#!/usr/bin/env node
/**
 * Sovereign X — legacy AMD 3-layer efficient beauty CLI.
 * STATUS: **partial** — routes through SX; optional Lemonade SD / SDK / OpenCL.
 *
 * Usage:
 *   node sovereign-x/cli/sx-legacy-efficient.mjs --intent <id> [--width 64] [--height 64] [--tile 8] [--p 0.1] [--out path]
 *   node sovereign-x/cli/sx-legacy-efficient.mjs --intent <id> --still [--provider auto|lemonade|lemonade-sdk|opencl.gen|opencl]
 *   node sovereign-x/cli/sx-legacy-efficient.mjs --probe-lemonade-sdk
 *   node sovereign-x/cli/sx-legacy-efficient.mjs --intent <id> --provider lemonade-sdk --chat "ping"
 */

import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { route, resolveCapability } from "../router/index.js";
import { writeCapabilityReport } from "../router/modules/gpu/amd/lemonadeSdAdapter.js";
import { writeSdkCapabilityReport } from "../router/modules/gpu/amd/lemonadeSdkAdapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const proofDir = join(repoRoot, "docs", "4d-engine", "proofs", "legacy-efficient");

function parseArgs(argv) {
  const out = {
    intent: null,
    width: 64,
    height: 64,
    tile: 8,
    p: 0.1,
    seed: 0,
    still: false,
    provider: "none",
    prompt: null,
    chat: null,
    out: join(proofDir, "sx-route-proof.json"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--intent") out.intent = argv[++i];
    else if (a === "--width") out.width = Number(argv[++i]);
    else if (a === "--height") out.height = Number(argv[++i]);
    else if (a === "--tile") out.tile = Number(argv[++i]);
    else if (a === "--p") out.p = Number(argv[++i]);
    else if (a === "--seed") out.seed = Number(argv[++i]);
    else if (a === "--out") out.out = resolve(argv[++i]);
    else if (a === "--still") {
      out.still = true;
      if (out.provider === "none") out.provider = "auto";
    }
    else if (a === "--provider") out.provider = String(argv[++i] || "auto");
    else if (a === "--prompt") out.prompt = argv[++i];
    else if (a === "--chat") {
      out.chat = argv[++i];
      if (out.provider === "none") out.provider = "lemonade-sdk";
    }
    else if (a === "--probe-lemonade") out.probeLemonade = true;
    else if (a === "--probe-lemonade-sdk") out.probeLemonadeSdk = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: sx-legacy-efficient --intent <id> [options]
  --width N        default 64
  --height N       default 64
  --tile N         default 8
  --p F            salience fraction (sparse) default 0.1
  --seed N         default 0
  --still          request beauty still (Lemonade SD → opencl.gen on auto; Lemonade held until pixels)
  --provider MODE  none|auto|lemonade|lemonade-sdk|opencl.gen|opencl|opencl-legacy
  --prompt TEXT    still prompt for Lemonade SD
  --chat TEXT      Lemonade SDK OpenAI chat (implies --provider lemonade-sdk)
  --probe-lemonade write Lemonade SD capability report only
  --probe-lemonade-sdk write Lemonade SDK LLM/chat capability report (ports 8000+13305)
  --out PATH       proof JSON path
STATUS: partial — assist schedule + optional still/chat; never print SoT; opencl.gen ≠ SDXL.`);
    process.exit(0);
  }

  if (args.probeLemonadeSdk) {
    const reportPath = join(proofDir, "lemonade-sdk-capability-report.json");
    const probeOnly = await writeSdkCapabilityReport(reportPath, {
      tryChat: false,
    });
    const canChat = (probeOnly.report.downloadedLlmModels || []).length > 0;
    const { report } = canChat
      ? await writeSdkCapabilityReport(reportPath, {
          tryChat: true,
          prompt: args.chat || args.prompt || "Reply with exactly: OK",
          max_tokens: 16,
          timeoutMs: 60_000,
        })
      : probeOnly;
    console.log(JSON.stringify({
      ok: !!report.serverUp,
      status: report.status,
      serverUp: report.serverUp,
      selectedBaseUrl: report.selectedBaseUrl,
      downloadedLlmModels: report.downloadedLlmModels,
      chatCapable: report.chatCapable,
      blockers: report.blockers,
      portProbes: report.portProbes?.map((p) => ({
        baseUrl: p.baseUrl,
        reachable: p.reachable,
        tcpOpen: p.tcpOpen,
      })),
      reportPath,
    }, null, 2));
    setTimeout(() => process.exit(report.serverUp ? 0 : 1), 50);
    return;
  }

  if (args.probeLemonade) {
    const reportPath = join(proofDir, "lemonade-capability-report.json");
    const { report } = await writeCapabilityReport(reportPath, {
      tryGenerate: true,
      prompt: args.prompt || "probe still red sphere",
      outPath: join(proofDir, "lemonade-sx-still.png"),
      size: "512x512",
      steps: 4,
      retries: 1,
      maxModels: 2,
      timeoutMs: 30_000,
      model: "SD-Turbo-GGUF",
    });
    console.log(JSON.stringify({
      ok: !!report.generationCapable,
      status: report.status,
      serverUp: report.serverUp,
      blockers: report.blockers,
      generateOk: report.generate?.ok,
      reportPath,
      stillPath: report.generate?.outPath || null,
    }, null, 2));
    process.exit(report.serverUp ? 0 : 1);
  }

  if (!args.intent) {
    console.error("error: --intent required (Layer 3 governance)");
    process.exit(2);
  }

  const provider = args.provider;
  const wantAssist =
    args.still ||
    args.chat ||
    (provider && provider !== "none");

  const resolved = resolveCapability("gpu.compute.amd.legacy_efficient");
  const result = await route("gpu.compute.amd.legacy_efficient", {
    intentId: args.intent,
    determinismRequired: false,
    width: args.width,
    height: args.height,
    tileSize: args.tile,
    salienceFraction: args.p,
    seed: args.seed,
    requestStill: args.still,
    beautyProvider: wantAssist ? provider : "none",
    prompt: args.prompt,
    chatPrompt: args.chat,
    probeSdk: provider === "lemonade-sdk",
    stillOutDir: proofDir,
    hostGpu: {
      name: "AMD Radeon (TM) R9 380 Series",
      vendor: "amd",
      legacyGcn: true,
      architecture: "tonga",
    },
  });

  const proof = {
    capturedAt: new Date().toISOString(),
    thesis: "3-Layer Path -- mathematically not mythically",
    capabilityResolved: resolved,
    routeResult: result,
    invoke: {
      cli: "node sovereign-x/cli/sx-legacy-efficient.mjs",
      capabilityId: "gpu.compute.amd.legacy_efficient",
      still: args.still,
      provider: args.provider,
      chat: !!args.chat,
    },
    honesty:
      "Combined gain is schedule math. Does not claim R9 380 Total FLOPs/Time > RTX 4090. Lemonade SD may be blocked (AVX2/ROCm) — hold until pixelsProduced:true. Lemonade SDK chat needs a downloaded LLM; opencl.gen (CL-Gen) is the first-class OpenCL pixel source on this host (not SDXL; not soft-raster parity).",
  };

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(proof, null, 2), "utf8");

  const tmpOut = join(repoRoot, "tmp", "legacy-gpu-foothold", "sx-route-proof.json");
  mkdirSync(dirname(tmpOut), { recursive: true });
  writeFileSync(tmpOut, JSON.stringify(proof, null, 2), "utf8");

  const capSrc = join(repoRoot, "tmp", "legacy-gpu-foothold", "r9-380-capability-report.json");
  const capDst = join(dirname(args.out), "r9-380-capability-report.json");
  if (existsSync(capSrc)) {
    copyFileSync(capSrc, capDst);
  }

  console.log(JSON.stringify({
    ok: result.ok,
    capabilityId: result.capabilityId,
    status: result.status,
    usefulFraction: result.metrics?.usefulFraction,
    tileOccupancy: result.metrics?.tileOccupancy,
    combinedGainEstimate: result.metrics?.combinedGainEstimate,
    stillProvider: result.beauty?.stillProvider || result.plate?.stillProvider || null,
    stillPath: result.beauty?.stillPath || result.plate?.stillPath || null,
    lemonadeOk: result.beauty?.lemonade?.generate?.ok ?? null,
    lemonadeSdkUp: result.beauty?.lemonadeSdk?.probe?.serverUp ?? null,
    lemonadeSdkChatOk: result.beauty?.lemonadeSdk?.chat?.ok ?? null,
    lemonadeSdkBase: result.beauty?.lemonadeSdk?.probe?.selectedBaseUrl ?? null,
    openclOk: result.beauty?.openclGen?.ok ?? result.beauty?.opencl?.ok ?? null,
    openclGenOk: result.beauty?.openclGen?.ok ?? null,
    proofPath: args.out,
  }, null, 2));

  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

