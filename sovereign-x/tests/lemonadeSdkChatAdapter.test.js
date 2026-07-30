/**
 * Lemonade SDK Live Chat adapter — unit tests with mock HTTP.
 * STATUS: **partial** — no live LLM required for this file.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADAPTER_ID,
  PROVIDER_ID,
  DEFAULT_BASE_CANDIDATES,
  DEFAULT_CHAT_MODEL,
  LemonadeSdkChatClient,
  resolveLemonadeSdkBaseCandidates,
  isLlmModel,
  probeLemonadeSdk,
  chatViaLemonadeSdk,
} from "../router/modules/gpu/amd/lemonadeSdkChatAdapter.js";

/**
 * @param {Record<string, { status?: number, body?: any, text?: string }>} routes
 * @returns {typeof fetch}
 */
function mockFetch(routes) {
  return async (url, init = {}) => {
    const u = String(url);
    const method = String(init.method || "GET").toUpperCase();
    const key =
      Object.keys(routes).find((k) => {
        const [m, path] = k.includes(" ") ? k.split(" ", 2) : ["GET", k];
        return m === method && u.includes(path);
      }) || Object.keys(routes).find((k) => u.includes(k.replace(/^POST /, "")));
    const hit = key ? routes[key] : null;
    if (!hit) {
      return {
        ok: false,
        status: 404,
        headers: new Map(),
        async text() {
          return JSON.stringify({ error: { message: `no mock for ${method} ${u}` } });
        },
      };
    }
    const status = hit.status ?? 200;
    const body =
      hit.text != null
        ? hit.text
        : JSON.stringify(hit.body ?? {});
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Map(),
      async text() {
        return body;
      },
    };
  };
}

