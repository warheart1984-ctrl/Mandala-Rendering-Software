/**
 * AI Painter organ — appearance under certified constraints.
 * CPU field tint is **working**. Local SD is attempted (Lemonade :13307,
 * then already-loaded sd-server :13306). Never 512² (OOM history on RX 580).
 *
 * Default (free): SD-Turbo / CPU only — Anything-V5 adult mode OFF.
 * Local open uncensored: AI_PAINTER_UNCENSORED=1 (or AI_PAINTER_OPEN / golden-painter).
 * Billing dual-key (declared): MANDALA_BILLING_ENFORCE=1 requires pro+uncensored.
 * Status: **partial** until a live SD overlay is proven in the e2e receipt.
 */

import { readdirSync, readFileSync } from "node:fs";
import { phiStats, meanGradMag } from "../materials/index.mjs";
import { decodePngToRgb, compositeSdOverRgb, rgbToPng } from "../png.mjs";
import {
  FREE_SD_MODELS,
  PRO_UNCENSORED_MODELS,
  PRO_UNCENSORED_REFUSAL,
  PAINTER_STEPS,
  assertLegalAdultTheme,
  clampPainterEdge,
  isProPainterUnlocked,
  isProTierEnv,
  resolvePainterBackend,
} from "./pro-tier.mjs";
import { generateAnythingViaSdCli, sdCliAvailable } from "./sd-cli.mjs";

export const PAINTER_STATUS = "partial";
export const LEMONADE_PAINTER_PORT = 13307;
export const SD_SERVER_PORT = 13306;
export const LEMONADE_PAINTER_HOST = process.env.LEMONADE_HOST || "127.0.0.1";
export const SD_TIMEOUT_MS = 90000;
export const SD_RETRY_TIMEOUT_MS = 90000;
export const SD_SIZE = "64x64";
export const SD_WIDTH = 64;
export const SD_HEIGHT = 64;
export const SD_STEPS = PAINTER_STEPS;
export const SD_CFG = 1.0;
/** @deprecated Prefer FREE_SD_MODELS — kept for existing imports/tests */
export const SD_MODEL_CANDIDATES = FREE_SD_MODELS;

export {
  FREE_SD_MODELS,
  PRO_UNCENSORED_MODELS,
  PRO_UNCENSORED_REFUSAL,
  BILLING_UNCENSORED_REFUSAL,
  assertLegalAdultTheme,
  clampPainterEdge,
  isProPainterUnlocked,
  isProTierEnv,
  isBillingEnforce,
  isOpenLocalEnv,
  resolvePainterBackend,
} from "./pro-tier.mjs";

function lemonadeBase() {
  return `http://${LEMONADE_PAINTER_HOST}:${LEMONADE_PAINTER_PORT}/api/v1`;
}

function sdServerUrl() {
  return `http://${LEMONADE_PAINTER_HOST}:${SD_SERVER_PORT}/v1/images/generations`;
}

