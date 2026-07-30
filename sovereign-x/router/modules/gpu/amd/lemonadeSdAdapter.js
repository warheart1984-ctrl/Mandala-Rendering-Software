/**
 * Lemonade SD adapter for MRS / Sovereign-X (legacy-efficient beauty assist).
 *
 * Calls Lemonade Server OpenAI-compatible images API at
 * http://127.0.0.1:13305/api/v1 (override: LEMONADE_BASE_URL / LEMONADE_HOST+PORT).
 *
 * STATUS: **partial**
 * - Adapter + probe + retries + capability reporting: implemented
 * - Weight checksum + provenance evidence gate: **partial** (helps lawful
 *   execution; does NOT claim provenance was the root halt cause)
 * - Live SD still on this R9 380 + FX-8350 host: often **degraded**
 *   (sd-cpp ROCm unsupported for Tonga; Vulkan/CPU sd-cli hit
 *   STATUS_ILLEGAL_INSTRUCTION / AVX2 builds; Lemonade returns model_load_error)
 * - CCC-ImageGen: missing GPU does **not** BLOCK capability — provider cascade
 *   (local.gpu → local.cpu → remote.*) with constitutional fallback log.
 *
 * Drive-G-1: never claim enforced photoreal diffusion on unsupported hosts.
 * Assist-only; never Digital Printer SoT.
 */

import { createHash } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import {
  attemptImageGenWithFallback,
  buildConstitutionalImageGenLog,
  selectImageGenProvider,
} from "./ImageGenProvider.js";

export const ADAPTER_ID = "sx.adapter.lemonade.sd";
export const DEFAULT_BASE = "http://127.0.0.1:13305/api/v1";

/** Preferred model cascade for legacy / low-VRAM hosts (smallest first). */
export const MODEL_CASCADE = [
  "SD-Turbo-GGUF",
  "SD-Turbo",
  "SDXL-Turbo",
  "SD-1.5",
  "SDXL-Base-1.0",
];

/**
 * Optional expected SHA-256 digests for known weight files.
 * Populate via env LEMONADE_WEIGHT_SHA256_JSON or pass to verify.
 * Empty by default — presence+readable file yields checksumOk when no expect set.
 *
 * @type {Record<string, string>}
 */
export const DEFAULT_EXPECTED_WEIGHT_SHA256 = Object.freeze({});

/**
 * @returns {string}
 */
export function resolveLemonadeBaseUrl(env = process.env) {
  const explicit = String(env.LEMONADE_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const host = String(env.LEMONADE_HOST || "127.0.0.1").trim() || "127.0.0.1";
  const port = String(env.LEMONADE_PORT || "13305").trim() || "13305";
  return `http://${host}:${port}/api/v1`;
}

/**
 * Candidate directories where Lemonade / HF may store SD weights.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function lemonadeWeightSearchRoots(env = process.env) {
  const home = homedir();
  const extras = String(env.LEMONADE_WEIGHT_ROOTS || "")
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [
    ...extras,
    env.LEMONADE_MODELS_DIR,
    join(home, ".cache", "lemonade"),
    join(home, ".cache", "huggingface", "hub"),
    join(home, ".lemonade", "models"),
    join(home, "AppData", "Local", "lemonade"),
    join(home, "AppData", "Local", "Lemonade"),
  ].filter((p) => typeof p === "string" && p.length > 0);
}

/**
 * @param {string} root
 * @param {string} modelId
 * @param {number} [maxDepth]
 * @returns {string[]}
 */
function walkFindModelFiles(root, modelId, maxDepth = 5) {
  /** @type {string[]} */
  const hits = [];
  if (!existsSync(root)) return hits;
  const needle = modelId.toLowerCase().replace(/[^a-z0-9]+/g, "");
  /** @param {string} dir @param {number} depth */
  function walk(dir, depth) {
    if (depth > maxDepth || hits.length >= 8) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        const nameN = ent.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
        if (nameN.includes(needle) || needle.includes(nameN) || depth < 2) {
          walk(full, depth + 1);
        }
      } else if (/\.(gguf|safetensors|onnx|bin|ckpt)$/i.test(ent.name)) {
        const pathN = full.toLowerCase().replace(/[^a-z0-9]+/g, "");
        if (pathN.includes(needle) || ent.name.toLowerCase().includes(modelId.toLowerCase())) {
          hits.push(full);
        }
      }
    }
  }
  walk(root, 0);
  return hits;
}

