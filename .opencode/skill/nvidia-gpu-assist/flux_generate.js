/**
 * NVIDIA GPU Assist — FLUX shell image ingest (assist-only).
 *
 * STATUS: **partial** — live POST when endpoint+key present; otherwise
 * assistOnly stub (does not crash constitutional / print paths).
 *
 * Drive-G-1: never print SoT. FLUX.1-schnell may reject `image` (T2I-only);
 * that is reported honestly, not false-PASS.
 *
 * Endpoint resolution (first win):
 *   NIM_FLUX_ENDPOINT
 *   NVIDIA_GEN_BASE_URL + /genai/{model}
 *   default https://ai.api.nvidia.com/v1/genai/{GENBLAZE_IMAGE_MODEL|flux.1-schnell}
 *
 * Canonical copy lives under sovereign-x/skills/; also install to
 * ~/.agents/skills/nvidia-gpu-assist/flux_generate.js
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export const FLUX_GENERATE_STATUS = "partial";
export const DEFAULT_FLUX_MODEL = "black-forest-labs/flux.1-schnell";
export const DEFAULT_GEN_BASE = "https://ai.api.nvidia.com/v1";

/**
 * Expand `~` and resolve a skill-relative path.
 * @param {string} p
 */
export function expandHome(p) {
  if (!p || typeof p !== "string") return p;
  if (p.startsWith("~/") || p === "~") {
    return resolve(homedir(), p.slice(2) || ".");
  }
  return p;
}

/**
 * @returns {string | null}
 */
export function resolveApiKey() {
  const key =
    process.env.NVIDIA_API_KEY ||
    process.env.NVIDIA_NIM_API_KEY ||
    process.env.NGC_API_KEY ||
    "";
  const trimmed = String(key).trim();
  return trimmed || null;
}

/**
 * @param {{ model?: string }} [opts]
 * @returns {string}
 */
export function resolveFluxEndpoint(opts = {}) {
  const explicit = (process.env.NIM_FLUX_ENDPOINT || "").trim();
  if (explicit) return explicit;

  const model = (
    opts.model ||
    process.env.GENBLAZE_IMAGE_MODEL ||
    process.env.NIM_FLUX_MODEL ||
    DEFAULT_FLUX_MODEL
  ).trim();

  const base = (
    process.env.NVIDIA_GEN_BASE_URL ||
    process.env.GENBLAZE_NVIDIA_GEN_BASE_URL ||
    DEFAULT_GEN_BASE
  )
    .trim()
    .replace(/\/$/, "");

  return `${base}/genai/${model.replace(/^\//, "")}`;
}

/**
 * @param {{ imagePath?: string, imageBase64?: string }} input
 * @returns {{ ok: true, base64: string, source: string } | { ok: false, code: string, message: string }}
 */
export function loadImageBase64(input = {}) {
  if (input.imageBase64 && typeof input.imageBase64 === "string") {
    const raw = input.imageBase64.includes(",")
      ? input.imageBase64.split(",").pop()
      : input.imageBase64;
    return { ok: true, base64: raw, source: "inline" };
  }
  const imagePath = input.imagePath ? expandHome(String(input.imagePath)) : null;
  if (!imagePath) {
    return {
      ok: false,
      code: "MISSING_IMAGE",
      message: "Provide imagePath or imageBase64",
    };
  }
  if (!existsSync(imagePath)) {
    return {
      ok: false,
      code: "IMAGE_NOT_FOUND",
      message: `Image not found: ${imagePath}`,
    };
  }
  const buf = readFileSync(imagePath);
  return {
    ok: true,
    base64: buf.toString("base64"),
    source: imagePath,
  };
}

/**
 * Build assist-only stub (offline / missing key / dry-run).
 * @param {object} opts
 */
export function buildFluxStub(opts = {}) {
  return {
    ok: true,
    live: false,
    assistOnly: true,
    nonAuthoritative: true,
    status: "declared",
    code: opts.code || "FLUX_STUB",
    capabilityId: "gpu.gen.nvidia.nim_flux",
    mode: opts.mode || "lookdev-from-image",
    message:
      opts.message ||
      "FLUX image ingest stub — no live NIM call (missing key/endpoint, dryRun, or forced stub)",
    imageIngested: Boolean(opts.imageIngested),
    imageSource: opts.imageSource ?? null,
    prompt: opts.prompt ?? null,
    endpoint: opts.endpoint ?? null,
    provenanceKind: "assistProvenance",
  };
}

/**
 * Parse NIM / GenAI JSON for an output image b64.
 * @param {object} body
 * @returns {string | null}
 */
export function extractOutputBase64(body) {
  if (!body || typeof body !== "object") return null;
  if (typeof body.image === "string") return body.image;
  if (typeof body.b64_json === "string") return body.b64_json;
  const arts = body.artifacts;
  if (Array.isArray(arts) && arts[0]) {
    if (typeof arts[0] === "string") return arts[0];
    if (typeof arts[0].base64 === "string") return arts[0].base64;
  }
  const data = body.data;
  if (Array.isArray(data) && data[0]?.b64_json) return data[0].b64_json;
  return null;
}

