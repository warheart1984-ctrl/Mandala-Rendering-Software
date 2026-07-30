/**
 * Lemonade SDK Live Chat Adapter — first-class OpenAI-compatible client.
 *
 * Wraps Lemonade Server's OpenAI surface (`/api/v1` or `/v1`):
 *   connect · listModels · ensureModel (POST /pull) · chat.completions · stream
 *
 * Default base probe order (when env unset):
 *   1. http://localhost:8000/api/v1   (SDK docs / older pastes)
 *   2. http://localhost:13305/api/v1  (official Lemonade Server)
 *
 * Prefer small GGUF + llamacpp:vulkan on FX-8350 / R9 380 (avoid AVX2-only CPU
 * binaries that fail with ILLEGAL_INSTRUCTION on pre-Haswell hosts).
 *
 * Distinct from lemonadeSdAdapter.js (images/SD multimodal).
 *
 * STATUS: **partial** — live chat when server up + LLM downloaded + backend ready.
 * Vendor pin: docs/4d-engine/proofs/legacy-efficient/upstream-vendor-pins.json
 *
 * Drive-G-1: never claim enforced local LLM when server down or no LLM model.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import net from "node:net";

export const ADAPTER_ID = "sx.adapter.lemonade.sdk.chat";
export const PROVIDER_ID = "lemonade-sdk";

/**
 * Preferred small instruct GGUF for legacy hosts (CPU/Vulkan).
 * Llama-3.2-1B-Instruct produces clean replies on R9 380 Vulkan.
 * Qwen3-0.6B-GGUF also pulls (~0.4GB) but is a reasoning model and may emit
 * empty/garbled content on this host — keep as fallback candidate only.
 */
export const DEFAULT_CHAT_MODEL = "Llama-3.2-1B-Instruct-GGUF";

/** Ordered fallbacks when ensuring a chat model on constrained hosts. */
export const PREFERRED_CHAT_MODELS = [
  "Llama-3.2-1B-Instruct-GGUF",
  "Bonsai-1.7B-gguf",
  "Qwen3-0.6B-GGUF",
];

/** Probe order: docs paste (:8000) then official Lemonade Server (:13305). */
export const DEFAULT_BASE_CANDIDATES = [
  "http://localhost:8000/api/v1",
  "http://localhost:13305/api/v1",
];

/**
 * Cheap TCP check before fetch — avoids undici hang/crash on closed ports (Win).
 * @param {string} baseUrl
 * @param {number} [timeoutMs]
 */