/**
 * Locate weight files for a model id on disk (best-effort).
 * @param {string} modelId
 * @param {object} [opts]
 */
export function locateModelWeightFiles(modelId, opts = {}) {
  const env = opts.env || process.env;
  const roots = lemonadeWeightSearchRoots(env);
  /** @type {string[]} */
  const files = [];
  if (opts.weightPath) {
    const p = resolve(String(opts.weightPath));
    if (existsSync(p)) files.push(p);
  }
  for (const root of roots) {
    for (const hit of walkFindModelFiles(root, modelId)) {
      if (!files.includes(hit)) files.push(hit);
    }
  }
  return files;
}

/**
 * @param {string} filePath
 * @returns {string} hex sha256
 */
export function sha256File(filePath) {
  const buf = readFileSync(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Classify a Lemonade error / probe into halt cause classes.
 * Drive-G-1: do not blame provenance unless evidence says so.
 *
 * @param {object} [input]
 * @returns {"provenance"|"sd_server"|"avx2"|"rocm_unsupported"|"unreachable"|"unknown"}
 */
export function classifyLemonadeHaltCause(input = {}) {
  const msg = String(input.message || input.error || "").toLowerCase();
  const code = String(input.code || "").toLowerCase();
  if (input.serverUp === false || /econnrefused|unreachable|fetch failed|aborted/.test(msg)) {
    return "unreachable";
  }
  if (
    code === "weight_checksum_mismatch" ||
    code === "weight_missing" ||
    code === "provenance_denied" ||
    /checksum|provenance|lawful evidence|integrity/.test(msg)
  ) {
    return "provenance";
  }
  if (/illegal_instruction|0xc000001d|avx2|avx /.test(msg)) {
    return "avx2";
  }
  if (/tonga|r9\s*380|rocm unsupported|gfx803|unsupported.*rocm/.test(msg)) {
    return "rocm_unsupported";
  }
  if (
    /sd-server failed to start|model_load_error|failed to load model|become ready/.test(msg) ||
    code === "model_load_error"
  ) {
    return "sd_server";
  }
  return "unknown";
}

/**
 * Verify weight checksums and mark lawful provenance evidence before generate.
 *
 * @param {object} opts
 * @param {string} opts.modelId
 * @param {string} [opts.weightPath]
 * @param {Record<string,string>} [opts.expectedSha256] map modelId|basename → hex
 * @param {boolean} [opts.requireExpected=false] fail if no expected digest configured
 * @returns {object}
 */
export function verifyModelWeightsProvenance(opts = {}) {
  const modelId = String(opts.modelId || "").trim();
  if (!modelId) {
    return {
      ok: false,
      lawful: false,
      checksumOk: false,
      code: "MODEL_ID_REQUIRED",
      status: "blocked",
      haltCauseClass: "provenance",
      message: "modelId required for weight provenance verification",
      adapterId: ADAPTER_ID,
    };
  }

  let expected = { ...DEFAULT_EXPECTED_WEIGHT_SHA256, ...(opts.expectedSha256 || {}) };
  const envJson = String(opts.env?.LEMONADE_WEIGHT_SHA256_JSON || process.env.LEMONADE_WEIGHT_SHA256_JSON || "").trim();
  if (envJson) {
    try {
      expected = { ...expected, ...JSON.parse(envJson) };
    } catch {
      // ignore bad env JSON
    }
  }

  const files = locateModelWeightFiles(modelId, opts);
  if (!files.length) {
    return {
      ok: false,
      lawful: false,
      checksumOk: false,
      code: "WEIGHT_MISSING",
      status: "partial",
      haltCauseClass: "provenance",
      message: `No weight files found for ${modelId} under Lemonade/HF cache roots (catalog may still show downloaded)`,
      adapterId: ADAPTER_ID,
      modelId,
      files: [],
      searchRoots: lemonadeWeightSearchRoots(opts.env || process.env),
      provenanceRecord: null,
      note: "Missing local weight path ≠ proof that Lemonade catalog is wrong; Lemonade may store elsewhere.",
    };
  }

  /** @type {object[]} */
  const fileReports = [];
  for (const file of files.slice(0, 4)) {
    const st = statSync(file);
    const digest = sha256File(file);
    const base = file.replace(/^.*[\\/]/, "");
    const expect =
      expected[modelId] ||
      expected[base] ||
      null;
    const match = expect ? expect.replace(/^sha256:/i, "").toLowerCase() === digest.toLowerCase() : null;
    fileReports.push({
      path: file,
      bytes: st.size,
      sha256: digest,
      expected: expect || null,
      match,
    });
  }

  const hasMismatch = fileReports.some((f) => f.match === false);
  const missingExpect = opts.requireExpected && fileReports.every((f) => !f.expected);
  const lawful = !hasMismatch && !missingExpect && fileReports.length > 0;
  const checksumOk = lawful && !hasMismatch;

  const provenanceRecord = {
    assetId: `lemonade-weight:${modelId}`,
    kind: "model-weights",
    source: {
      type: "file",
      uri: fileReports[0]?.path,
      originalHash: fileReports[0] ? `sha256:${fileReports[0].sha256}` : undefined,
    },
    transforms: [
      {
        type: "checksum-verify",
        timestamp: new Date().toISOString(),
        details: {
          adapterId: ADAPTER_ID,
          modelId,
          checksumOk,
          filesChecked: fileReports.length,
        },
      },
    ],
    usage: [],
    lawful,
    status: lawful ? "partial" : "blocked",
    note: "Evidence record (checksum + path) — not a charter PKI signature",
  };

  return {
    ok: lawful,
    lawful,
    checksumOk,
    code: lawful ? "WEIGHTS_LAWFUL" : hasMismatch ? "WEIGHT_CHECKSUM_MISMATCH" : "WEIGHT_PROVENANCE_INCOMPLETE",
    status: lawful ? "partial" : "blocked",
    haltCauseClass: lawful ? undefined : "provenance",
    message: lawful
      ? `Weights for ${modelId} verified and marked lawful evidence (checksum gate partial)`
      : `Weight provenance gate denied lawful mark for ${modelId}`,
    adapterId: ADAPTER_ID,
    modelId,
    files: fileReports,
    provenanceRecord,
  };
}

/**
 * @param {string} base
 * @param {Record<string, string>} [extra]
 */
function authHeaders(env = process.env, extra = {}) {
  const headers = { Accept: "application/json", ...extra };
  const key = String(env.LEMONADE_API_KEY || "").trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/**
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number }} [opts]
 */
async function fetchJson(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: { ...authHeaders(), ...(opts.headers || {}) },
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 800) };
    }
    return { ok: res.ok, status: res.status, body, text };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Probe health, models, and known host limits.
 * Does not load heavy SD models.
 *
 * @param {object} [opts]
 */
export async function probeLemonadeCapabilities(opts = {}) {
  const base = resolveLemonadeBaseUrl(opts.env);
  const healthUrl = `${base}/health`;
  const modelsUrl = `${base}/models`;
  const systemUrl = `${base}/system-info`;

  /** @type {any} */
  const report = {
    adapterId: ADAPTER_ID,
    status: "partial",
    baseUrl: base,
    serverUp: false,
    health: null,
    models: [],
    imageModels: [],
    downloadedImageModels: [],
    system: null,
    backendsHint: {
      sdcpp: {
        preferred: "cpu",
        note:
          "On R9 380 (Tonga) Lemonade marks sd-cpp ROCm unsupported. Prefer `lemonade config set sdcpp.backend=cpu` then probe; FX-8350 hosts may still fail AVX2 sd-cpp binaries (0xC000001D).",
      },
    },
    generationCapable: false,
    blockers: [],
    weightProvenance: null,
    haltCauseClass: null,
    capturedAt: new Date().toISOString(),
  };

  try {
    const health = await fetchJson(healthUrl, { timeoutMs: 5000 });
    report.health = { status: health.status, body: health.body };
    report.serverUp = health.status > 0 && health.status < 500;
  } catch (err) {
    report.blockers.push({
      code: "LEMONADE_UNREACHABLE",
      message: err instanceof Error ? err.message : String(err),
    });
    report.status = "blocked";
    report.haltCauseClass = "unreachable";
    return report;
  }

  try {
    const models = await fetchJson(modelsUrl, { timeoutMs: 10_000 });
    const data = Array.isArray(models.body?.data) ? models.body.data : [];
    report.models = data.map((m) => ({
      id: m.id,
      recipe: m.recipe,
      downloaded: !!m.downloaded,
      labels: m.labels || [],
      size: m.size,
    }));
    report.imageModels = report.models.filter(
      (m) =>
        (m.labels || []).includes("image") ||
        (m.labels || []).includes("upscaling") ||
        String(m.recipe || "").includes("sd"),
    );
    report.downloadedImageModels = report.imageModels
      .filter((m) => m.downloaded)
      .map((m) => m.id);
  } catch (err) {
    report.blockers.push({
      code: "LEMONADE_MODELS_PROBE_FAILED",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const sys = await fetchJson(systemUrl, { timeoutMs: 10_000 });
    if (sys.ok) {
      report.system = {
        processor: sys.body?.Processor || sys.body?.cpu?.name,
        amdGpu: sys.body?.devices?.amd_gpu || null,
        recipesSdCpp: sys.body?.recipes?.["sd-cpp"] || sys.body?.recipes?.sdcpp || null,
      };
      const amd = Array.isArray(report.system.amdGpu) ? report.system.amdGpu[0] : null;
      if (amd && /r9\s*380|tonga/i.test(String(amd.name || ""))) {
        report.blockers.push({
          code: "HOST_LEGACY_GCN",
          message:
            "AMD R9 380 / Tonga detected — outside Lemonade sd-cpp ROCm gfx families (RDNA2+).",
        });
      }
    }
  } catch {
    // system-info optional
  }

  if (!report.downloadedImageModels.length) {
    report.blockers.push({
      code: "NO_IMAGE_MODEL_DOWNLOADED",
      message: "Run: lemonade pull SD-Turbo-GGUF (or SD-Turbo)",
    });
  }

  if (opts.verifyWeights !== false && report.downloadedImageModels.length) {
    const mid = String(opts.model || report.downloadedImageModels[0]);
    report.weightProvenance = verifyModelWeightsProvenance({
      modelId: mid,
      env: opts.env,
      expectedSha256: opts.expectedSha256,
      weightPath: opts.weightPath,
      requireExpected: opts.requireExpected,
    });
  }

  report.generationCapable = false;
  report.status = report.serverUp ? "partial" : "blocked";
  return report;
}

/**
 * Attempt image generation with model cascade + retries.
 * Runs weight provenance gate first when `requireLawfulWeights` is true (default).
 *
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.model]
 * @param {string} [opts.size]
 * @param {number} [opts.steps]
 * @param {number} [opts.retries]
 * @param {string} [opts.outPath] write PNG if successful
 * @param {boolean} [opts.requireLawfulWeights=true]
 * @returns {Promise<object>}
 */
export async function generateStillViaLemonade(opts = {}) {
  const prompt = String(opts.prompt || "").trim();
  if (!prompt) {
    return {
      ok: false,
      code: "PROMPT_REQUIRED",
      status: "blocked",
      adapterId: ADAPTER_ID,
      message: "prompt required for Lemonade still",
      haltCauseClass: "unknown",
    };
  }

  const base = resolveLemonadeBaseUrl(opts.env);
  const size = String(opts.size || "512x512");
  const steps = Number.isFinite(opts.steps) ? opts.steps : 4;
  const retries = Math.max(1, Math.min(4, opts.retries ?? 2));
  const maxModels = Math.max(1, Math.min(MODEL_CASCADE.length, opts.maxModels ?? 3));
  const cascade = (opts.model
    ? [String(opts.model), ...MODEL_CASCADE.filter((m) => m !== opts.model)]
    : [...MODEL_CASCADE]
  ).slice(0, maxModels);

  const requireLawful = opts.requireLawfulWeights !== false;
  /** @type {object[]} */
  const provenanceGates = [];

  if (requireLawful) {
    for (const model of cascade) {
      const gate = verifyModelWeightsProvenance({
        modelId: model,
        env: opts.env,
        expectedSha256: opts.expectedSha256,
        weightPath: opts.weightPath,
        requireExpected: opts.requireExpected === true,
      });
      provenanceGates.push(gate);
      if (gate.code === "WEIGHT_CHECKSUM_MISMATCH") {
        return {
          ok: false,
          status: "blocked",
          adapterId: ADAPTER_ID,
          code: "PROVENANCE_DENIED",
          message: gate.message,
          haltCauseClass: "provenance",
          provenanceGates,
          assistOnly: true,
          nonAuthoritative: true,
        };
      }
    }
  }

  const attempts = [];
  let lastError = null;

  for (const model of cascade) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      const body = {
        model,
        prompt,
        size,
        steps,
        cfg_scale: 1.0,
        response_format: "b64_json",
        n: 1,
      };
      const url = `${base}/images/generations`;
      const started = Date.now();
      try {
        const res = await fetchJson(url, {
          method: "POST",
          timeoutMs: opts.timeoutMs ?? 45_000,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const elapsedMs = Date.now() - started;
        const errMsg =
          res.body?.error?.message ||
          res.body?.message ||
          (typeof res.body?.raw === "string" ? res.body.raw : null) ||
          `HTTP ${res.status}`;

        attempts.push({
          model,
          attempt,
          status: res.status,
          elapsedMs,
          ok: res.ok,
          error: res.ok ? null : errMsg,
        });

        if (!res.ok) {
          lastError = {
            code: res.body?.error?.code || "LEMONADE_HTTP_ERROR",
            message: errMsg,
            model,
            status: res.status,
          };
          if (attempt < retries && res.status >= 500) {
            await new Promise((r) => setTimeout(r, 250 * attempt));
            continue;
          }
          break;
        }

        const b64 = res.body?.data?.[0]?.b64_json;
        if (!b64) {
          lastError = {
            code: "LEMONADE_EMPTY_IMAGE",
            message: "response missing data[0].b64_json",
            model,
          };
          break;
        }

        const png = Buffer.from(b64, "base64");
        const sha256 = createHash("sha256").update(png).digest("hex");
        let outPath = null;
        if (opts.outPath) {
          outPath = resolve(String(opts.outPath));
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, png);
        }

        return {
          ok: true,
          status: "partial",
          adapterId: ADAPTER_ID,
          provider: "lemonade-local",
          model,
          size,
          steps,
          byteLength: png.length,
          sha256,
          outPath,
          attempts,
          provenanceGates,
          assistOnly: true,
          nonAuthoritative: true,
          haltCauseClass: null,
          message: `Lemonade still generated via ${model}`,
          pngBase64: opts.includeBase64 ? b64 : undefined,
        };
      } catch (err) {
        const elapsedMs = Date.now() - started;
        const message = err instanceof Error ? err.message : String(err);
        attempts.push({
          model,
          attempt,
          status: 0,
          elapsedMs,
          ok: false,
          error: message,
        });
        lastError = { code: "LEMONADE_FETCH_ERROR", message, model };
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 250 * attempt));
        }
      }
    }
  }

  const haltCauseClass = classifyLemonadeHaltCause(lastError || {});

  // CCC-ImageGen: local GPU/sd-server failure is degraded — not architecture-blocked.
  return {
    ok: false,
    status: "degraded",
    adapterId: ADAPTER_ID,
    provider: "lemonade-local",
    code: lastError?.code || "LEMONADE_SD_DEGRADED",
    message:
      lastError?.message ||
      "All Lemonade SD model attempts failed on this host (degraded; capability may fall through providers)",
    lastError,
    attempts,
    provenanceGates,
    haltCauseClass,
    assistOnly: true,
    nonAuthoritative: true,
    blockedOnGpu: false,
    hostHints: {
      r9_380:
        "sd-cpp ROCm unsupported for Tonga; Vulkan/CPU Lemonade binaries may crash with ILLEGAL_INSTRUCTION on FX-8350 (AVX2).",
      remediation:
        "Fall through CCC-ImageGen providers (local.cpu / remote.*), OpenCL legacy still, or run Lemonade SD on a ROCm/RDNA2+ or AVX2 host.",
      provenanceNote:
        "Checksum/provenance gate is separate from sd-server start failures. Do not claim provenance as root cause when haltCauseClass is sd_server/avx2/rocm_unsupported.",
    },
  };
}

