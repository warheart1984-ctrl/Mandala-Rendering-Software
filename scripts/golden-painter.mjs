#!/usr/bin/env node
/**
 * Golden path — open local uncensored AI Painter (Anything-V5).
 *
 * No dual pro exports required for local runs:
 *   node scripts/golden-painter.mjs
 *   node scripts/golden-painter.mjs --with-e2e
 *   node scripts/golden-painter.mjs --allow-cpu
 *
 * Optional single opt-in elsewhere: AI_PAINTER_UNCENSORED=1
 * Future SaaS billing stub: MANDALA_BILLING_ENFORCE=1 then requires
 *   MANDALA_PRO_TIER=1|AI_PAINTER_PRO=1 AND AI_PAINTER_UNCENSORED=1
 *
 * Output: output/mandala-painter-open/{frame.png,receipt.json}
 *
 * Routing (does not spawn a second sd-server):
 *   1) Lemonade :13307 Anything-V5 when it can load
 *   2) sd-cli Anything-V5 Q4 one-shot (preferred when Lemonade hits port conflict)
 *   3) sd-server :13306 whatever is loaded (honest model id)
 *   4) CPU field-tint only with --allow-cpu (honest receipt)
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  uncensoredDenialReason,
  assertLegalAdultTheme,
  clampPainterEdge,
  isProPainterUnlocked,
  resolvePainterBackend,
} from "../mandala/engine/painter/pro-tier.mjs";
import {
  diagnoseLemonade,
  detectSdServerModelId,
  uncensoredAdultPrompt,
  paint,
  LEMONADE_PAINTER_PORT,
  SD_SERVER_PORT,
} from "../mandala/engine/painter/index.mjs";
import { createInitialCertifiedState, freezeCertifiedSnapshot } from "../mandala/proto/certified-state.mjs";
import { createImage } from "../mandala/proto/mandala-project.mjs";
import { projectFrozenLayered } from "../mandala/engine/project.mjs";
import { rgbToPng } from "../mandala/engine/png.mjs";
import { runE2E } from "../mandala/engine/run-e2e.mjs";
import { sdCliAvailable, ANYTHING_V5_GGUF } from "../mandala/engine/painter/sd-cli.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUT_DIR = join(REPO_ROOT, "output/mandala-painter-open");

/** Tasteful adult dramatic theme from *A Map Drawn in Salt* / salt-atlas (legal adult fiction). */
export const SALT_MAP_THEME =
  "frost night salt-ink atlas map, Aven and Sava adult emotional tension, " +
  "two consenting adults 18+ in cinematic silhouette, cold breath, salt crystals on dark paper, " +
  "dramatic lighting, tasteful literary drama, no nudity, no pornography";

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function parseArgs(argv = process.argv.slice(2)) {
  return {
    withE2e: argv.includes("--with-e2e"),
    allowCpu: argv.includes("--allow-cpu"),
    edge: clampPainterEdge(Number(process.env.AI_PAINTER_SIZE) || 64),
    theme: (() => {
      const i = argv.indexOf("--theme");
      return i >= 0 && argv[i + 1] ? argv[i + 1] : SALT_MAP_THEME;
    })(),
  };
}

