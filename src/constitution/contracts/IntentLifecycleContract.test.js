// mrs/packages/renderer-core/src/constitution/contracts/IntentLifecycleContract.test.js
// Test suite for IntentLifecycleContract

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { IntentLifecycleContract, INTENT_STATES, INTENT_CATEGORIES, INTENT_PRIORITIES } from "./IntentLifecycleContract.js";

describe("IntentLifecycleContract", () => {
  let contract;

  beforeEach(() => {
    contract = new IntentLifecycleContract();
  });
  it("can declare a new intent", () => {
    const record = contract.declareIntent({
      action: "render_scene",
      category: "render",
      priority: 1,
      params: { surface: "tesseract" }
    });
    
    assert.ok(record.id);
    assert.equal(record.state, "declared");
    assert.equal(record.declaration.action, "render_scene");
    assert.equal(record.category, "render");
    assert.equal(record.priority, 1);
  });

  it("validates intent structure", () => {
    try {
      contract.declareIntent({});
      assert.fail("Should have thrown");
    } catch (e) {
      assert.ok(e.message.includes("action is required"));
    }
  });

  it("can validate a declared intent", () => {
    const record = contract.declareIntent({
      action: "test_action",
      category: "render"
    });
    
    const result = contract.validateIntent(record.id);
    assert.ok(result.valid);
    assert.equal(result.errors.length, 0);
  });

  it("can authorize a validated intent", () => {
    const record = contract.declareIntent({
      action: "test",
      category: "render"
    });
    contract.validateIntent(record.id);
    
    const auth = contract.authorizeIntent(record.id, "system:test");
    assert.equal(auth.authorized, true);
    assert.equal(auth.intentId, record.id);
  });

  it("rejects authorization of unvalidated intent", () => {
    const record = contract.declareIntent({
      action: "test",
      category: "render"
    });
    
    const auth = contract.authorizeIntent(record.id, "system:test");
    assert.equal(auth.authorized, false);
    assert.ok(auth.reason.includes("not in validated state"));
  });

  it("can execute an authorized intent", async () => {
    const record = contract.declareIntent({
      action: "test",
      category: "render",
      params: { value: 42 }
    });
    contract.validateIntent(record.id);
    contract.authorizeIntent(record.id, "system:test");
    
    const executor = {
      id: "test-executor",
      async execute(declaration) {
        return { result: declaration.params.value * 2 };
      }
    };
    
    const result = await contract.executeIntent(record.id, executor);
    assert.equal(result.success, true);
    assert.equal(result.result.result, 84);
  });

  it("can suspend and resume intents", () => {
    const record = contract.declareIntent({
      action: "long_task",
      category: "render"
    });
    contract.validateIntent(record.id);
    contract.authorizeIntent(record.id, "system:test");
    
    const suspended = contract.suspendIntent(record.id, "paused for review");
    assert.equal(suspended, true);
    
    const record2 = contract.getIntent(record.id);
    assert.equal(record2.state, "suspended");
    
    const resumed = contract.resumeIntent(record.id);
    assert.equal(resumed, true);
    
    const record3 = contract.getIntent(record.id);
    assert.equal(record3.state, "authorized");
  });

  it("can revoke intents", () => {
    const record = contract.declareIntent({
      action: "cancel_me",
      category: "render"
    });
    contract.validateIntent(record.id);
    contract.authorizeIntent(record.id, "system:test");
    
    const revoked = contract.revokeIntent(record.id, "no longer needed");
    assert.equal(revoked, true);
    
    const record2 = contract.getIntent(record.id);
    assert.equal(record2.state, "revoked");
  });

  it("filters intents by filter", () => {
    contract.declareIntent({ action: "a", category: "render" });
    contract.declareIntent({ action: "b", category: "tensor" });
    contract.declareIntent({ action: "c", category: "render", priority: 1 });
    
    const renderIntents = contract.getIntents({ category: "render" });
    assert.equal(renderIntents.length, 2);
    
    const highPriority = contract.getIntents({ priority: 1 });
    assert.equal(highPriority.length, 1);
  });

  it("provides stats", () => {
    const stats = contract.getStats();
    assert.ok(typeof stats.total === "number");
    assert.ok(typeof stats.byState === "object");
    assert.ok(typeof stats.byCategory === "object");
    assert.ok(typeof stats.totalHistory === "number");
  });

  it("tracks history", () => {
    const record = contract.declareIntent({
      action: "history_test",
      category: "render"
    });
    contract.validateIntent(record.id);
    contract.authorizeIntent(record.id, "system:test");
    
    const history = contract.getHistory(record.id);
    assert.ok(history.length >= 3); // declared, validated, authorized
    assert.ok(history.some(h => h.event === "declared"));
    assert.ok(history.some(h => h.event === "validated"));
    assert.ok(history.some(h => h.event === "authorized"));
  });
});