describe("lemonadeSdkChatAdapter", () => {
  it("exposes adapter and provider ids", () => {
    assert.equal(ADAPTER_ID, "sx.adapter.lemonade.sdk.chat");
    assert.equal(PROVIDER_ID, "lemonade-sdk");
    assert.equal(DEFAULT_CHAT_MODEL, "Llama-3.2-1B-Instruct-GGUF");
    assert.ok(DEFAULT_BASE_CANDIDATES.some((u) => u.includes(":8000")));
    assert.ok(DEFAULT_BASE_CANDIDATES.some((u) => u.includes(":13305")));
  });

  it("resolves base candidates from env", () => {
    assert.deepEqual(
      resolveLemonadeSdkBaseCandidates({
        LEMONADE_SDK_BASE_URL: "http://localhost:9/api/v1/",
      }),
      ["http://localhost:9/api/v1"],
    );
    assert.deepEqual(
      resolveLemonadeSdkBaseCandidates({
        LEMONADE_SDK_HOST: "127.0.0.1",
        LEMONADE_SDK_PORT: "8000",
      }),
      ["http://127.0.0.1:8000/api/v1"],
    );
  });

  it("classifies LLM vs SD models", () => {
    assert.equal(
      isLlmModel({ id: "Qwen3-0.6B-GGUF", downloaded: true, labels: ["llm"] }),
      true,
    );
    assert.equal(
      isLlmModel({ id: "Gemma-4-E2B-it-GGUF", recipe: "llamacpp", labels: [] }),
      true,
    );
    assert.equal(
      isLlmModel({ id: "SD-Turbo", recipe: "sd-cpp", labels: ["image"] }),
      false,
    );
    assert.equal(
      isLlmModel({ id: "kokoro-v1", recipe: "kokoro", labels: ["tts"] }),
      false,
    );
  });

  it("connect picks first healthy base via mock fetch", async () => {
    const fetchImpl = mockFetch({
      "/health": {
        status: 200,
        body: { status: "ok", version: "11.5.0" },
      },
    });
    const client = new LemonadeSdkChatClient({
      bases: ["http://localhost:8000/api/v1"],
      fetchImpl,
      skipTcp: true,
    });
    const c = await client.connect({ skipTcp: true });
    assert.equal(c.serverUp, true);
    assert.equal(c.selectedBaseUrl, "http://localhost:8000/api/v1");
    assert.equal(client.connected, true);
  });

  it("listModels maps LLM catalog", async () => {
    const fetchImpl = mockFetch({
      "/health": { status: 200, body: { status: "ok" } },
      "/models": {
        status: 200,
        body: {
          data: [
            {
              id: "Qwen3-0.6B-GGUF",
              recipe: "llamacpp",
              downloaded: true,
              labels: ["llm"],
            },
            {
              id: "SD-Turbo",
              recipe: "sd-cpp",
              downloaded: true,
              labels: ["image"],
            },
          ],
        },
      },
    });
    const client = new LemonadeSdkChatClient({
      baseUrl: "http://localhost:13305/api/v1",
      fetchImpl,
    });
    client.connected = true;
    client.baseUrl = "http://localhost:13305/api/v1";
    const listed = await client.listModels();
    assert.equal(listed.ok, true);
    assert.deepEqual(listed.downloadedLlmModels, ["Qwen3-0.6B-GGUF"]);
  });

  it("ensureModel pulls when missing", async () => {
    let pulled = false;
    const fetchImpl = mockFetch({
      "/models": {
        status: 200,
        body: {
          data: [
            {
              id: "Qwen3-0.6B-GGUF",
              recipe: "llamacpp",
              downloaded: false,
              labels: ["llm"],
            },
          ],
        },
      },
      "POST /pull": {
        status: 200,
        body: { status: "success", message: "Installed model: Qwen3-0.6B-GGUF" },
      },
    });
    // wrap to observe pull
    const wrapped = async (url, init) => {
      if (String(init?.method || "GET").toUpperCase() === "POST" && String(url).includes("/pull")) {
        pulled = true;
      }
      return fetchImpl(url, init);
    };
    const client = new LemonadeSdkChatClient({
      baseUrl: "http://localhost:13305/api/v1",
      fetchImpl: wrapped,
    });
    client.connected = true;
    client.baseUrl = "http://localhost:13305/api/v1";
    const result = await client.ensureModel("Qwen3-0.6B-GGUF");
    assert.equal(result.ok, true);
    assert.equal(result.pulled, true);
    assert.equal(pulled, true);
  });

  it("ensureModel skips pull when already downloaded", async () => {
    let pulled = false;
    const fetchImpl = async (url, init) => {
      if (String(init?.method || "GET").toUpperCase() === "POST") pulled = true;
      return mockFetch({
        "/models": {
          status: 200,
          body: {
            data: [
              {
                id: "Qwen3-0.6B-GGUF",
                recipe: "llamacpp",
                downloaded: true,
                labels: ["llm"],
              },
            ],
          },
        },
      })(url, init);
    };
    const client = new LemonadeSdkChatClient({
      baseUrl: "http://localhost:13305/api/v1",
      fetchImpl,
    });
    client.connected = true;
    client.baseUrl = "http://localhost:13305/api/v1";
    const result = await client.ensureModel("Qwen3-0.6B-GGUF");
    assert.equal(result.ok, true);
    assert.equal(result.alreadyDownloaded, true);
    assert.equal(result.pulled, false);
    assert.equal(pulled, false);
  });

  it("chatCompletions returns content from mock", async () => {
    const fetchImpl = mockFetch({
      "/models": {
        status: 200,
        body: {
          data: [
            {
              id: "Qwen3-0.6B-GGUF",
              recipe: "llamacpp",
              downloaded: true,
              labels: ["llm"],
            },
          ],
        },
      },
      "POST /chat/completions": {
        status: 200,
        body: {
          choices: [{ message: { role: "assistant", content: "OK" } }],
          usage: { total_tokens: 3 },
        },
      },
    });
    const client = new LemonadeSdkChatClient({
      baseUrl: "http://localhost:13305/api/v1",
      fetchImpl,
    });
    client.connected = true;
    client.baseUrl = "http://localhost:13305/api/v1";
    const chat = await client.chatCompletions({
      prompt: "Reply with exactly: OK",
      model: "Qwen3-0.6B-GGUF",
      max_tokens: 8,
    });
    assert.equal(chat.ok, true);
    assert.equal(chat.content, "OK");
    assert.equal(chat.model, "Qwen3-0.6B-GGUF");
  });

  it("chatCompletionsStream aggregates SSE deltas", async () => {
    const fetchImpl = mockFetch({
      "POST /chat/completions": {
        status: 200,
        text: [
          'data: {"choices":[{"delta":{"content":"Hel"}}]}',
          'data: {"choices":[{"delta":{"content":"lo"}}]}',
          "data: [DONE]",
          "",
        ].join("\n"),
      },
    });
    const client = new LemonadeSdkChatClient({
      baseUrl: "http://localhost:13305/api/v1",
      fetchImpl,
    });
    client.connected = true;
    client.baseUrl = "http://localhost:13305/api/v1";
    const chat = await client.chatCompletionsStream({
      prompt: "hi",
      model: "Qwen3-0.6B-GGUF",
    });
    assert.equal(chat.ok, true);
    assert.equal(chat.streamed, true);
    assert.equal(chat.content, "Hello");
  });

  it("chat without prompt is blocked", async () => {
    const r = await chatViaLemonadeSdk({
      prompt: "",
      fetchImpl: mockFetch({}),
      baseUrl: "http://localhost:13305/api/v1",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "PROMPT_REQUIRED");
  });

  it("clear error when unreachable (mock)", async () => {
    const fetchImpl = async () => {
      throw new Error("ECONNREFUSED");
    };
    const client = new LemonadeSdkChatClient({
      bases: ["http://localhost:9/api/v1"],
      fetchImpl,
    });
    const c = await client.connect({ skipTcp: true });
    assert.equal(c.serverUp, false);
    assert.ok(c.blockers.some((b) => b.code === "LEMONADE_SDK_UNREACHABLE"));
  });

  it("probeLemonadeSdk does not throw against localhost", async () => {
    const report = await probeLemonadeSdk({ timeoutMs: 3000 });
    assert.equal(report.adapterId, ADAPTER_ID);
    assert.ok(["partial", "blocked"].includes(report.status));
    assert.ok(typeof report.serverUp === "boolean");
    assert.ok(Array.isArray(report.portProbes));
  });
});