/**
 * CCC-ImageGen entry: select provider, attempt local.gpu Lemonade, fall through
 * without halting solely for missing GPU. Logs constitutional JSON.
 *
 * @param {object} opts — same as generateStillViaLemonade plus provider opts
 * @returns {Promise<object>}
 */
export async function generateStillViaImageGenProviders(opts = {}) {
  const env = opts.env || process.env;
  let localGpuAvailable = opts.localGpuAvailable;
  if (typeof localGpuAvailable !== "boolean") {
    const probe = await probeLemonadeCapabilities({
      env,
      verifyWeights: false,
    });
    // Server up ≠ GPU capable; treat known sd-server/host blockers as GPU-down.
    const hostGpuBlocked = (probe.blockers || []).some((b) =>
      ["HOST_LEGACY_GCN", "LEMONADE_UNREACHABLE"].includes(b.code),
    );
    localGpuAvailable = !!probe.serverUp && !hostGpuBlocked;
    if (opts.assumeGpuDown === true) localGpuAvailable = false;
  }

  const selection = selectImageGenProvider(env, { localGpuAvailable });
  const constitutionalLog = selection.log;

  const cascade = await attemptImageGenWithFallback({
    ...opts,
    env,
    localGpuAvailable,
    localGpuGenerateFn: async (inner) =>
      generateStillViaLemonade({
        ...opts,
        ...inner,
        env: inner.env || env,
      }),
    localCpuGenerateFn: async (inner) =>
      generateStillViaLemonade({
        ...opts,
        ...inner,
        env: {
          ...(inner.env || env),
          LEMONADE_SDCPP_BACKEND: "cpu",
        },
      }),
  });

  return {
    ...cascade,
    adapterId: ADAPTER_ID,
    constitutionalLog: cascade.constitutionalLog || constitutionalLog,
    selection: cascade.selection || selection,
    imagesStatus: cascade.pixelsProduced
      ? cascade.fallbackUsed
        ? `Provided via fallback (${cascade.imageGenProvider})`
        : `Provided via ${cascade.imageGenProvider}`
      : cascade.status === "invariant_fail"
        ? "invariant_fail: zero providers"
        : "degraded/partial — no pixels (not architecture-blocked-on-GPU)",
  };
}