/**
 * FLUX shell image ingest — assist only.
 *
 * @param {object} opts
 * @param {string} [opts.imagePath]
 * @param {string} [opts.imageBase64]
 * @param {string} [opts.prompt]
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.forceStub]
 * @param {string} [opts.model]
 * @param {number} [opts.strength]
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {number} [opts.steps]
 * @param {number} [opts.seed]
 * @param {typeof fetch} [opts.fetchImpl] — inject for tests
 * @returns {Promise<object>}
 */
export async function fluxGenerate(opts = {}) {
  const mode = opts.mode || "lookdev-from-image";
  const prompt =
    opts.prompt ||
    "look-dev concept enhancement from reference still (assist only; not print SoT)";
  const endpoint = resolveFluxEndpoint({ model: opts.model });
  const loaded = loadImageBase64(opts);

  if (!loaded.ok) {
    return {
      ...buildFluxStub({
        mode,
        prompt,
        endpoint,
        code: loaded.code,
        message: loaded.message,
        imageIngested: false,
      }),
      ok: false,
    };
  }

  const dryRun = opts.dryRun === true || opts.forceStub === true;
  const apiKey = resolveApiKey();

  if (dryRun || !apiKey) {
    return buildFluxStub({
      mode,
      prompt,
      endpoint,
      imageIngested: true,
      imageSource: loaded.source,
      code: dryRun ? "FLUX_DRY_RUN" : "FLUX_MISSING_API_KEY",
      message: dryRun
        ? "Dry-run: image loaded; NIM POST skipped (assistOnly stub)"
        : "NVIDIA_API_KEY (or NVIDIA_NIM_API_KEY / NGC_API_KEY) missing — assistOnly stub; constitutional print path untouched",
    });
  }

  const width = opts.width ?? 1024;
  const height = opts.height ?? 1024;
  const steps = opts.steps ?? 4;
  const seed = opts.seed ?? 0;
  const strength = opts.strength ?? 0.55;

  const payload = {
    prompt,
    image: loaded.base64,
    strength,
    width,
    height,
    seed,
    steps,
    num_inference_steps: steps,
  };

  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return buildFluxStub({
      mode,
      prompt,
      endpoint,
      imageIngested: true,
      imageSource: loaded.source,
      code: "FLUX_NO_FETCH",
      message: "fetch unavailable — assistOnly stub",
    });
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.NIM_FLUX_TIMEOUT_MS || 180_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "NVCF-POLL-SECONDS": String(
          process.env.GENBLAZE_NVCF_POLL_SECONDS || "180",
        ),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { _raw: text.slice(0, 500) };
    }

    if (response.status === 400 || response.status === 422) {
      return {
        ok: true,
        live: true,
        assistOnly: true,
        nonAuthoritative: true,
        status: "partial",
        code: "FLUX_IMAGE_REJECTED_T2I",
        capabilityId: "gpu.gen.nvidia.nim_flux",
        mode,
        message:
          "NIM rejected image payload (likely T2I-only). Image was ingested locally; no print SoT claim. Assist stub continues.",
        httpStatus: response.status,
        imageIngested: true,
        imageSource: loaded.source,
        inputBase64Length: loaded.base64.length,
        prompt,
        endpoint,
        responsePreview: text.slice(0, 400),
        provenanceKind: "assistProvenance",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        live: true,
        assistOnly: true,
        nonAuthoritative: true,
        status: "partial",
        code: "FLUX_HTTP_ERROR",
        capabilityId: "gpu.gen.nvidia.nim_flux",
        mode,
        message: `NIM FLUX HTTP ${response.status}`,
        httpStatus: response.status,
        imageIngested: true,
        imageSource: loaded.source,
        prompt,
        endpoint,
        responsePreview: text.slice(0, 400),
        provenanceKind: "assistProvenance",
      };
    }

    const outB64 = extractOutputBase64(body);
    return {
      ok: true,
      live: true,
      assistOnly: true,
      nonAuthoritative: true,
      status: "partial",
      code: "FLUX_OK",
      capabilityId: "gpu.gen.nvidia.nim_flux",
      mode,
      message: "NIM FLUX image ingest assist completed (not print SoT)",
      httpStatus: response.status,
      imageIngested: true,
      imageSource: loaded.source,
      inputBase64Length: loaded.base64.length,
      outputBase64: outB64,
      outputBase64Length: outB64 ? outB64.length : 0,
      prompt,
      endpoint,
      provenanceKind: "assistProvenance",
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      live: false,
      assistOnly: true,
      nonAuthoritative: true,
      status: "partial",
      code: "FLUX_TRANSPORT_ERROR",
      capabilityId: "gpu.gen.nvidia.nim_flux",
      mode,
      message: `NIM FLUX transport error: ${err instanceof Error ? err.message : String(err)}`,
      imageIngested: true,
      imageSource: loaded.source,
      prompt,
      endpoint,
      provenanceKind: "assistProvenance",
    };
  }
}

export default { fluxGenerate, buildFluxStub, loadImageBase64, resolveFluxEndpoint };