function authHeaders() {
  const headers = { "Content-Type": "application/json" };
  const key = process.env.LEMONADE_API_KEY;
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function sdBody(prompt, model, { edge = SD_WIDTH } = {}) {
  const e = clampPainterEdge(edge);
  return {
    model,
    prompt,
    size: `${e}x${e}`,
    width: e,
    height: e,
    steps: SD_STEPS,
    cfg_scale: SD_CFG,
    response_format: "b64_json",
    n: 1,
  };
}

/** Free / safer constrained prompt — no adult uncensored system language. */
export function constrainedPrompt(snapshot, stats) {
  const hash8 = String(snapshot.hash || "").slice(0, 16);
  return [
    "appearance under certified Mandala constraints;",
    `constitution ${snapshot.constitutionId};`,
    `stateHash ${hash8};`,
    `t=${snapshot.t};`,
    `phi mean=${stats.mean.toFixed(4)} mass=${stats.mass.toFixed(3)};`,
    "do not invent geometry; tint existing fields only;",
    "amber lattice, defect glow, no photoreal claim",
  ].join(" ");
}

/**
 * Pro-only adult dramatic appearance prompt (legal adult fiction themes).
 * Callers must already pass entitlement + legal-adult checks.
 */
export function uncensoredAdultPrompt(snapshot, stats, theme = "") {
  const hash8 = String(snapshot.hash || "").slice(0, 16);
  const themePart = String(theme || "").trim() || "adult dramatic novel appearance";
  return [
    "adult dramatic character appearance for legal adult fiction / film;",
    "all subjects are consenting adults 18+; no minors;",
    themePart + ";",
    `constitution ${snapshot.constitutionId};`,
    `stateHash ${hash8};`,
    `t=${snapshot.t};`,
    `phi mean=${stats.mean.toFixed(4)};`,
    "appearance only under certified Mandala constraints; do not invent geometry",
  ].join(" ");
}

/**
 * Deterministic CPU painter: tint/emit from φ and |∇φ|. Does not mutate certified buffers.
 */
export function paintCpu(snapshot, image) {
  if (!snapshot.frozen && snapshot.hash) {
    /* allow frozen or view copies; never write snapshot.scalar */
  }
  const stats = phiStats(snapshot.scalar);
  const gMean = meanGradMag(snapshot.vector, snapshot.shape.cellCount);
  const rgb = image.rgb;
  const w = image.width;
  const h = image.height;
  const d = snapshot.defect;
  const dx = Math.min(w - 1, Math.max(0, Math.round((d.x / snapshot.shape.nx) * w)));
  const dy = Math.min(h - 1, Math.max(0, Math.round((d.y / snapshot.shape.ny) * h)));
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 3;
      const dist = Math.hypot(px - dx, py - dy);
      const glow = Math.exp(-dist / 6) * (0.25 + gMean);
      const grain = ((px * 13 + py * 7 + (snapshot.t | 0) * 3) & 7) / 255;
      rgb[i] = Math.min(255, rgb[i] + Math.round(glow * 70) + Math.round(grain * 20));
      rgb[i + 1] = Math.min(255, rgb[i + 1] + Math.round(glow * 18));
      rgb[i + 2] = Math.min(255, Math.max(0, rgb[i + 2] - Math.round(glow * 8)));
    }
  }
  const tier = isProTierEnv() ? "pro" : "free";
  image.painter = {
    organ: "AIPainter",
    backend: "cpu-field-tint",
    status: PAINTER_STATUS,
    tier,
    uncensored: false,
    prompt: constrainedPrompt(snapshot, stats),
    phiStats: stats,
    meanGradMag: gMean,
    mutatesCertified: false,
    stateHash: snapshot.hash,
  };
  return image;
}

async function readExcerpt(res) {
  const text = await res.text().catch(() => "");
  return text.slice(0, 240);
}

function parseB64(json) {
  return json?.data?.[0]?.b64_json || json?.images?.[0] || null;
}

/**
 * One health/models probe. Does not generate images.
 */
export async function diagnoseLemonade({ timeoutMs = 5000 } = {}) {
  const started = Date.now();
  const healthUrl = `${lemonadeBase()}/health`;
  const modelsUrl = `${lemonadeBase()}/models`;
  try {
    const [healthRes, modelsRes] = await Promise.all([
      fetch(healthUrl, { signal: AbortSignal.timeout(timeoutMs) }),
      fetch(modelsUrl, { signal: AbortSignal.timeout(timeoutMs) }),
    ]);
    const healthText = await healthRes.text().catch(() => "");
    const modelsText = await modelsRes.text().catch(() => "");
    let modelIds = [];
    try {
      const parsed = JSON.parse(modelsText);
      modelIds = (parsed?.data || []).map((m) => m.id).filter(Boolean);
    } catch {
      /* excerpt only */
    }
    return {
      ok: healthRes.ok,
      http: healthRes.status,
      modelsHttp: modelsRes.status,
      ms: Date.now() - started,
      port: LEMONADE_PAINTER_PORT,
      modelIds,
      excerpt: healthText.slice(0, 400),
    };
  } catch (err) {
    return {
      ok: false,
      http: 0,
      ms: Date.now() - started,
      port: LEMONADE_PAINTER_PORT,
      reason: err?.message || String(err),
    };
  }
}