/**
 * Full capability report for proofs / SX route embedding.
 * CCC-ImageGen: include provider selection + fallback log; never claim
 * architecture-blocked-on-GPU when providers remain available.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.tryGenerate=false]
 * @param {string} [opts.prompt]
 * @param {string} [opts.outPath]
 */
export async function reportLemonadeSdCapability(opts = {}) {
  const probe = await probeLemonadeCapabilities(opts);
  const hostGpuBlocked = (probe.blockers || []).some((b) =>
    ["HOST_LEGACY_GCN", "LEMONADE_UNREACHABLE"].includes(b.code),
  );
  const localGpuAvailable =
    opts.localGpuAvailable === false
      ? false
      : opts.assumeGpuDown === true
        ? false
        : !!probe.serverUp && !hostGpuBlocked;

  const selection = selectImageGenProvider(opts.env || process.env, {
    localGpuAvailable,
  });

  /** @type {any} */
  const out = {
    ...probe,
    generate: null,
    cccImageGen: {
      capability: "image.gen.provider",
      selection,
      constitutionalLog: selection.log,
    },
  };

  if (opts.tryGenerate) {
    const gen = opts.useProviderCascade
      ? await generateStillViaImageGenProviders({
          prompt:
            opts.prompt ||
            "simple red ceramic sphere on white table, soft light, photoreal still",
          size: opts.size || "512x512",
          steps: opts.steps ?? 4,
          outPath: opts.outPath,
          model: opts.model,
          retries: opts.retries ?? 2,
          maxModels: opts.maxModels ?? 3,
          timeoutMs: opts.timeoutMs,
          env: opts.env,
          requireLawfulWeights: opts.requireLawfulWeights,
          expectedSha256: opts.expectedSha256,
          weightPath: opts.weightPath,
          localGpuAvailable,
          assumeGpuDown: opts.assumeGpuDown,
        })
      : await generateStillViaLemonade({
          prompt:
            opts.prompt ||
            "simple red ceramic sphere on white table, soft light, photoreal still",
          size: opts.size || "512x512",
          steps: opts.steps ?? 4,
          outPath: opts.outPath,
          model: opts.model,
          retries: opts.retries ?? 2,
          maxModels: opts.maxModels ?? 3,
          timeoutMs: opts.timeoutMs,
          env: opts.env,
          requireLawfulWeights: opts.requireLawfulWeights,
          expectedSha256: opts.expectedSha256,
          weightPath: opts.weightPath,
        });
    out.generate = gen;
    out.generationCapable = !!gen.ok || !!gen.pixelsProduced;
    out.haltCauseClass = gen.haltCauseClass || gen.result?.haltCauseClass || null;
    out.constitutionalLog =
      gen.constitutionalLog ||
      buildConstitutionalImageGenLog({
        imageGenProvider: selection.selected,
        localGpuAvailable,
        fallbackUsed: selection.fallbackUsed,
        reason: selection.reason,
      });

    if (gen.ok || gen.pixelsProduced) {
      out.status = "partial";
      out.imagesStatus = gen.imagesStatus ||
        (gen.fallbackUsed
          ? `Provided via fallback (${gen.imageGenProvider})`
          : `Provided via ${gen.imageGenProvider || "lemonade-local"}`);
      out.blockers = (out.blockers || []).filter(
        (b) =>
          b.code !== "LEMONADE_SD_BLOCKED" && b.code !== "LEMONADE_SD_DEGRADED",
      );
    } else {
      const code = gen.code || "LEMONADE_SD_DEGRADED";
      out.blockers = [
        ...(out.blockers || []),
        {
          code,
          message: gen.message || gen.imagesStatus,
          haltCauseClass: out.haltCauseClass,
          blockedOnGpu: false,
        },
      ];
      // Providers available → degraded/partial, never architecture-blocked-on-GPU
      out.status =
        selection.invariantOk || probe.serverUp ? "degraded" : "invariant_fail";
      out.imagesStatus =
        gen.imagesStatus ||
        (selection.fallbackUsed
          ? "Provided via fallback … (no pixels; degraded)"
          : "degraded/partial — no pixels (not architecture-blocked-on-GPU)");
    }
  } else {
    out.constitutionalLog = selection.log;
    out.imagesStatus = selection.invariantOk
      ? selection.fallbackUsed
        ? `Provided via fallback (${selection.selected}) — probe only`
        : `Provider ${selection.selected} available — probe only`
      : "invariant_fail: zero providers";
    out.status = selection.invariantOk
      ? probe.serverUp
        ? "partial"
        : "degraded"
      : "invariant_fail";
  }

  return out;
}

/**
 * Convenience: write JSON capability report.
 */
export async function writeCapabilityReport(outPath, opts = {}) {
  const report = await reportLemonadeSdCapability(opts);
  const path = resolve(outPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
  return { path, report, exists: existsSync(path) };
}

export default {
  ADAPTER_ID,
  MODEL_CASCADE,
  DEFAULT_EXPECTED_WEIGHT_SHA256,
  resolveLemonadeBaseUrl,
  lemonadeWeightSearchRoots,
  locateModelWeightFiles,
  sha256File,
  classifyLemonadeHaltCause,
  verifyModelWeightsProvenance,
  probeLemonadeCapabilities,
  generateStillViaLemonade,
  generateStillViaImageGenProviders,
  reportLemonadeSdCapability,
  writeCapabilityReport,
};
