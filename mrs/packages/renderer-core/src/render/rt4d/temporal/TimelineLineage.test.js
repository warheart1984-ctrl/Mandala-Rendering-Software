// mrs/packages/renderer-core/src/render/rt4d/temporal/TimelineLineage.test.js
// Status: **passing with gaps** - TimelineLineage fork/merge tests.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLineageStore, ensureRoot, forkTimeline, mergeTimelines } from "./TimelineLineage.js";
import { TEMPORAL_OP_TYPES } from "./TemporalOp.js";

describe("TimelineLineage", () => {
  it("createLineageStore creates empty store", () => {
    const store = createLineageStore();
    assert.ok(store.nodes instanceof Map);
    assert.equal(store.nodes.size, 0);
  });

  it("ensureRoot creates root node", () => {
    const store = createLineageStore();
    const node = ensureRoot(store, "root-1", { label: "root", stateHash: "hash-1" });
    assert.equal(node.timelineId, "root-1");
    assert.deepEqual(node.parentTimelineIds, []);
    assert.equal(node.stateHash, "hash-1");
    assert.equal(node.label, "root");
    assert.equal(node.status, "active");
    assert.ok(store.nodes.has("root-1"));
  });

  it("ensureRoot returns existing node", () => {
    const store = createLineageStore();
    ensureRoot(store, "root-1", { stateHash: "hash-1" });
    const node = ensureRoot(store, "root-1", { stateHash: "different" });
    assert.equal(node.stateHash, "hash-1"); // unchanged
  });

  it("forkTimeline creates child with single parent", () => {
    const store = createLineageStore();
    ensureRoot(store, "parent");
    const { child, parent, envelope } = forkTimeline(store, {
      sourceTimelineId: "parent",
      resultTimelineId: "child-1",
    });
    assert.equal(child.timelineId, "child-1");
    assert.deepEqual(child.parentTimelineIds, ["parent"]);
    assert.equal(child.status, "active");
    assert.ok(envelope);
    assert.equal(envelope.operationType, "fork");
    assert.equal(envelope.sourceTimelineId, "parent");
    assert.equal(envelope.resultTimelineId, "child-1");
    assert.equal(envelope.evidenceStatus, "substrate_verified");
  });

  it("forkTimeline throws for unknown parent", () => {
    const store = createLineageStore();
    assert.throws(() => forkTimeline(store, { sourceTimelineId: "unknown", resultTimelineId: "child" }), /unknown sourceTimelineId/);
  });

  it("forkTimeline throws for duplicate child", () => {
    const store = createLineageStore();
    ensureRoot(store, "parent");
    forkTimeline(store, { sourceTimelineId: "parent", resultTimelineId: "child" });
    assert.throws(() => forkTimeline(store, { sourceTimelineId: "parent", resultTimelineId: "child" }), /already exists/);
  });

  it("forkTimeline records evidence envelope", () => {
    const store = createLineageStore();
    ensureRoot(store, "parent");
    const { envelope } = forkTimeline(store, {
      sourceTimelineId: "parent",
      resultTimelineId: "child",
      sourceEventId: "evt-1",
    });
    assert.equal(envelope.operationType, "fork");
    assert.equal(envelope.sourceTimelineId, "parent");
    assert.equal(envelope.resultTimelineId, "child");
    assert.equal(envelope.sourceEventId, "evt-1");
    assert.equal(envelope.evidenceStatus, "substrate_verified");
  });

  it("mergeTimelines fails if parents don't exist", () => {
    const store = createLineageStore();
    assert.throws(() => mergeTimelines({ store, parentA: "a", parentB: "b", resultTimelineId: "merged" }), /both parents must exist/);
  });

  it("mergeTimelines fails if result already exists", () => {
    const store = createLineageStore();
    ensureRoot(store, "a");
    ensureRoot(store, "b");
    ensureRoot(store, "merged");
    assert.throws(() => mergeTimelines({ store, parentA: "a", parentB: "b", resultTimelineId: "merged" }), /already exists/);
  });

  it("mergeTimelines detects state hash conflict", () => {
    const store = createLineageStore();
    ensureRoot(store, "a", { stateHash: "hash-a" });
    ensureRoot(store, "b", { stateHash: "hash-b" });
    const result = mergeTimelines({ store, parentA: "a", parentB: "b", resultTimelineId: "merged" });
    assert.equal(result.ok, false);
    assert.ok(result.conflicts.some(c => c.code === "state_hash_divergence"));
  });

  it("mergeTimelines allows conflict with allowConflict=true", () => {
    const store = createLineageStore();
    ensureRoot(store, "a", { stateHash: "hash-a" });
    ensureRoot(store, "b", { stateHash: "hash-b" });
    const result = mergeTimelines({ store, parentA: "a", parentB: "b", resultTimelineId: "merged", allowConflict: true });
    assert.equal(result.ok, true);
    assert.ok(result.derived);
    assert.equal(result.derived.timelineId, "merged");
    assert.deepEqual(result.derived.parentTimelineIds, ["a", "b"]);
    assert.equal(result.status, "declared");
  });

  it("mergeTimelines without conflict creates merged-derived node", () => {
    const store = createLineageStore();
    ensureRoot(store, "a", { stateHash: "hash" });
    ensureRoot(store, "b", { stateHash: "hash" });
    const result = mergeTimelines({ store, parentA: "a", parentB: "b", resultTimelineId: "merged" });
    assert.equal(result.ok, true);
    assert.equal(result.derived.timelineId, "merged");
    assert.deepEqual(result.derived.parentTimelineIds, ["a", "b"]);
    assert.equal(result.derived.stateHash, "merge(hash,hash)");
    assert.equal(result.status, "partial");
  });

  it("mergeTimelines records evidence envelope", () => {
    const store = createLineageStore();
    ensureRoot(store, "a", { stateHash: "hash" });
    ensureRoot(store, "b", { stateHash: "hash" });
    const result = mergeTimelines({ store, parentA: "a", parentB: "b", resultTimelineId: "merged" });
    assert.ok(result.envelope);
    assert.equal(result.envelope.operationType, "merge");
    assert.equal(result.envelope.sourceTimelineId, "a");
    assert.equal(result.envelope.resultTimelineId, "merged");
    assert.deepEqual(result.envelope.parentTimelineIds, ["a", "b"]);
    assert.equal(result.envelope.evidenceStatus, "substrate_verified");
  });
});