function pickModel(modelIds, candidates) {
  for (const id of candidates) {
    if (modelIds.includes(id)) return id;
  }
  return candidates[0];
}

async function postImages(url, body, timeoutMs) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      return {
        ok: false,
        http: res.status,
        ms,
        reason: await readExcerpt(res),
      };
    }
    const json = await res.json();
    const b64 = parseB64(json);
    if (!b64) {
      return { ok: false, http: res.status, ms, reason: "missing b64_json" };
    }
    const pngBytes = Buffer.from(b64, "base64");
    return { ok: true, http: res.status, ms, pngBytes, bytes: pngBytes.length };
  } catch (err) {
    return {
      ok: false,
      http: 0,
      ms: Date.now() - started,
      reason: err?.message || String(err),
    };
  }
}

function blockedEvidence({ plan, diag, attempts, timeoutMs, reason }) {
  const last = attempts[attempts.length - 1];
  return {
    status: "blocked-with-evidence",
    backend: plan.backend,
    model: plan.model,
    tier: plan.tier,
    uncensored: plan.uncensored,
    port: LEMONADE_PAINTER_PORT,
    timeoutMs,
    size: plan.size,
    steps: plan.steps,
    cfg_scale: SD_CFG,
    diagnose: diag,
    attempts,
    http: last?.http,
    ms: attempts.reduce((s, a) => s + (a.ms || 0), 0),
    reason: reason || last?.reason || "no image",
    note: plan.note || undefined,
    passed: false,
  };
}

/**
 * Lemonade :13307 first (90s). Retry once.
 * Free path: SD-Turbo only (never Anything-V5).
 * Pro uncensored: Anything-V5 preferred; SD-Turbo fallback with honest note.
 * If Lemonade cannot load SD, use already-running sd-server :13306 (64×64).
 * Never cloud. Never 512.
 */
