import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  handleDeleteJarvisMemory,
  handleFetchJarvisMemory,
  handleSearchJarvisMemory,
  handleUpdateJarvisMemory,
  handleWriteJarvisSessionSummary,
  handleWriteJarvisMemory,
} from "./jarvis-memory.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.JARVIS_MEMORYBOARD_URL;
});

function jsonResponse(body, status = 200, statusText = "OK") {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Jarvis memory ChatGPT tools", () => {
  it("searches memories and includes board context", async () => {
    const calls = [];
    process.env.JARVIS_MEMORYBOARD_URL = "http://127.0.0.1:8001";
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes("/memory/board")) {
        return jsonResponse({ memory_board: { board_id: "default_board" } });
      }
      return jsonResponse({
        memories: [{ id: "mem-1", content: "governance summary" }],
      });
    };

    const result = await handleSearchJarvisMemory({ query: "governance" });

    assert.equal(result.structured.board.board_id, "default_board");
    assert.equal(result.structured.memories.length, 1);
    assert.match(calls[1], /query=governance/);
  });

  it("fetches a single memory by id", async () => {
    globalThis.fetch = async () =>
      jsonResponse({ memory: { id: "mem-2", content: "saved" } });

    const result = await handleFetchJarvisMemory({ memoryId: "mem-2" });

    assert.equal(result.structured.memory.id, "mem-2");
  });

  it("writes a memory with Jarvis field names", async () => {
    let requestBody = "";
    globalThis.fetch = async (_url, init) => {
      requestBody = String(init?.body ?? "");
      return jsonResponse({ memory: { id: "mem-3", content: "stored" } });
    };

    const result = await handleWriteJarvisMemory({
      content: "stored",
      tags: ["jarvis", "session"],
      scope: "session",
      stateClass: "live",
      truthStatus: "stable_user",
    });

    assert.equal(result.structured.memory.id, "mem-3");
    assert.deepEqual(JSON.parse(requestBody), {
      content: "stored",
      category: "signal",
      tags: ["jarvis", "session"],
      scope: "session",
      state_class: "live",
      truth_status: "stable_user",
    });
  });

  it("writes a standard session summary in one call", async () => {
    let requestBody = "";
    globalThis.fetch = async (_url, init) => {
      requestBody = String(init?.body ?? "");
      return jsonResponse({ memory: { id: "mem-4", content: "summary" } });
    };

    const result = await handleWriteJarvisSessionSummary({
      objective: "Hook ChatGPT into Jarvis memory",
      decisions: ["Added MCP summary tool"],
      touchedSystems: ["chatgpt-mrs/server", "jarvis-memoryboard"],
      openThreads: ["Add update/delete memory tools later"],
      notes: ["Verified on July 30, 2026"],
    });

    assert.equal(result.structured.memory.id, "mem-4");
    assert.match(result.structured.summary, /Objective: Hook ChatGPT into Jarvis memory/);
    assert.match(result.structured.summary, /Decisions: Added MCP summary tool/);
    assert.match(result.structured.summary, /Touched systems: chatgpt-mrs\/server, jarvis-memoryboard/);
    assert.deepEqual(JSON.parse(requestBody), {
      content: result.structured.summary,
      category: "signal",
      tags: ["jarvis", "session", "summary"],
      scope: "session",
      state_class: "live",
      truth_status: "stable_user",
    });
  });

  it("updates a memory with Jarvis patch field names", async () => {
    let requestBody = "";
    globalThis.fetch = async (_url, init) => {
      requestBody = String(init?.body ?? "");
      return jsonResponse({ memory: { id: "mem-5", content: "updated" } });
    };

    const result = await handleUpdateJarvisMemory({
      memoryId: "mem-5",
      content: "updated",
      stateClass: "archived",
      truthStatus: "canonical",
    });

    assert.equal(result.structured.memory.id, "mem-5");
    assert.deepEqual(JSON.parse(requestBody), {
      content: "updated",
      state_class: "archived",
      truth_status: "canonical",
    });
  });

  it("deletes a memory by id", async () => {
    globalThis.fetch = async () => jsonResponse({ status: "deleted" });

    const result = await handleDeleteJarvisMemory({ memoryId: "mem-6" });

    assert.equal(result.structured.status, "deleted");
    assert.equal(result.structured.memoryId, "mem-6");
  });
});
