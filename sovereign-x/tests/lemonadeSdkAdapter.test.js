/**
 * Lemonade SDK façade re-exports — keep SX import path green.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADAPTER_ID,
  PROVIDER_ID,
  DEFAULT_BASE_CANDIDATES,
  resolveLemonadeSdkBaseCandidates,
  isLlmModel,
  probeLemonadeSdk,
  chatViaLemonadeSdk,
  LemonadeSdkChatClient,
} from "../router/modules/gpu/amd/lemonadeSdkAdapter.js";

describe("lemonadeSdkAdapter façade", () => {
  it("re-exports chat adapter surface", () => {
    assert.equal(ADAPTER_ID, "sx.adapter.lemonade.sdk.chat");
    assert.equal(PROVIDER_ID, "lemonade-sdk");
    assert.ok(DEFAULT_BASE_CANDIDATES.length >= 2);
    assert.equal(typeof LemonadeSdkChatClient, "function");
    assert.equal(typeof resolveLemonadeSdkBaseCandidates, "function");
    assert.equal(typeof isLlmModel, "function");
    assert.equal(typeof probeLemonadeSdk, "function");
    assert.equal(typeof chatViaLemonadeSdk, "function");
  });

  it("chat without prompt is blocked", async () => {
    const r = await chatViaLemonadeSdk({ prompt: "" });
    assert.equal(r.ok, false);
    assert.equal(r.code, "PROMPT_REQUIRED");
  });
});
