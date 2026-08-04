/**
 * Gateway failback router tests — primary success, primary→fallback
 * failover, both-fail, timeout, and timestamped failure logging.
 */

import assert from "node:assert/strict";
import { describe, it, after, before } from "node:test";
import { createServer } from "node:http";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callGateway, routedRequest } from "../src/index.js";

let server;
let port;
let mode = "ok";

before(async () => {
  server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (mode === "slow") {
      setTimeout(() => res.end(JSON.stringify({ from: "server" })), 5000);
      return;
    }
    if (mode === "error") {
      res.statusCode = 500;
      res.end(JSON.stringify({ from: "server", error: "boom" }));
      return;
    }
    res.end(JSON.stringify({ from: "server", mode }));
  });
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function gw(name, timeoutMs = 2000) {
  return { name, baseUrl: `http://127.0.0.1:${port}`, timeoutMs };
}

describe("callGateway", () => {
  it("returns ok result with parsed data on 2xx", async () => {
    mode = "ok";
    const res = await callGateway(gw("primary"), "/render", { sceneId: "clifford-torus" });
    assert.equal(res.ok, true);
    assert.equal(res.gateway, "primary");
    assert.equal(res.status, 200);
    assert.equal(res.data.mode, "ok");
  });

  it("returns non-ok on non-2xx HTTP status", async () => {
    mode = "error";
    const res = await callGateway(gw("primary"), "/render", {});
    assert.equal(res.ok, false);
    assert.equal(res.status, 500);
    assert.equal(res.error, "HTTP 500");
  });

  it("returns status 0 with error on connection refused", async () => {
    const res = await callGateway({ name: "dead", baseUrl: "http://127.0.0.1:9", timeoutMs: 500 }, "/render", {});
    assert.equal(res.ok, false);
    assert.equal(res.status, 0);
    assert.ok(res.error);
  });

  it("aborts on timeout and returns status 0", async () => {
    mode = "slow";
    const res = await callGateway(gw("slow", 200), "/render", {});
    assert.equal(res.ok, false);
    assert.equal(res.status, 0);
    assert.match(res.error ?? "", /abort/i);
  });
});

describe("routedRequest failback", () => {
  it("returns the primary result when primary succeeds", async () => {
    mode = "ok";
    const res = await routedRequest("/render", { sceneId: "trefoil-4d" }, gw("primary"), gw("fallback"));
    assert.equal(res.ok, true);
    assert.equal(res.gateway, "primary");
  });

  it("falls back to the fallback gateway when primary fails", async () => {
    mode = "ok";
    const logDir = mkdtempSync(join(tmpdir(), "router-test-"));
    try {
      const res = await routedRequest(
        "/render",
        { sceneId: "trefoil-4d" },
        { name: "primary", baseUrl: "http://127.0.0.1:9", timeoutMs: 500 },
        gw("fallback"),
        { logDir },
      );
      assert.equal(res.ok, true);
      assert.equal(res.gateway, "fallback");
      assert.equal(res.status, 200);

      const logs = readdirSync(logDir).filter((f) => f.startsWith("router-log-"));
      assert.equal(logs.length, 1, "failure log written on primary failure");
      const entry = JSON.parse(readFileSync(join(logDir, logs[0]), "utf8"));
      assert.equal(entry.primary.ok, false);
      assert.equal(entry.primary.status, 0);
      assert.equal(entry.fallback.ok, true);
      assert.equal(entry.path, "/render");
    } finally {
      rmSync(logDir, { recursive: true, force: true });
    }
  });

  it("returns the fallback failure when both gateways fail", async () => {
    mode = "error";
    const res = await routedRequest(
      "/render",
      {},
      { name: "primary", baseUrl: "http://127.0.0.1:9", timeoutMs: 500 },
      { name: "fallback", baseUrl: "http://127.0.0.1:9", timeoutMs: 500 },
      { logOnFailure: false },
    );
    assert.equal(res.ok, false);
    assert.equal(res.gateway, "fallback");
    assert.equal(res.status, 0);
  });
});