export async function tryLemonadeSd(prompt, {
  timeoutMs = SD_TIMEOUT_MS,
  plan = null,
} = {}) {
  const attempts = [];
  const diag = await diagnoseLemonade();
  const modelIds = diag.modelIds || [];
  const resolved =
    plan ||
    resolvePainterBackend({
      requestUncensored: false,
      modelIds,
    });
  const edge = clampPainterEdge(Number(String(resolved.size || SD_SIZE).split("x")[0]));
  const lemonadeUrl = `${lemonadeBase()}/images/generations`;

  let model = resolved.model;
  if (resolved.uncensored && resolved.preferAnything) {
    model =
      PRO_UNCENSORED_MODELS.find((id) => modelIds.includes(id)) ||
      modelIds.find((id) => /anything/i.test(id)) ||
      model;
  } else {
    model = pickModel(modelIds, FREE_SD_MODELS);
  }

  const body = sdBody(prompt, model, { edge });
  console.log(
    `[AIPainter] ${resolved.logLine || `painter.tier=${resolved.tier} uncensored=${resolved.uncensored} model=${model}`}`,
  );

  const first = await postImages(lemonadeUrl, body, timeoutMs);
  attempts.push({ via: "lemonade-13307", model, ...first, pngBytes: undefined, bytes: first.bytes });
  let winner = first.ok ? { ...first, via: "lemonade-13307", model } : null;
  const lemonadePortConflict =
    !winner &&
    /sd-server failed to start|model_load_error|become ready/i.test(String(first.reason || ""));

  /* Pro uncensored: if Anything failed (and not a hard port conflict), fall back to SD-Turbo once */
  if (!winner && resolved.uncensored && !lemonadePortConflict) {
    const turbo = pickModel(modelIds, FREE_SD_MODELS);
    const turboBody = sdBody(prompt, turbo, { edge });
    const turboTry = await postImages(lemonadeUrl, turboBody, SD_RETRY_TIMEOUT_MS);
    attempts.push({
      via: "lemonade-13307-sd-turbo-fallback",
      model: turbo,
      ...turboTry,
      pngBytes: undefined,
      bytes: turboTry.bytes,
    });
    if (turboTry.ok) {
      winner = { ...turboTry, via: "lemonade-13307", model: turbo };
      resolved.backend = "sd-turbo-fallback";
      resolved.note =
        "Anything-V5 unavailable or failed; SD-Turbo may still refuse some adult prompts";
      resolved.model = turbo;
    }
  }

  if (!winner && !lemonadePortConflict) {
    const retry = await postImages(lemonadeUrl, body, SD_RETRY_TIMEOUT_MS);
    attempts.push({ via: "lemonade-13307-retry", model, ...retry, pngBytes: undefined, bytes: retry.bytes });
    if (retry.ok) winner = { ...retry, via: "lemonade-13307", model };
  }

  if (!winner && !resolved.uncensored) {
    /* Free path sd-server :13306 — never spawn a second server; Anything-V5 not on this path */
    const localBody = sdBody(prompt, "sd-cpp-local", { edge });
    const local = await postImages(sdServerUrl(), localBody, 60000);
    attempts.push({ via: "sd-server-13306", model: "sd-cpp-local", ...local, pngBytes: undefined, bytes: local.bytes });
    if (local.ok) winner = { ...local, via: "sd-server-13306", model: "SD-Turbo" };
  }

  if (!winner && resolved.uncensored) {
    /*
     * Lemonade image recipes often fail with model_load_error when an
     * existing sd-server already owns :13306. Prefer one-shot sd-cli
     * Anything-V5 (CPU Q4) — does not spawn a second server.
     */
    if (sdCliAvailable()) {
      console.log("[AIPainter] lemonade image blocked; trying sd-cli Anything-V5 (CPU Q4)");
      const cli = await generateAnythingViaSdCli(prompt, { edge, steps: SD_STEPS });
      attempts.push({
        via: "sd-cli-anything-v5",
        model: "Anything-V5",
        ok: cli.ok,
        http: 0,
        ms: cli.ms,
        reason: cli.reason,
        bytes: cli.bytes,
      });
      if (cli.ok) {
        winner = { ...cli, via: "sd-cli", model: "Anything-V5" };
        resolved.backend = "anything-v5";
        resolved.model = "Anything-V5";
        resolved.note =
          "Lemonade :13307 could not load Anything-V5 (sd-server owns :13306); used sd-cli one-shot";
      }
    }
  }

  if (!winner && resolved.uncensored) {
    /* Last resort for pro: sd-server whatever is loaded (often SD-Turbo) */
    const localBody = sdBody(prompt, "sd-cpp-local", { edge });
    const local = await postImages(sdServerUrl(), localBody, 60000);
    const loaded = detectSdServerModelId();
    attempts.push({
      via: "sd-server-13306-fallback",
      model: loaded || "sd-cpp-local",
      ...local,
      pngBytes: undefined,
      bytes: local.bytes,
    });
    if (local.ok) {
      const isAnything = /anything/i.test(loaded || "");
      winner = {
        ...local,
        via: "sd-server-13306",
        model: isAnything ? "Anything-V5" : loaded || "SD-Turbo",
      };
      resolved.backend = isAnything ? "anything-v5" : "sd-turbo-fallback";
      resolved.note = isAnything
        ? "Anything-V5 served by existing sd-server :13306"
        : "Anything-V5 unavailable via Lemonade/sd-cli; SD via sd-server may still refuse some adult prompts";
      resolved.model = winner.model;
    }
  }

  if (!winner) {
    return blockedEvidence({
      plan: resolved,
      diag,
      attempts,
      timeoutMs,
      reason: attempts[attempts.length - 1]?.reason || "no image",
    });
  }

  const backend =
    /anything/i.test(winner.model) || winner.via === "sd-cli"
      ? "anything-v5"
      : resolved.backend === "sd-turbo-fallback"
        ? "sd-turbo-fallback"
        : "sd-turbo";

  return {
    status: "partial",
    backend,
    via: winner.via,
    model: winner.model,
    tier: resolved.tier,
    uncensored: resolved.uncensored,
    port: winner.via.includes("13306")
      ? SD_SERVER_PORT
      : winner.via === "sd-cli"
        ? 0
        : LEMONADE_PAINTER_PORT,
    timeoutMs,
    size: `${edge}x${edge}`,
    steps: SD_STEPS,
    cfg_scale: winner.cfg_scale ?? SD_CFG,
    diagnose: { ok: diag.ok, http: diag.http, modelIds: diag.modelIds, ms: diag.ms },
    attempts,
    http: winner.http ?? 0,
    ms: winner.ms,
    passed: true,
    bytes: winner.bytes,
    pngBytes: winner.pngBytes,
    note: resolved.note || undefined,
    modelPath: winner.modelPath,
  };
}

