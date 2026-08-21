/**
 * AI Painter organ — appearance under certified constraints.
 * CPU field tint is **working**. Local SD-Turbo is attempted (Lemonade :13307,
 * then already-loaded sd-server :13306). Never 512² (OOM history on RX 580).
 * Status: **partial** until a live SD overlay is proven in the e2e receipt.
 */

import { phiStats, meanGradMag } from "../materials/index.mjs";
import { decodePngToRgb, compositeSdOverRgb, rgbToPng } from "../png.mjs";

export const PAINTER_STATUS = "partial";
export const LEMONADE_PAINTER_PORT = 13307;
export const SD_SERVER_PORT = 13306;
export const LEMONADE_PAINTER_HOST = process.env.LEMONADE_HOST || "127.0.0.1";
export const SD_TIMEOUT_MS = 90000;
export const SD_RETRY_TIMEOUT_MS = 90000;
export const SD_SIZE = "64x64";
export const SD_WIDTH = 64;
export const SD_HEIGHT = 64;
export const SD_STEPS = 4;
export const SD_CFG = 1.0;
export const SD_MODEL_CANDIDATES = ["SD-Turbo", "SD-Turbo-GGUF"];

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

function sdBody(prompt, model) {
  return {
    model,
    prompt,
    size: SD_SIZE,
    width: SD_WIDTH,
    height: SD_HEIGHT,
    steps: SD_STEPS,
    cfg_scale: SD_CFG,
    response_format: "b64_json",
    n: 1,
  };
}

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
  image.painter = {
    organ: "AIPainter",
    backend: "cpu-field-tint",
    status: PAINTER_STATUS,
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

function pickSdModel(modelIds) {
  for (const id of SD_MODEL_CANDIDATES) {
    if (modelIds.includes(id)) return id;
  }
  return modelIds.find((id) => /sd-turbo/i.test(id)) || SD_MODEL_CANDIDATES[0];
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

/**
 * Lemonade :13307 first (90s). Retry once after diagnose.
 * If Lemonade cannot load SD, use the already-running local sd-server :13306
 * (same SD-Turbo, 64×64). Never cloud. Never 512.
 */
export async function tryLemonadeSd(prompt, { timeoutMs = SD_TIMEOUT_MS } = {}) {
  const attempts = [];
  const diag = await diagnoseLemonade();
  const model = pickSdModel(diag.modelIds || []);
  const lemonadeUrl = `${lemonadeBase()}/images/generations`;
  const body = sdBody(prompt, model);

  const first = await postImages(lemonadeUrl, body, timeoutMs);
  attempts.push({ via: "lemonade-13307", model, ...first, pngBytes: undefined, bytes: first.bytes });
  let winner = first.ok ? { ...first, via: "lemonade-13307", model } : null;

  if (!winner) {
    const retry = await postImages(lemonadeUrl, body, SD_RETRY_TIMEOUT_MS);
    attempts.push({ via: "lemonade-13307-retry", model, ...retry, pngBytes: undefined, bytes: retry.bytes });
    if (retry.ok) winner = { ...retry, via: "lemonade-13307", model };
  }

  if (!winner) {
    const localBody = sdBody(prompt, "sd-cpp-local");
    const local = await postImages(sdServerUrl(), localBody, 60000);
    attempts.push({ via: "sd-server-13306", model: "sd-cpp-local", ...local, pngBytes: undefined, bytes: local.bytes });
    if (local.ok) winner = { ...local, via: "sd-server-13306", model: "SD-Turbo" };
  }

  if (!winner) {
    const last = attempts[attempts.length - 1];
    return {
      status: "blocked-with-evidence",
      backend: "lemonade-sd-turbo",
      port: LEMONADE_PAINTER_PORT,
      timeoutMs,
      size: SD_SIZE,
      steps: SD_STEPS,
      cfg_scale: SD_CFG,
      diagnose: diag,
      attempts,
      http: last?.http,
      ms: attempts.reduce((s, a) => s + (a.ms || 0), 0),
      reason: last?.reason || "no image",
      passed: false,
    };
  }

  return {
    status: "partial",
    backend: "sd-turbo",
    via: winner.via,
    model: winner.model,
    port: winner.via.includes("13306") ? SD_SERVER_PORT : LEMONADE_PAINTER_PORT,
    timeoutMs,
    size: SD_SIZE,
    steps: SD_STEPS,
    cfg_scale: SD_CFG,
    diagnose: { ok: diag.ok, http: diag.http, modelIds: diag.modelIds, ms: diag.ms },
    attempts,
    http: winner.http,
    ms: winner.ms,
    passed: true,
    bytes: winner.bytes,
    pngBytes: winner.pngBytes,
  };
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

export async function paint(snapshot, image, { trySd = true } = {}) {
  paintCpu(snapshot, image);
  let sd = { status: "skipped", reason: "trySd=false" };
  if (trySd) {
    sd = await tryLemonadeSd(image.painter.prompt);
    if (sd.passed && sd.pngBytes) {
      try {
        const dim = overlaySd(image, sd.pngBytes);
        image.painter.backend = "sd-turbo";
        image.painter.composited = true;
        image.painter.sdSize = dim;
      } catch (err) {
        sd.compositeError = err?.message || String(err);
        image.painter.composited = false;
        if (sd.pngBytes?.length) {
          image.painter.backend = "sd-turbo";
          image.painter.sdSavedNotComposited = true;
        }
      }
    }
  }
  const pngBytes = sd.pngBytes;
  image.painter.sd = { ...sd, pngBytes: undefined, b64: undefined };
  image.painter.sdAttempted = trySd;
  image.painter.cpuBackend = "cpu-field-tint";
  return { image, sd: { ...sd, pngBytes } };
}

export { rgbToPng };
