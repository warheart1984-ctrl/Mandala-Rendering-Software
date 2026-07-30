import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  JarvisSession,
  createJarvisSession,
  formatJarvisSessionSummary,
} from "../../../js/engine/services/jarvis-session.js";

describe("formatJarvisSessionSummary", () => {
  it("formats the standard summary sections", () => {
    const summary = formatJarvisSessionSummary({
      objective: "Wire persistence",
      decisions: ["Added session helper", "Kept startup lightweight"],
      touchedSystems: ["js/engine", "jarvis-memoryboard"],
      openThreads: ["Add auto end hook"],
      notes: ["July 30, 2026 verification passed"],
    });

    assert.match(summary, /Objective: Wire persistence/);
    assert.match(summary, /Decisions: Added session helper \| Kept startup lightweight/);
    assert.match(summary, /Touched systems: js\/engine, jarvis-memoryboard/);
    assert.match(summary, /Open threads: Add auto end hook/);
    assert.match(summary, /Notes: July 30, 2026 verification passed/);
  });
});

describe("JarvisSession", () => {
  it("loads startup context and exposes a snapshot", async () => {
    const memory = {
      async loadSessionContext() {
        return {
          board: { board_id: "default_board", summary: "Main board" },
          memories: [{ id: "mem-1", content: "Prior context" }],
        };
      },
      async writeSessionSummary() {
        throw new Error("not used");
      },
    };

    const session = await createJarvisSession(memory, { query: "render" });
    const snapshot = session.snapshot();

    assert.equal(snapshot.status, "ready");
    assert.equal(snapshot.board.board_id, "default_board");
    assert.equal(snapshot.memories.length, 1);
  });

  it("deduplicates tracked session items and writes a standard summary", async () => {
    let writeRequest;
    const memory = {
      async loadSessionContext() {
        return { board: null, memories: [] };
      },
      async writeSessionSummary(payload) {
        writeRequest = payload;
        return { id: "mem-written", content: payload.content };
      },
    };

    const session = await createJarvisSession(memory);
    session.setObjective("Keep continuity across future work");
    session.addDecision("Added session utility");
    session.addDecision("Added session utility");
    session.addTouchedSystem("js/engine/services");
    session.addOpenThread("Auto-write shutdown hook");
    session.addNote("No governance regressions");

    const written = await session.writeSummary({ tags: ["jarvis", "session"] });

    assert.equal(written.id, "mem-written");
    assert.deepEqual(writeRequest.tags, ["jarvis", "session"]);
    assert.match(writeRequest.content, /Objective: Keep continuity across future work/);
    assert.match(writeRequest.content, /Decisions: Added session utility/);
    assert.match(writeRequest.content, /Touched systems: js\/engine\/services/);
    assert.match(writeRequest.content, /Open threads: Auto-write shutdown hook/);
    assert.match(writeRequest.content, /Notes: No governance regressions/);
  });

  it("can start from a constructed session instance", async () => {
    let calls = 0;
    const session = new JarvisSession({
      async loadSessionContext() {
        calls += 1;
        return { board: null, memories: [] };
      },
      async writeSessionSummary() {
        return { id: "unused" };
      },
    });

    await session.start();

    assert.equal(calls, 1);
    assert.equal(session.snapshot().status, "ready");
  });

  it("auto-persists once across pagehide and beforeunload", async () => {
    const listeners = new Map();
    const target = {
      addEventListener(name, handler) {
        listeners.set(name, handler);
      },
      removeEventListener(name) {
        listeners.delete(name);
      },
    };
    const writes = [];
    const session = await createJarvisSession({
      async loadSessionContext() {
        return { board: null, memories: [] };
      },
      async writeSessionSummary(payload) {
        writes.push(payload);
        return { id: `mem-${writes.length}`, content: payload.content };
      },
    });

    session.setObjective("Keep app continuity");
    session.addTouchedSystem("js/app");
    session.installAutoPersist(target, {
      getSummary(reason) {
        return {
          decisions: [`Shutdown hook observed ${reason}`],
          openThreads: ["Review auto-persist telemetry"],
        };
      },
    });

    await listeners.get("pagehide")?.();
    await listeners.get("beforeunload")?.();

    assert.equal(writes.length, 1);
    assert.match(writes[0].content, /Objective: Keep app continuity/);
    assert.match(writes[0].content, /Touched systems: js\/app/);
    assert.match(writes[0].content, /Shutdown hook observed pagehide/);
    assert.match(writes[0].content, /Auto-persisted on pagehide/);
  });
});