/** Best-effort: which model the live sd-server was started with. */
export function detectSdServerModelId() {
  try {
    for (const pid of readdirSync("/proc")) {
      if (!/^\d+$/.test(pid)) continue;
      let cmdline;
      try {
        cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8");
      } catch {
        continue;
      }
      if (!cmdline.includes("sd-server")) continue;
      const parts = cmdline.split("\0").filter(Boolean);
      const mi = parts.findIndex((p) => p === "--model" || p === "-m");
      if (mi >= 0 && parts[mi + 1]) {
        const modelPath = parts[mi + 1];
        if (/anything/i.test(modelPath)) return "Anything-V5";
        if (/sd-turbo|turbo/i.test(modelPath)) return "SD-Turbo";
        return modelPath.split("/").pop() || modelPath;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function overlaySd(image, pngBytes) {
  const decoded = decodePngToRgb(pngBytes);
  compositeSdOverRgb(
    image.rgb,
    image.width,
    image.height,
    decoded.rgb,
    decoded.width,
    decoded.height,
    0.55,
  );
  return { width: decoded.width, height: decoded.height };
}

/**
 * @param {object} snapshot
 * @param {object} image
 * @param {object} [opts]
 * @param {boolean} [opts.trySd=true]
 * @param {boolean} [opts.requestUncensored=false] - request uncensored adult path
 * @param {boolean} [opts.cliProUncensored=false] - --pro-uncensored-painter (needs local opt-in or billing dual key)
 * @param {boolean} [opts.localOpen=false] - golden-painter / explicit local open path
 * @param {string} [opts.theme] - optional adult dramatic theme
 * @param {NodeJS.ProcessEnv} [opts.env] - entitlement env (defaults to process.env)
 */
export async function paint(snapshot, image, {
  trySd = true,
  requestUncensored = false,
  cliProUncensored = false,
  localOpen = false,
  theme = "",
  env = process.env,
} = {}) {
  paintCpu(snapshot, image);
  const stats = image.painter.phiStats;
  const wantsUncensored = Boolean(requestUncensored || cliProUncensored || localOpen);
  let plan = resolvePainterBackend({
    requestUncensored: wantsUncensored,
    cliProUncensored,
    localOpen,
    env,
  });

  console.log(`[AIPainter] ${plan.logLine}`);

  if (wantsUncensored && plan.denied) {
    image.painter.tier = plan.tier;
    image.painter.uncensored = false;
    image.painter.backend = image.painter.backend || "cpu-field-tint";
    image.painter.uncensoredDenied = true;
    image.painter.uncensoredDenialReason = plan.reason;
    image.painter.sd = {
      status: "denied",
      tier: plan.tier,
      uncensored: false,
      backend: "denied-uncensored",
      reason: plan.reason,
      passed: false,
    };
    image.painter.sdAttempted = false;
    image.painter.cpuBackend = "cpu-field-tint";
    /* Free safer path still available if trySd — without adult prompts / Anything-V5 */
    if (trySd) {
      const freePlan = resolvePainterBackend({ requestUncensored: false, env });
      image.painter.prompt = constrainedPrompt(snapshot, stats);
      const sd = await tryLemonadeSd(image.painter.prompt, { plan: freePlan });
      if (sd.passed && sd.pngBytes) {
        try {
          const dim = overlaySd(image, sd.pngBytes);
          image.painter.backend = sd.backend || "sd-turbo";
          image.painter.composited = true;
          image.painter.sdSize = dim;
        } catch (err) {
          sd.compositeError = err?.message || String(err);
          image.painter.composited = false;
        }
      }
      image.painter.sd = {
        ...sd,
        pngBytes: undefined,
        b64: undefined,
        uncensoredDenied: true,
        uncensoredDenialReason: plan.reason,
      };
      image.painter.sdAttempted = true;
      image.painter.tier = freePlan.tier;
      image.painter.uncensored = false;
      return { image, sd: { ...sd, pngBytes: sd.pngBytes }, deniedUncensored: plan.reason };
    }
    return { image, sd: image.painter.sd, deniedUncensored: plan.reason };
  }

  if (wantsUncensored && plan.uncensored) {
    const legal = assertLegalAdultTheme(theme);
    if (!legal.ok) {
      image.painter.tier = "pro";
      image.painter.uncensored = false;
      image.painter.backend = "cpu-field-tint";
      image.painter.sd = {
        status: "denied",
        tier: "pro",
        uncensored: false,
        backend: "denied-illegal-theme",
        reason: legal.reason,
        passed: false,
      };
      image.painter.sdAttempted = false;
      image.painter.cpuBackend = "cpu-field-tint";
      console.log(`[AIPainter] painter.tier=pro uncensored=false model=(denied) reason=illegal-theme`);
      return { image, sd: image.painter.sd, deniedIllegal: legal.reason };
    }
    image.painter.prompt = uncensoredAdultPrompt(snapshot, stats, theme);
  }

  image.painter.tier = plan.tier;
  image.painter.uncensored = plan.uncensored;

  let sd = { status: "skipped", reason: "trySd=false", tier: plan.tier, uncensored: plan.uncensored };
  if (trySd) {
    /* Re-resolve with live model list after diagnose inside tryLemonadeSd */
    sd = await tryLemonadeSd(image.painter.prompt, { plan });
    if (sd.passed && sd.pngBytes) {
      try {
        const dim = overlaySd(image, sd.pngBytes);
        image.painter.backend = sd.backend || (plan.uncensored ? "anything-v5" : "sd-turbo");
        image.painter.composited = true;
        image.painter.sdSize = dim;
      } catch (err) {
        sd.compositeError = err?.message || String(err);
        image.painter.composited = false;
        if (sd.pngBytes?.length) {
          image.painter.backend = sd.backend || "sd-turbo";
          image.painter.sdSavedNotComposited = true;
        }
      }
    } else if (!sd.passed && plan.uncensored) {
      /* Honest blocked-with-evidence for pro path when models fail */
      image.painter.backend = image.painter.backend || "cpu-field-tint";
    }
  }

  image.painter.tier = sd.tier ?? plan.tier;
  image.painter.uncensored = sd.uncensored ?? plan.uncensored;
  if (sd.model) image.painter.model = sd.model;
  const pngBytes = sd.pngBytes;
  image.painter.sd = { ...sd, pngBytes: undefined, b64: undefined };
  image.painter.sdAttempted = trySd;
  image.painter.cpuBackend = "cpu-field-tint";
  return { image, sd: { ...sd, pngBytes } };
}

export { rgbToPng };