export function tcpReachable(baseUrl, timeoutMs = 800) {
  let host = "127.0.0.1";
  let port = 80;
  try {
    const u = new URL(baseUrl);
    host = u.hostname === "localhost" ? "127.0.0.1" : u.hostname || host;
    port = Number(u.port) || (u.protocol === "https:" ? 443 : 80);
  } catch {
    return Promise.resolve(false);
  }
  return new Promise((resolveOk) => {
    const socket = net.connect({ host, port });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolveOk(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
  });
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {string[]}
 */
export function resolveLemonadeSdkBaseCandidates(env = process.env) {
  const explicit = String(
    env.LEMONADE_SDK_BASE_URL || env.LEMONADE_LLM_BASE_URL || "",
  ).trim();
  if (explicit) return [explicit.replace(/\/$/, "")];

  const port = String(env.LEMONADE_SDK_PORT || "").trim();
  if (port) {
    const host =
      String(env.LEMONADE_SDK_HOST || env.LEMONADE_HOST || "localhost").trim() ||
      "localhost";
    return [`http://${host}:${port}/api/v1`];
  }

  return [...DEFAULT_BASE_CANDIDATES];
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {Record<string, string>} [extra]
 */
export function authHeaders(env = process.env, extra = {}) {
  const headers = { Accept: "application/json", ...extra };
  const key = String(
    env.LEMONADE_SDK_API_KEY || env.LEMONADE_API_KEY || "",
  ).trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/**
 * Normalize model list entry.
 * @param {any} m
 */
export function mapModel(m) {
  return {
    id: m.id,
    recipe: m.recipe || null,
    downloaded: !!m.downloaded,
    labels: m.labels || [],
    size: m.size,
  };
}

/**
 * Heuristic: LLM-capable catalog entries.
 * @param {{ id: string, recipe?: string | null, labels?: string[] }} m
 */
export function isLlmModel(m) {
  const labels = m.labels || [];
  if (
    labels.includes("llm") ||
    labels.includes("chat") ||
    labels.includes("coding")
  ) {
    return true;
  }
  const recipe = String(m.recipe || "").toLowerCase();
  if (
    /llama|oga|vllm|ryzenai|flm|onnx|gguf/.test(recipe) &&
    !/sd|whisper|kokoro|moonshine|esrgan/.test(recipe)
  ) {
    return true;
  }
  const id = String(m.id || "");
  if (
    /-GGUF$/i.test(id) &&
    !/^SD/i.test(id) &&
    !/Whisper|kokoro|RealESRGAN|Moonshine/i.test(id)
  ) {
    return true;
  }
  return false;
}

/**
 * Structured error helper.
 * @param {string} code
 * @param {string} message
 * @param {object} [extra]
 */
export function sdkError(code, message, extra = {}) {
  return {
    ok: false,
    status: "blocked",
    adapterId: ADAPTER_ID,
    provider: PROVIDER_ID,
    code,
    message,
    ...extra,
  };
}

/**
 * @typedef {object} FetchJsonResult
 * @property {boolean} ok
 * @property {number} status
 * @property {any} body
 * @property {string} text
 * @property {Headers} [headers]
 */

/**
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number, env?: object, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<FetchJsonResult>}
 */
export async function fetchJson(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const env = opts.env || process.env;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  let timer = null;
  const { timeoutMs: _tm, env: _env, fetchImpl: _fi, ...fetchOpts } = opts;
  try {
    const res = await Promise.race([
      fetchImpl(url, {
        ...fetchOpts,
        headers: { ...authHeaders(env), ...(opts.headers || {}) },
      }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timeout after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 800) };
    }
    return { ok: res.ok, status: res.status, body, text, headers: res.headers };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * First-class Lemonade SDK chat client.
 */
export class LemonadeSdkChatClient {
  /**
   * @param {object} [opts]
   * @param {string} [opts.baseUrl]
   * @param {string[]} [opts.bases]
   * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [opts.env]
   * @param {typeof fetch} [opts.fetchImpl] injectable for unit tests
   * @param {number} [opts.timeoutMs]
   * @param {number} [opts.tcpTimeoutMs]
   */
  constructor(opts = {}) {
    this.env = opts.env || process.env;
    this.fetchImpl = opts.fetchImpl || globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.tcpTimeoutMs = opts.tcpTimeoutMs ?? 800;
    this.baseUrl = opts.baseUrl ? String(opts.baseUrl).replace(/\/$/, "") : null;
    this.bases =
      opts.bases ||
      (this.baseUrl
        ? [this.baseUrl]
        : resolveLemonadeSdkBaseCandidates(this.env));
    this.connected = false;
    this.health = null;
    this.lastProbe = null;
  }

  /**
   * Resolve a reachable OpenAI-compatible base URL.
   * @param {object} [opts]
   */
  async connect(opts = {}) {
    const bases = opts.bases || this.bases;
    // Custom fetchImpl (unit tests) skips TCP by default.
    const useTcp =
      opts.skipTcp !== true && this.fetchImpl === globalThis.fetch;

    /** @type {any} */
    const report = {
      adapterId: ADAPTER_ID,
      provider: PROVIDER_ID,
      status: "partial",
      candidates: bases,
      selectedBaseUrl: null,
      serverUp: false,
      portProbes: [],
      health: null,
      version: null,
      blockers: [],
      connectedAt: new Date().toISOString(),
    };

    for (const base of bases) {
      const probe = {
        baseUrl: base,
        health: null,
        models: null,
        reachable: false,
        tcpOpen: useTcp ? false : true,
      };

      if (useTcp) {
        probe.tcpOpen = await tcpReachable(base, this.tcpTimeoutMs);
        if (!probe.tcpOpen) {
          probe.health = { status: 0, error: "tcp_closed" };
          report.portProbes.push(probe);
          continue;
        }
      }

      try {
        const health = await fetchJson(`${base}/health`, {
          timeoutMs: opts.timeoutMs ?? Math.min(this.timeoutMs, 4000),
          env: this.env,
          fetchImpl: this.fetchImpl,
        });
        probe.health = { status: health.status, body: health.body };
        probe.reachable = health.status > 0 && health.status < 500;
      } catch (err) {
        probe.health = {
          status: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      if (!probe.reachable) {
        try {
          const models = await fetchJson(`${base}/models`, {
            timeoutMs: opts.timeoutMs ?? Math.min(this.timeoutMs, 4000),
            env: this.env,
            fetchImpl: this.fetchImpl,
          });
          if (models.status > 0 && models.status < 500) {
            probe.reachable = true;
            probe.models = {
              status: models.status,
              count: Array.isArray(models.body?.data)
                ? models.body.data.length
                : 0,
            };
          }
        } catch (err) {
          probe.models = {
            status: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      report.portProbes.push(probe);
      if (probe.reachable && !report.selectedBaseUrl) {
        report.selectedBaseUrl = base;
        report.serverUp = true;
        report.health = probe.health;
        report.version = probe.health?.body?.version || null;
      }
    }

    if (!report.serverUp) {
      report.status = "blocked";
      report.blockers.push({
        code: "LEMONADE_SDK_UNREACHABLE",
        message: `No Lemonade SDK OpenAI surface on candidates: ${bases.join(", ")}`,
      });
      this.connected = false;
      this.baseUrl = null;
      this.health = null;
      this.lastProbe = report;
      return report;
    }

    this.connected = true;
    this.baseUrl = report.selectedBaseUrl;
    this.health = report.health;
    this.lastProbe = report;
    return report;
  }

  /** @returns {string} */
  requireBase() {
    if (!this.baseUrl) {
      throw Object.assign(
        new Error("LemonadeSdkChatClient not connected — call connect() first"),
        { code: "NOT_CONNECTED" },
      );
    }
    return this.baseUrl;
  }

  /**
   * GET /models — optionally show_all for catalog including undownloaded.
   * @param {object} [opts]
   * @param {boolean} [opts.showAll]
   */
  async listModels(opts = {}) {
    if (!this.baseUrl) {
      const c = await this.connect(opts);
      if (!c.serverUp) {
        return {
          ok: false,
          code: "LEMONADE_SDK_UNREACHABLE",
          models: [],
          llmModels: [],
          downloadedLlmModels: [],
          connect: c,
        };
      }
    }
    const base = this.requireBase();
    const q = opts.showAll ? "?show_all=true" : "";
    try {
      const res = await fetchJson(`${base}/models${q}`, {
        timeoutMs: opts.timeoutMs ?? 30_000,
        env: this.env,
        fetchImpl: this.fetchImpl,
      });
      if (!res.ok) {
        return {
          ok: false,
          code: "LEMONADE_SDK_MODELS_HTTP_ERROR",
          httpStatus: res.status,
          message:
            res.body?.error?.message ||
            res.body?.message ||
            `HTTP ${res.status}`,
          models: [],
          llmModels: [],
          downloadedLlmModels: [],
        };
      }
      const data = Array.isArray(res.body?.data) ? res.body.data : [];
      const models = data.map(mapModel);
      const llmModels = models.filter(isLlmModel);
      const downloadedLlmModels = llmModels
        .filter((m) => m.downloaded)
        .map((m) => m.id);
      return {
        ok: true,
        baseUrl: base,
        models,
        llmModels,
        downloadedLlmModels,
        showAll: !!opts.showAll,
      };
    } catch (err) {
      return {
        ok: false,
        code: "LEMONADE_SDK_MODELS_FETCH_ERROR",
        message: err instanceof Error ? err.message : String(err),
        models: [],
        llmModels: [],
        downloadedLlmModels: [],
      };
    }
  }

  /**
   * Ensure a model is downloaded — POST /pull if missing.
   * @param {string} [modelName]
   * @param {object} [opts]
   */
  async ensureModel(modelName = DEFAULT_CHAT_MODEL, opts = {}) {
    const name = String(modelName || DEFAULT_CHAT_MODEL).trim();
    if (!name) {
      return sdkError("MODEL_REQUIRED", "model name required for ensureModel");
    }

    const listed = await this.listModels({
      showAll: true,
      timeoutMs: opts.timeoutMs,
      ...opts,
    });
    if (!listed.ok && listed.code === "LEMONADE_SDK_UNREACHABLE") {
      return sdkError(listed.code, "Lemonade SDK server not reachable", {
        list: listed,
      });
    }

    const already =
      listed.downloadedLlmModels?.includes(name) ||
      listed.models?.some((m) => m.id === name && m.downloaded);
    if (already) {
      return {
        ok: true,
        status: "partial",
        adapterId: ADAPTER_ID,
        provider: PROVIDER_ID,
        model: name,
        pulled: false,
        alreadyDownloaded: true,
        baseUrl: this.baseUrl,
        message: `Model already downloaded: ${name}`,
      };
    }

    const base = this.requireBase();
    const started = Date.now();
    try {
      const res = await fetchJson(`${base}/pull`, {
        method: "POST",
        timeoutMs: opts.pullTimeoutMs ?? opts.timeoutMs ?? 600_000,
        env: this.env,
        fetchImpl: this.fetchImpl,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_name: name,
          stream: false,
          ...(opts.checkpoint ? { checkpoint: opts.checkpoint } : {}),
          ...(opts.recipe ? { recipe: opts.recipe } : {}),
        }),
      });
      const elapsedMs = Date.now() - started;
      if (!res.ok || res.body?.status === "error") {
        return sdkError(
          res.body?.error?.code || "LEMONADE_SDK_PULL_FAILED",
          res.body?.message ||
            res.body?.error?.message ||
            `pull failed HTTP ${res.status}`,
          {
            model: name,
            baseUrl: base,
            elapsedMs,
            httpStatus: res.status,
            body: res.body,
          },
        );
      }
      return {
        ok: true,
        status: "partial",
        adapterId: ADAPTER_ID,
        provider: PROVIDER_ID,
        model: name,
        pulled: true,
        alreadyDownloaded: false,
        baseUrl: base,
        elapsedMs,
        message: res.body?.message || `Installed model: ${name}`,
        body: res.body,
      };
    } catch (err) {
      return sdkError(
        "LEMONADE_SDK_PULL_ERROR",
        err instanceof Error ? err.message : String(err),
        { model: name, baseUrl: base, elapsedMs: Date.now() - started },
      );
    }
  }

  /**
   * OpenAI-compatible chat completions (non-streaming).
   * @param {object} opts
   */
  async chatCompletions(opts = {}) {
    const messages =
      Array.isArray(opts.messages) && opts.messages.length
        ? opts.messages
        : [
            {
              role: "user",
              content: String(opts.prompt || opts.message || "").trim(),
            },
          ];
    if (!messages[0]?.content) {
      return sdkError(
        "PROMPT_REQUIRED",
        "prompt or messages required for Lemonade SDK chat",
      );
    }

    if (!this.baseUrl) {
      const c = await this.connect(opts);
      if (!c.serverUp) {
        return sdkError(
          "LEMONADE_SDK_UNREACHABLE",
          "Lemonade SDK server not reachable",
          { probe: c },
        );
      }
    }
    const base = this.requireBase();

    let model = opts.model || null;
    if (!model) {
      const listed = await this.listModels(opts);
      model = listed.downloadedLlmModels?.[0] || null;
      if (!model) {
        return sdkError(
          "NO_LLM_MODEL_DOWNLOADED",
          `No downloaded LLM model — lemonade pull ${DEFAULT_CHAT_MODEL} (or ensureModel), then retry`,
          { baseUrl: base, list: listed },
        );
      }
    }

    if (opts.ensure) {
      const ensured = await this.ensureModel(model, opts);
      if (!ensured.ok) return ensured;
    }

    const body = {
      model,
      messages,
      max_tokens: Number.isFinite(opts.max_tokens) ? opts.max_tokens : 64,
      stream: false,
    };
    if (opts.temperature != null) body.temperature = opts.temperature;
    if (opts.top_p != null) body.top_p = opts.top_p;
    if (opts.top_k != null) body.top_k = opts.top_k;
    if (opts.stop != null) body.stop = opts.stop;

    const started = Date.now();
    try {
      const res = await fetchJson(`${base}/chat/completions`, {
        method: "POST",
        timeoutMs: opts.timeoutMs ?? 120_000,
        env: this.env,
        fetchImpl: this.fetchImpl,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const elapsedMs = Date.now() - started;
      if (!res.ok) {
        const errMsg =
          res.body?.error?.message ||
          res.body?.message ||
          (typeof res.body?.raw === "string" ? res.body.raw : null) ||
          `HTTP ${res.status}`;
        return sdkError(
          res.body?.error?.code || "LEMONADE_SDK_HTTP_ERROR",
          errMsg,
          {
            model,
            baseUrl: base,
            elapsedMs,
            httpStatus: res.status,
            body: res.body,
          },
        );
      }

      const message = res.body?.choices?.[0]?.message || {};
      const content =
        (typeof message.content === "string" && message.content.length
          ? message.content
          : null) ||
        (typeof message.reasoning_content === "string" &&
        message.reasoning_content.length
          ? message.reasoning_content
          : null) ||
        res.body?.choices?.[0]?.text ||
        null;

      return {
        ok: true,
        status: "partial",
        adapterId: ADAPTER_ID,
        provider: PROVIDER_ID,
        model,
        baseUrl: base,
        content,
        reasoningContent: message.reasoning_content || null,
        usage: res.body?.usage || null,
        finishReason: res.body?.choices?.[0]?.finish_reason || null,
        raw: res.body,
        elapsedMs,
        assistOnly: true,
        nonAuthoritative: true,
        message: `Lemonade SDK chat via ${model}`,
      };
    } catch (err) {
      return sdkError(
        "LEMONADE_SDK_FETCH_ERROR",
        err instanceof Error ? err.message : String(err),
        {
          model,
          baseUrl: base,
          elapsedMs: Date.now() - started,
        },
      );
    }
  }

  /**
   * Streaming chat completions — yields SSE delta content strings.
   * Lemonade docs mark stream as available on /v1/chat/completions.
   *
   * @param {object} opts
   * @param {(chunk: string, event: object) => void} [opts.onDelta]
   * @returns {Promise<object>} aggregated result
   */
  async chatCompletionsStream(opts = {}) {
    const messages =
      Array.isArray(opts.messages) && opts.messages.length
        ? opts.messages
        : [
            {
              role: "user",
              content: String(opts.prompt || opts.message || "").trim(),
            },
          ];
    if (!messages[0]?.content) {
      return sdkError(
        "PROMPT_REQUIRED",
        "prompt or messages required for Lemonade SDK chat stream",
      );
    }

    if (!this.baseUrl) {
      const c = await this.connect(opts);
      if (!c.serverUp) {
        return sdkError(
          "LEMONADE_SDK_UNREACHABLE",
          "Lemonade SDK server not reachable",
          { probe: c },
        );
      }
    }
    const base = this.requireBase();

    let model = opts.model || null;
    if (!model) {
      const listed = await this.listModels(opts);
      model = listed.downloadedLlmModels?.[0] || null;
      if (!model) {
        return sdkError(
          "NO_LLM_MODEL_DOWNLOADED",
          `No downloaded LLM model — lemonade pull ${DEFAULT_CHAT_MODEL}`,
          { baseUrl: base },
        );
      }
    }

    const body = {
      model,
      messages,
      max_tokens: Number.isFinite(opts.max_tokens) ? opts.max_tokens : 64,
      stream: true,
    };
    if (opts.temperature != null) body.temperature = opts.temperature;

    const started = Date.now();
    const deltas = [];
    try {
      const fetchImpl = this.fetchImpl;
      const res = await fetchImpl(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          ...authHeaders(this.env, { "Content-Type": "application/json" }),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        let parsed = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = { raw: text.slice(0, 800) };
        }
        return sdkError(
          parsed?.error?.code || "LEMONADE_SDK_STREAM_HTTP_ERROR",
          parsed?.error?.message || parsed?.message || `HTTP ${res.status}`,
          {
            model,
            baseUrl: base,
            httpStatus: res.status,
            elapsedMs: Date.now() - started,
          },
        );
      }

      const text = await res.text();
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let event;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }
        const piece =
          event?.choices?.[0]?.delta?.content ||
          event?.choices?.[0]?.text ||
          "";
        if (piece) {
          deltas.push(piece);
          if (typeof opts.onDelta === "function") opts.onDelta(piece, event);
        }
      }

      const content = deltas.join("");
      return {
        ok: true,
        status: "partial",
        adapterId: ADAPTER_ID,
        provider: PROVIDER_ID,
        model,
        baseUrl: base,
        content,
        deltas,
        streamed: true,
        elapsedMs: Date.now() - started,
        assistOnly: true,
        nonAuthoritative: true,
        message: `Lemonade SDK streamed chat via ${model}`,
      };
    } catch (err) {
      return sdkError(
        "LEMONADE_SDK_STREAM_ERROR",
        err instanceof Error ? err.message : String(err),
        {
          model,
          baseUrl: base,
          elapsedMs: Date.now() - started,
          partialContent: deltas.join("") || null,
        },
      );
    }
  }

  /**
   * Full capability / readiness probe.
   * @param {object} [opts]
   * @param {boolean} [opts.tryChat]
   * @param {boolean} [opts.ensureModel]
   * @param {string} [opts.model]
   * @param {string} [opts.prompt]
   */
  async capabilityProbe(opts = {}) {
    const connect = await this.connect(opts);
    /** @type {any} */
    const out = {
      adapterId: ADAPTER_ID,
      provider: PROVIDER_ID,
      status: connect.status,
      candidates: connect.candidates,
      selectedBaseUrl: connect.selectedBaseUrl,
      serverUp: connect.serverUp,
      portProbes: connect.portProbes,
      health: connect.health,
      version: connect.version,
      models: [],
      llmModels: [],
      downloadedLlmModels: [],
      chatCapable: false,
      streamingSupported: true, // Lemonade OpenAI docs: stream available
      ensure: null,
      chat: null,
      blockers: [...(connect.blockers || [])],
      notes: {
        officialDefault:
          "Lemonade Server OpenAI API defaults to http://localhost:13305/api/v1 (also /v1).",
        legacyPaste:
          "Some user docs / older installs cite http://localhost:8000/api/v1 — probed first when env unset.",
        preferredModel: DEFAULT_CHAT_MODEL,
        backendHint:
          "On FX-8350 / R9 380 prefer llamacpp:vulkan (avoid AVX2-only CPU llama binaries).",
        multimodalSibling:
          "Images/TTS/STT remain on lemonadeSdAdapter (:13305 multimodal). This adapter is chat/LLM.",
      },
      vendorPinHint:
        "See docs/4d-engine/proofs/legacy-efficient/upstream-vendor-pins.json",
      capturedAt: new Date().toISOString(),
    };

    if (!connect.serverUp) return out;

    const listed = await this.listModels({ showAll: !!opts.showAll, ...opts });
    out.models = listed.models || [];
    out.llmModels = listed.llmModels || [];
    out.downloadedLlmModels = listed.downloadedLlmModels || [];

    if (opts.ensureModel) {
      const model = opts.model || DEFAULT_CHAT_MODEL;
      out.ensure = await this.ensureModel(model, opts);
      if (out.ensure.ok) {
        const relist = await this.listModels(opts);
        out.downloadedLlmModels = relist.downloadedLlmModels || out.downloadedLlmModels;
        out.models = relist.models || out.models;
        out.llmModels = relist.llmModels || out.llmModels;
      } else {
        out.blockers.push({
          code: out.ensure.code || "ENSURE_MODEL_FAILED",
          message: out.ensure.message,
        });
      }
    }

    if (!out.downloadedLlmModels.length) {
      out.blockers.push({
        code: "NO_LLM_MODEL_DOWNLOADED",
        message: `Run: lemonade pull ${DEFAULT_CHAT_MODEL} (or client.ensureModel()) after llamacpp:vulkan install`,
      });
      out.status = "partial";
      out.chatCapable = false;
    }

    if (opts.tryChat) {
      out.chat = await this.chatCompletions({
        prompt: opts.prompt || "Reply with exactly: OK",
        max_tokens: opts.max_tokens ?? 16,
        model: opts.model || out.downloadedLlmModels[0],
        timeoutMs: opts.timeoutMs ?? 120_000,
      });
      out.chatCapable = !!out.chat.ok;
      if (!out.chat.ok && out.chat.code !== "NO_LLM_MODEL_DOWNLOADED") {
        out.blockers.push({
          code: out.chat.code || "LEMONADE_SDK_CHAT_BLOCKED",
          message: out.chat.message,
        });
      }
      out.status = out.serverUp ? "partial" : "blocked";
    }

    return out;
  }
}

/* ---------- functional façade (SX / legacyEfficientBeauty) ---------- */

/**
 * @param {object} [opts]
 */
export async function probeLemonadeSdk(opts = {}) {
  const client = new LemonadeSdkChatClient(opts);
  return client.capabilityProbe({ ...opts, tryChat: false });
}

/**
 * @param {object} [opts]
 */
export async function chatViaLemonadeSdk(opts = {}) {
  const client = new LemonadeSdkChatClient({
    baseUrl: opts.baseUrl,
    bases: opts.bases,
    env: opts.env,
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.timeoutMs,
  });
  return client.chatCompletions(opts);
}

/**
 * @param {object} [opts]
 */
export async function reportLemonadeSdkCapability(opts = {}) {
  const client = new LemonadeSdkChatClient(opts);
  return client.capabilityProbe(opts);
}

/**
 * Write JSON capability report under proofs/.
 */
export async function writeSdkCapabilityReport(outPath, opts = {}) {
  const report = await reportLemonadeSdkCapability(opts);
  const path = resolve(outPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
  return { path, report, exists: existsSync(path) };
}

export default {
  ADAPTER_ID,
  PROVIDER_ID,
  DEFAULT_CHAT_MODEL,
  PREFERRED_CHAT_MODELS,
  DEFAULT_BASE_CANDIDATES,
  LemonadeSdkChatClient,
  resolveLemonadeSdkBaseCandidates,
  isLlmModel,
  mapModel,
  tcpReachable,
  fetchJson,
  authHeaders,
  sdkError,
  probeLemonadeSdk,
  chatViaLemonadeSdk,
  reportLemonadeSdkCapability,
  writeSdkCapabilityReport,
};
