import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const PORT = 8171;
const BASE = `http://localhost:${PORT}`;

let server;
let baseUrl;

function runServer() {
  return new Promise((resolve, reject) => {
    rmSync(DATA_DIR, { recursive: true, force: true });
    mkdirSync(DATA_DIR, { recursive: true });
    const child = spawn(process.execPath, ["src/server.mjs"], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        GOVERNED_RENDER_KEYS: JSON.stringify([
          { key: "demo-0001", tier: "trial" },
          { key: "studio-0002", tier: "studio" },
        ]),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const t0 = Date.now();
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`${BASE}/health`);
        if (r.ok) {
          clearInterval(poll);
          resolve(child);
        }
      } catch {}
      if (Date.now() - t0 > 15000) {
        clearInterval(poll);
        reject(new Error(`server start timeout:\n${out}`));
      }
    }, 250);
  });
}

before(async () => {
  server = await runServer();
});

after(() => {
  if (server) server.kill("SIGTERM");
});

async function api(method, path, { key, body } = {}) {
  const headers = {};
  if (key) headers["x-api-key"] = key;
  if (body) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

test("health reports ok + ffmpeg availability", async () => {
  const { status, data } = await api("GET", "/health");
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(typeof data.ffmpeg, "boolean");
});

test("pricing exposes tiers and credit model", async () => {
  const { status, data } = await api("GET", "/pricing");
  assert.equal(status, 200);
  assert.ok(data.tiers.trial);
  assert.ok(data.tiers.studio);
  assert.ok(data.tiers.pro);
  assert.equal(data.tiers.trial.credits_per_month, 25);
});

test("anonymous still render works and is metered as trial", async () => {
  const { status, data } = await api("POST", "/v1/render", {
    body: { prompt: "cyan tesseract lattice", seed: 7, width: 48, height: 48, samples: 4, format: "still" },
  });
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.record.kind, "governed-render-still");
  assert.equal(data.record.constitution.finalDeterminismClass, "D2");
  assert.equal(data.record.constitution.finalStatus, "PASS");
  assert.equal(data.record.replay.verified, true);
  assert.ok(data.cost >= 1);
  assert.equal(data.remainingCredits, 25 - data.cost);
});

test("keyed still render charges correct credits + serves media", async () => {
  const { data } = await api("POST", "/v1/render", {
    key: "demo-0001",
    body: { prompt: "emissive quads", width: 64, height: 64, samples: 8, format: "still" },
  });
  assert.equal(data.ok, true);
  assert.equal(data.record.tier, "trial");
  assert.equal(data.cost, 1);

  const media = await fetch(`${BASE}/v1/jobs/${data.jobId}/media`);
  assert.equal(media.status, 200);
  const ct = media.headers.get("content-type");
  assert.match(ct, /image\/png/);
  const buf = Buffer.from(await media.arrayBuffer());
  assert.equal(buf[0], 0x89); // PNG magic
  assert.equal(buf[1], 0x50);
});

test("movie render encodes mp4 and records frame seeds", async () => {
  const { status, data } = await api("POST", "/v1/render", {
    key: "studio-0002",
    body: { prompt: "emissive quads", width: 48, height: 48, samples: 4, format: "movie", frames: 6, fps: 6 },
  });
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.record.kind, "governed-render-movie");
  assert.equal(data.record.frames, 6);
  assert.equal(data.record.frameSeeds.length, 6);
  assert.equal(data.record.replay.verified, true);

  const media = await fetch(`${BASE}/v1/jobs/${data.jobId}/media`);
  assert.equal(media.status, 200);
  assert.match(media.headers.get("content-type"), /video\/mp4/);
});

test("tier limits are enforced (size over cap returns 402)", async () => {
  const { status, data } = await api("POST", "/v1/render", {
    key: "demo-0001",
    body: { prompt: "big", width: 1024, height: 1024, samples: 8, format: "still" },
  });
  assert.equal(status, 402);
  assert.match(data.error, /tier cap/);
});

test("credits are drained and insufficient returns 402", async () => {
  // trial has 25 credits/mo; 48x48@4 still = 1 credit each
  const { data } = await api("POST", "/v1/render", {
    key: "demo-0001",
    body: { prompt: "a", width: 48, height: 48, samples: 4, format: "still" },
  });
  let remaining = data.remainingCredits;
  for (let i = 0; i < 30 && remaining > 0; i++) {
    const r = await api("POST", "/v1/render", {
      key: "demo-0001",
      body: { prompt: "x", width: 48, height: 48, samples: 4, format: "still" },
    });
    if (r.status !== 200) break;
    remaining = r.data.remainingCredits;
  }
  assert.equal(remaining, 0);
  const over = await api("POST", "/v1/render", {
    key: "demo-0001",
    body: { prompt: "y", width: 48, height: 48, samples: 4, format: "still" },
  });
  assert.equal(over.status, 402);
  assert.equal(over.data.error, "insufficient_credits");
});