async function probeSdServer(timeoutMs = 3000) {
  const started = Date.now();
  try {
    const res = await fetch(`http://127.0.0.1:${SD_SERVER_PORT}/v1/models`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let modelIds = [];
    try {
      modelIds = (JSON.parse(text)?.data || []).map((m) => m.id).filter(Boolean);
    } catch {
      /* ignore */
    }
    return {
      ok: res.ok,
      http: res.status,
      ms: Date.now() - started,
      modelIds,
      loaded: detectSdServerModelId(),
    };
  } catch (err) {
    return { ok: false, http: 0, ms: Date.now() - started, reason: err?.message || String(err) };
  }
}

/**
 * Open local golden painter (Anything-V5). No dual pro env required unless billing enforce.
 */
export async function runGoldenPainter({
  theme = SALT_MAP_THEME,
  edge = 64,
  allowCpu = false,
  withE2e = false,
  env = process.env,
  outDir = OUT_DIR,
} = {}) {
  if (!isProPainterUnlocked({ env, localOpen: true })) {
    const err = new Error(uncensoredDenialReason(env));
    err.code = "DENIED_UNCENSORED";
    err.exitCode = 2;
    throw err;
  }

  const legal = assertLegalAdultTheme(theme);
  if (!legal.ok) {
    const err = new Error(legal.reason);
    err.code = "DENIED_ILLEGAL";
    err.exitCode = 3;
    throw err;
  }

  mkdirSync(outDir, { recursive: true });
  const e = clampPainterEdge(edge);

  const lemonade = await diagnoseLemonade();
  const sdServer = await probeSdServer();
  const plan = resolvePainterBackend({
    requestUncensored: true,
    localOpen: true,
    modelIds: lemonade.modelIds || [],
    env,
  });

  console.log(`[golden-painter] ${plan.logLine}`);
  console.log(
    `[golden-painter] lemonade:${LEMONADE_PAINTER_PORT} ok=${lemonade.ok} models=${(lemonade.modelIds || []).join(",") || "(none)"}`,
  );
  console.log(
    `[golden-painter] sd-server:${SD_SERVER_PORT} ok=${sdServer.ok} loaded=${sdServer.loaded || "unknown"} cli=${sdCliAvailable()}`,
  );

  const state = createInitialCertifiedState({ seed: 21 });
  const snap = freezeCertifiedSnapshot(state);
  const image = createImage(e, e);
  projectFrozenLayered(snap, image);

  const stats = { mean: 0.12, mass: 1.0 };
  const prompt = uncensoredAdultPrompt(snap, stats, theme);

  const painted = await paint(snap, image, {
    trySd: true,
    requestUncensored: true,
    localOpen: true,
    theme,
    env,
  });

  let pngBytes = painted.sd?.pngBytes || null;
  let backend = image.painter?.backend || painted.sd?.backend || "cpu-field-tint";
  let model = image.painter?.model || painted.sd?.model || null;
  let via = painted.sd?.via || null;
  let note = painted.sd?.note || null;
  let status = painted.sd?.passed ? "partial" : painted.sd?.status || "blocked-with-evidence";

  if (!pngBytes && allowCpu) {
    const cpuPng = rgbToPng(image.width, image.height, image.rgb);
    pngBytes = cpuPng;
    backend = "cpu-field-tint";
    model = null;
    via = "cpu";
    note = "SD/Anything unavailable; CPU field-tint only (honest last resort)";
    status = "partial";
  }

  if (!pngBytes) {
    const receipt = {
      type: "mandala-painter-open-receipt",
      status: "blocked-with-evidence",
      tier: plan.tier,
      uncensored: true,
      backend: painted.sd?.backend || "blocked",
      model: painted.sd?.model || null,
      via: painted.sd?.via || null,
      reason: painted.sd?.reason || "no image produced",
      diagnose: { lemonade, sdServer, sdCliAvailable: sdCliAvailable(), anythingGguf: ANYTHING_V5_GGUF },
      attempts: painted.sd?.attempts,
      setup: [
        "Ensure Lemonade on :13307 and/or sd-server on :13306",
        "Anything-V5 GGUF at runtime/models/image/anything-v5-q4_0.gguf",
        "If Lemonade returns model_load_error, golden path uses sd-cli (no second sd-server)",
        "Optional: bash runtime/start-sd-gguf.sh for SD-Turbo on :13306",
      ],
      theme,
      prompt,
      size: `${e}x${e}`,
      steps: 4,
    };
    const receiptPath = join(outDir, "receipt.json");
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
    const err = new Error(receipt.reason);
    err.code = "BLOCKED";
    err.exitCode = 1;
    err.receiptPath = receiptPath;
    err.receipt = receipt;
    throw err;
  }

  const framePath = join(outDir, "frame.png");
  writeFileSync(framePath, pngBytes);
  const compositePath = join(outDir, "frame-composited.png");
  writeFileSync(compositePath, rgbToPng(image.width, image.height, image.rgb));

  const receipt = {
    type: "mandala-painter-open-receipt",
    status,
    tier: plan.tier,
    uncensored: true,
    backend,
    model,
    via,
    note: note || undefined,
    port: painted.sd?.port,
    size: painted.sd?.size || `${e}x${e}`,
    steps: painted.sd?.steps || 4,
    cfg_scale: painted.sd?.cfg_scale,
    ms: painted.sd?.ms,
    http: painted.sd?.http,
    sha256: sha256(pngBytes),
    bytes: pngBytes.length,
    artifacts: {
      frame: framePath,
      composited: compositePath,
    },
    theme,
    prompt,
    diagnose: {
      lemonade: {
        ok: lemonade.ok,
        modelIds: lemonade.modelIds,
        http: lemonade.http,
      },
      sdServer: {
        ok: sdServer.ok,
        loaded: sdServer.loaded,
        modelIds: sdServer.modelIds,
      },
      sdCliAvailable: sdCliAvailable(),
      anythingGgufExists: existsSync(ANYTHING_V5_GGUF),
    },
    attempts: painted.sd?.attempts,
    deniedUncensored: painted.deniedUncensored || undefined,
    legalAdult: true,
    source: "A Map Drawn in Salt / salt-atlas (tasteful adult dramatic)",
  };

  const receiptPath = join(outDir, "receipt.json");
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  receipt.artifacts.receipt = receiptPath;

  let e2e = null;
  if (withE2e) {
    const e2eDir = join(outDir, "e2e-overlay");
    e2e = await runE2E({
      seed: 21,
      tEnd: 4,
      outDir: e2eDir,
      trySd: true,
      tryTts: false,
      width: e,
      height: e,
      requestUncensored: true,
      localOpen: true,
      theme,
    });
    receipt.e2e = {
      outDir: e2e.outDir,
      pngPath: e2e.pngPath,
      receiptPath: e2e.receiptPath,
      painter: e2e.receipt?.painter,
    };
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  }

  return { outDir, framePath, receiptPath, receipt, e2e, compositePath };
}

/** @deprecated Use runGoldenPainter — alias kept for callers. */
export async function runGoldenProPainter(opts = {}) {
  return runGoldenPainter(opts);
}

const isMain =
  process.argv[1] && String(process.argv[1]).replace(/\\/g, "/").endsWith("golden-painter.mjs");

if (isMain) {
  const args = parseArgs();
  runGoldenPainter(args)
    .then((r) => {
      console.log("Golden painter OK (open local)");
      console.log(`  frame:   ${r.framePath}`);
      console.log(`  receipt: ${r.receiptPath}`);
      console.log(
        `  tier=${r.receipt.tier} uncensored=${r.receipt.uncensored} backend=${r.receipt.backend} model=${r.receipt.model} via=${r.receipt.via}`,
      );
      console.log(`  sha256=${r.receipt.sha256}`);
      if (r.receipt.note) console.log(`  note: ${r.receipt.note}`);
      if (r.e2e) console.log(`  e2e overlay: ${r.e2e.outDir}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`Golden painter failed: ${err.message}`);
      if (err.receiptPath) console.error(`  receipt: ${err.receiptPath}`);
      process.exit(err.exitCode || 1);
    });
}
