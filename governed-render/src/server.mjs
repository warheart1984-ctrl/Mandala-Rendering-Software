/**
 * governed-render hosted API — pure Node http server, zero dependencies.
 *
 * Endpoints:
 *   GET  /health            -> { ok, version, ffmpeg }
 *   GET  /pricing           -> pricing tiers + credit model
 *   POST /v1/render         -> { prompt, seed?, width?, height?, samples?, format: "still"|"movie", frames?, fps? }
 *   GET  /v1/jobs/:id       -> job record (poll this)
 *   GET  /v1/jobs/:id/media -> the rendered PNG/MP4
 *
 * Auth: X-API-Key header. Keys are provisioned from the GOVERNED_RENDER_KEYS
 * env var (JSON array of {key, tier}) or data/keys.json. Credit ledger is
 * persisted to data/ledger.json (in-memory in this sample; swap for a store).
 *
 * Usage:
 *   GOVERNED_RENDER_KEYS='[{"key":"demo-0001","tier":"trial"}]' node src/server.mjs
 */

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { renderGovernedStill, renderGovernedMovie, creditCost, creditCostMovie, OUTPUT_ROOT, ffmpegAvailable } from "./core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const LEDGER_FILE = join(DATA_DIR, "ledger.json");
const KEYS_FILE = join(DATA_DIR, "keys.json");

const PRICING = JSON.parse(readFileSync(join(ROOT, "pricing.json"), "utf8"));
const PORT = Number(process.env.PORT || 8080);
const VERSION = "0.1.0";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function loadLedger() {
  try {
    return JSON.parse(readFileSync(LEDGER_FILE, "utf8"));
  } catch {
    return { customers: {} };
  }
}

function saveLedger(l) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(LEDGER_FILE, JSON.stringify(l, null, 2));
}

function loadKeys() {
  const fromEnv = process.env.GOVERNED_RENDER_KEYS;
  let keys = {};
  if (fromEnv) {
    try {
      for (const k of JSON.parse(fromEnv)) keys[k.key] = { tier: k.tier };
    } catch {}
  }
  if (existsSync(KEYS_FILE)) {
    try {
      keys = { ...JSON.parse(readFileSync(KEYS_FILE, "utf8")), ...keys };
    } catch {}
  }
  return keys;
}

const KEYS = loadKeys();

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function getCustomer(key) {
  const ledger = loadLedger();
  const tierName = KEYS[key]?.tier || "trial";
  const tier = PRICING.tiers[tierName] || PRICING.tiers.trial;
  const month = currentMonth();
  const c = ledger.customers[key] || { tier: tierName, months: {} };
  c.tier = tierName;
  const m = c.months[month] || { used: 0 };
  m.used = m.used || 0;
  c.months[month] = m;
  ledger.customers[key] = c;
  saveLedger(ledger);
  return { tier, tierName, month, used: m.used, remaining: Math.max(0, tier.credits_per_month - m.used) };
}

function charge(key, cost) {
  const cust = getCustomer(key);
  if (cust.remaining < cost) return { ok: false, error: "insufficient_credits", ...cust };
  const ledger = loadLedger();
  ledger.customers[key].months[cust.month].used += cost;
  saveLedger(ledger);
  return { ok: true, cost, remaining: cust.remaining - cost };
}

function validateLimits({ width, height, samples, frames, fps, format }, tier) {
  if (width > tier.max_width || height > tier.max_height) return { error: `size exceeds tier cap (${tier.max_width}x${tier.max_height})` };
  if (samples > tier.max_samples) return { error: `samples exceeds tier cap (${tier.max_samples})` };
  if (format === "movie") {
    if (!tier.movies) return { error: "movies not enabled for tier" };
    if (frames > tier.max_frames) return { error: `frames exceeds tier cap (${tier.max_frames})` };
    if (fps > tier.max_fps) return { error: `fps exceeds tier cap (${tier.max_fps})` };
  }
  return { ok: true };
}

function json(res, code, body) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
  res.end(data);
}

