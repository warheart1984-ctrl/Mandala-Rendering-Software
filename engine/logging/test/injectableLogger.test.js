import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getInjectableLogger,
  logStructured,
  setInjectableLogger,
} from "../injectableLogger.js";

describe("injectableLogger", () => {
  it("defaults to no-op (no throw)", () => {
    setInjectableLogger(null);
    logStructured("warn", "test", "hello");
    assert.equal(getInjectableLogger(), null);
  });

  it("forwards to sink when set", () => {
    const lines = [];
    setInjectableLogger({
      info: (p) => lines.push(p),
    });
    logStructured("info", "gov", "allowed", { policyId: "p1" });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].tag, "gov");
    setInjectableLogger(null);
  });
});
