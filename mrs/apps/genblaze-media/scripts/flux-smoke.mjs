#!/usr/bin/env node
/**
 * Direct NVIDIA FLUX.1-schnell smoke (Node).
 * Loads repo-root .env — never prints the key.
 *
 * Usage (from repo root):
 *   node mrs/apps/genblaze-media/scripts/flux-smoke.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../..");
const envPath = resolve(repoRoot, ".env");

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnv(envPath);

const key =
  process.env.NVIDIA_API_KEY ||
  process.env.NVIDIA_NIM_API_KEY ||
  process.env.NGC_API_KEY;
if (!key) {
  console.error("NVIDIA_API_KEY missing in .env");
  process.exit(1);
}

const invokeUrl =
  "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell";
const payload = {
  prompt: process.argv[2] || "a simple coffee shop interior",
  width: 512,
  height: 512,
  seed: 0,
  steps: 4,
};

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 180_000);

try {
  const response = await fetch(invokeUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });
  clearTimeout(timer);
  const text = await response.text();
  if (!response.ok) {
    console.error("flux_fail", response.status, text.slice(0, 400));
    process.exit(1);
  }
  const body = JSON.parse(text);
  const keys = Object.keys(body);
  console.log("flux_ok", response.status, "keys", keys.join(","));
  if (typeof body.image === "string") {
    console.log("image_b64_len", body.image.length);
  }
} catch (err) {
  clearTimeout(timer);
  console.error("flux_error", err?.name || err, String(err?.message || err).slice(0, 200));
  process.exit(1);
}
