import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { JarvisMemoryClient, createJarvisMemoryClient } from "../../../js/engine/services/jarvis-memory.js";

function jsonResponse(body, { status = 200, statusText = "OK" } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

describe("JarvisMemoryClient", () => {
  it("loads board and live memories together", async () => {
    const calls = [];
    const client = new JarvisMemoryClient({
      baseUrl: "http://localhost:8001/",
      fetch: async (url) => {
        calls.push(String(url));
        if (String(url).includes("/memory/board")) {
          return jsonResponse({ memory_board: { board_id: "default_board", summary: "Board" } });
        }
        return jsonResponse({
          memories: [{ id: "mem-1", content: "Session note" }],
        });
      },
    });

    const result = await client.loadSessionContext({ query: "render", limit: 12 });

    assert.equal(result.board.board_id, "default_board");
    assert.equal(result.memories.length, 1);
    assert.match(calls[0], /truth_scope=live/);
    assert.match(calls[1], /query=render/);
    assert.match(calls[1], /limit=12/);
  });

  it("writes a session summary with Jarvis field names", async () => {
    let request;
    const client = new JarvisMemoryClient({
      fetch: async (url, init) => {
        request = { url: String(url), init };
        return jsonResponse({ memory: { id: "mem-2", content: "Summary" } });
      },
    });

    const memory = await client.writeSessionSummary({
      content: "Summary",
      tags: ["4d", "governance"],
    });

    assert.equal(memory.id, "mem-2");
    assert.match(request.url, /\/api\/jarvis\/memory$/);
    assert.equal(request.init.method, "POST");
    assert.deepEqual(JSON.parse(request.init.body), {
      content: "Summary",
      tags: ["4d", "governance"],
      category: "signal",
      scope: "session",
      state_class: "live",
      truth_status: "stable_user",
    });
  });

  it("surfaces HTTP failures with status context", async () => {
    const client = new JarvisMemoryClient({
      fetch: async () => jsonResponse({ detail: "missing" }, { status: 404, statusText: "Not Found" }),
    });

    await assert.rejects(() => client.getMemory("mem-missing"), /404 missing/);
  });

  it("uses global fetch and env base URL in the factory helper", async () => {
    const originalUrl = process.env.JARVIS_MEMORYBOARD_URL;
    const originalFetch = globalThis.fetch;
    process.env.JARVIS_MEMORYBOARD_URL = "http://127.0.0.1:8123";
    let seenUrl = "";
    globalThis.fetch = async (url) => {
      seenUrl = String(url);
      return jsonResponse({ memories: [] });
    };

    try {
      const client = createJarvisMemoryClient();
      await client.listMemories();
      assert.match(seenUrl, /^http:\/\/127\.0\.0\.1:8123\/api\/jarvis\/memory\?/);
    } finally {
      process.env.JARVIS_MEMORYBOARD_URL = originalUrl;
      globalThis.fetch = originalFetch;
    }
  });
});
