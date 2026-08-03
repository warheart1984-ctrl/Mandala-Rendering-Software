/**
 * Temporal evidence envelope + lineage Phase-1 tests.
 * Run: node --test src/render/rt4d/test/temporal.envelope.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_RT4D_LAB_MODE,
  normalizeRt4dLabMode,
  RT4D_LAB_MODES,
  TIME_TRAVEL_MEANINGS,
} from "../modes/index.js";
import {
  createTemporalEvidenceEnvelope,
  validateTemporalEvidenceEnvelope,
  createLineageStore,
  ensureRoot,
  forkTimeline,
  mergeTimelines,
  TEMPORAL_OP_TYPES,
} from "../temporal/index.js";

test("default lab mode is geometry", () => {
  assert.equal(DEFAULT_RT4D_LAB_MODE, "geometry");
  assert.equal(normalizeRt4dLabMode(undefined), "geometry");
  assert.equal(normalizeRt4dLabMode("spacetime"), RT4D_LAB_MODES.SPACETIME);
});

test("three time-travel meanings are distinct", () => {
  const vals = Object.values(TIME_TRAVEL_MEANINGS);
  assert.equal(new Set(vals).size, 3);
});

test("envelope validation rejects missing operationId", () => {
  const bad = createTemporalEvidenceEnvelope({
    operationId: "",
    operationType: TEMPORAL_OP_TYPES.FORK,
    sourceTimelineId: "t1",
    resultTimelineId: "t2",
    metric: { type: "euclidean" },
    parentStateHash: "a",
    resultStateHash: "b",
    evidenceStatus: "draft",
  });
  const v = validateTemporalEvidenceEnvelope({ ...bad, operationId: "" });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes("operationId")));
});

test("envelope validation accepts fork fixture", () => {
  const env = createTemporalEvidenceEnvelope({
    operationId: "temporal-op-8fa1",
    operationType: TEMPORAL_OP_TYPES.FORK,
    sourceTimelineId: "timeline-main",
    sourceEventId: "event-4800",
    resultTimelineId: "timeline-branch-03",
    observerFrame: { type: "inertial", velocity: [0.2, 0, 0], units: "c" },
    metric: { type: "minkowski", signature: "-+++" },
    transform: { type: "lorentz_boost", rapidity: 0.202733 },
    causalValidation: { passed: true, violations: [] },
    parentStateHash: "parent",
    resultStateHash: "child",
    evidenceStatus: "substrate_verified",
  });
  const v = validateTemporalEvidenceEnvelope(env);
  assert.equal(v.ok, true, v.errors.join("; "));
  assert.ok(env.replayToken.length === 64);
});

test("fork creates child with one parent; parent immutable", () => {
  const store = createLineageStore();
  const root = ensureRoot(store, "timeline-main", { stateHash: "h0" });
  const { child, parent, envelope } = forkTimeline(store, {
    sourceTimelineId: "timeline-main",
    resultTimelineId: "timeline-branch-03",
    sourceEventId: "event-4800",
  });
  assert.deepEqual(child.parentTimelineIds, ["timeline-main"]);
  assert.equal(parent.stateHash, "h0");
  assert.equal(root.stateHash, "h0");
  assert.equal(store.nodes.get("timeline-main").stateHash, "h0");
  assert.equal(envelope.operationType, "fork");
  assert.equal(envelope.evidenceStatus, "substrate_verified");
});

test("merge with divergent hashes denies without allowConflict; never overwrites parents", () => {
  const store = createLineageStore();
  ensureRoot(store, "A", { stateHash: "ha" });
  ensureRoot(store, "B", { stateHash: "hb" });
  const denied = mergeTimelines(store, {
    parentA: "A",
    parentB: "B",
    resultTimelineId: "C",
  });
  assert.equal(denied.ok, false);
  assert.equal(store.nodes.has("C"), false);
  assert.equal(store.nodes.get("A").stateHash, "ha");
  assert.equal(store.nodes.get("B").stateHash, "hb");
  assert.equal(denied.envelope.evidenceStatus, "declared");
});

test("merge with allowConflict creates new two-parent node", () => {
  const store = createLineageStore();
  ensureRoot(store, "A", { stateHash: "ha" });
  ensureRoot(store, "B", { stateHash: "hb" });
  const merged = mergeTimelines(store, {
    parentA: "A",
    parentB: "B",
    resultTimelineId: "C",
    allowConflict: true,
  });
  assert.equal(merged.ok, true);
  assert.deepEqual(merged.derived.parentTimelineIds, ["A", "B"]);
  assert.equal(store.nodes.get("A").status, "active");
  assert.equal(store.nodes.get("B").status, "active");
});
