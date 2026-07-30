/**
 * Jarvis Memory Board client for lightweight session persistence.
 */

const DEFAULT_BASE_URL = "http://localhost:8001";

function trimSlash(value) {
  return String(value ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function makeUrl(baseUrl, pathname, params) {
  const url = new URL(pathname, `${trimSlash(baseUrl)}/`);
  if (params && typeof params === "object") {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Jarvis memory response was not valid JSON (${error.message})`);
  }
}

async function requestJson(fetchImpl, url, init = {}) {
  const response = await fetchImpl(url, {
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });
  const body = await readJson(response);
  if (!response.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : response.statusText;
    throw new Error(`Jarvis memory request failed (${response.status} ${detail})`);
  }
  return body;
}

export class JarvisMemoryClient {
  constructor({ baseUrl, fetch: fetchImpl, defaultLiveLimit = 32 } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new TypeError("JarvisMemoryClient requires a fetch function");
    }
    this.baseUrl = trimSlash(
      baseUrl ??
        (typeof process !== "undefined" ? process.env?.JARVIS_MEMORYBOARD_URL : null) ??
        DEFAULT_BASE_URL,
    );
    this.fetch = fetchImpl;
    this.defaultLiveLimit = defaultLiveLimit;
  }

  async getBoard({ truthScope } = {}) {
    const body = await requestJson(
      this.fetch,
      makeUrl(this.baseUrl, "/api/jarvis/memory/board", { truth_scope: truthScope }),
    );
    return body.memory_board ?? body;
  }

  async listMemories({ truthScope = "live", query, limit = this.defaultLiveLimit } = {}) {
    const body = await requestJson(
      this.fetch,
      makeUrl(this.baseUrl, "/api/jarvis/memory", {
        truth_scope: truthScope,
        query,
        limit,
      }),
    );
    return Array.isArray(body.memories) ? body.memories : [];
  }

  async getMemory(memoryId) {
    const body = await requestJson(
      this.fetch,
      makeUrl(this.baseUrl, `/api/jarvis/memory/${encodeURIComponent(memoryId)}`),
    );
    return body.memory ?? body;
  }

  async createMemory(memory) {
    const body = await requestJson(
      this.fetch,
      makeUrl(this.baseUrl, "/api/jarvis/memory"),
      {
        method: "POST",
        body: JSON.stringify(memory),
      },
    );
    return body.memory ?? body;
  }

  async updateMemory(memoryId, patch) {
    const body = await requestJson(
      this.fetch,
      makeUrl(this.baseUrl, `/api/jarvis/memory/${encodeURIComponent(memoryId)}`),
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      },
    );
    return body.memory ?? body;
  }

  async deleteMemory(memoryId) {
    return requestJson(
      this.fetch,
      makeUrl(this.baseUrl, `/api/jarvis/memory/${encodeURIComponent(memoryId)}`),
      {
        method: "DELETE",
      },
    );
  }

  async replaceBoard(board) {
    const body = await requestJson(
      this.fetch,
      makeUrl(this.baseUrl, "/api/jarvis/memory/board"),
      {
        method: "POST",
        body: JSON.stringify(board),
      },
    );
    return body.memory_board ?? body;
  }

  async patchBoard(patch) {
    const body = await requestJson(
      this.fetch,
      makeUrl(this.baseUrl, "/api/jarvis/memory/board"),
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      },
    );
    return body.memory_board ?? body;
  }

  async loadSessionContext({ query, limit = this.defaultLiveLimit, includeBoard = true } = {}) {
    const [board, memories] = await Promise.all([
      includeBoard ? this.getBoard({ truthScope: "live" }) : Promise.resolve(null),
      this.listMemories({ truthScope: "live", query, limit }),
    ]);
    return { board, memories };
  }

  async writeSessionSummary({
    content,
    tags = [],
    category = "signal",
    scope = "session",
    stateClass = "live",
    truthStatus = "stable_user",
  }) {
    return this.createMemory({
      content,
      tags,
      category,
      scope,
      state_class: stateClass,
      truth_status: truthStatus,
    });
  }
}

export function createJarvisMemoryClient(options = {}) {
  const fetchImpl =
    options.fetch ??
    (typeof fetch === "function" ? fetch.bind(globalThis) : null);
  return new JarvisMemoryClient({ ...options, fetch: fetchImpl });
}