function notFound(res, msg) {
  return json(res, 404, { ok: false, error: msg || "not_found" });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  if (method === "GET" && path === "/health") {
    return json(res, 200, { ok: true, service: "governed-render", version: VERSION, ffmpeg: ffmpegAvailable() });
  }

  if (method === "GET" && path === "/pricing") {
    return json(res, 200, PRICING);
  }

  if (method === "POST" && path === "/v1/render") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let input = {};
    try {
      input = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: "invalid_json" });
    }

    const apiKey = req.headers["x-api-key"] || "anonymous";
    const cust = getCustomer(apiKey);
    const format = input.format === "movie" ? "movie" : "still";
    const width = Math.max(16, Math.min(2048, Number(input.width || 256)));
    const height = Math.max(16, Math.min(2048, Number(input.height || 256)));
    const samples = Math.max(1, Math.min(256, Number(input.samples || 16)));
    const frames = Math.max(1, Math.min(1200, Number(input.frames || 24)));
    const fps = Math.max(1, Math.min(60, Number(input.fps || 12)));

    const limits = validateLimits({ width, height, samples, frames, fps, format }, cust.tier);
    if (!limits.ok) return json(res, 402, { ok: false, ...limits, tier: cust.tierName });

    const cost = format === "movie" ? creditCostMovie({ frames, width, height, samples }) : creditCost({ width, height, samples });
    const ch = charge(apiKey, cost);
    if (!ch.ok) return json(res, 402, { ok: false, error: "insufficient_credits", tier: cust.tierName, cost });

    const jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const outDir = join(OUTPUT_ROOT, jobId);
    mkdirSync(outDir, { recursive: true });

    try {
      let record;
      let mediaPath = null;
      if (format === "movie") {
        const m = renderGovernedMovie({
          prompt: input.prompt || "cyan tesseract lattice",
          seed: Number(input.seed || 20260816),
          width,
          height,
          samples,
          frames,
          fps,
          outputDir: outDir,
        });
        record = m.record;
        mediaPath = m.mp4;
      } else {
        const s = renderGovernedStill({
          prompt: input.prompt || "cyan tesseract lattice",
          seed: Number(input.seed || 20260816),
          width,
          height,
          samples,
        });
        record = s.record;
        const pngPath = join(outDir, "still.png");
        writeFileSync(pngPath, s.png);
        mediaPath = pngPath;
      }
      record.jobId = jobId;
      record.apiKey = apiKey === "anonymous" ? null : apiKey;
      record.tier = cust.tierName;
      record.cost = cost;
      record.remainingCredits = ch.remaining;
      writeFileSync(join(outDir, "record.json"), JSON.stringify(record, null, 2));
      return json(res, 200, { ok: true, jobId, status: "done", cost, remainingCredits: ch.remaining, record, mediaPath });
    } catch (err) {
      return json(res, 500, { ok: false, error: "render_failed", detail: String(err.message || err) });
    }
  }

  if (method === "GET" && path.startsWith("/v1/jobs/")) {
    const id = path.slice("/v1/jobs/".length);
    if (id.includes("/")) {
      const [jobId, sub] = id.split("/");
      const dir = join(OUTPUT_ROOT, jobId);
      if (!existsSync(dir)) return notFound(res);
      if (sub === "media") {
        const files = readdirSync(dir);
        const media = files.find((f) => f.endsWith(".mp4")) || files.find((f) => f.endsWith(".png"));
        if (!media) return notFound(res, "no media");
        const buf = readFileSync(join(dir, media));
        res.writeHead(200, {
          "content-type": media.endsWith(".mp4") ? "video/mp4" : "image/png",
          "content-length": buf.length,
        });
        return res.end(buf);
      }
      if (sub === "record") {
        try {
          return json(res, 200, JSON.parse(readFileSync(join(dir, "record.json"), "utf8")));
        } catch {
          return notFound(res, "no record");
        }
      }
      return notFound(res);
    }
    const dir = join(OUTPUT_ROOT, id);
    if (!existsSync(dir)) return notFound(res);
    try {
      return json(res, 200, JSON.parse(readFileSync(join(dir, "record.json"), "utf8")));
    } catch {
      return notFound(res, "no record");
    }
  }

  return notFound(res);
});

server.listen(PORT, () => {
  console.log(`[governed-render] API listening on :${PORT} (v${VERSION})`);
  console.log(`[governed-render] ffmpeg ${ffmpegAvailable() ? "available" : "MISSING"}`);
  console.log(`[governed-render] keys: ${Object.keys(KEYS).length ? Object.keys(KEYS).join(", ") : "none provisioned (anonymous=trial)"}`);
});
