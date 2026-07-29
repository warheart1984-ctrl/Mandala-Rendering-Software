/**
 * CSSV ledger — browser-safe import graph + Node guard on loadLedger.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { CssvRegistry, BrowserCssvHost } from "../CssvRegistry.js";
import { ledgerPaths } from "../ledgerPaths.js";
import { isNodeLedgerHost, loadLedger } from "../ledgerNode.js";
import {
  getInjectableLogger,
  setInjectableLogger,
} from "../../logging/injectableLogger.js";

const cssvDir = dirname(fileURLToPath(import.meta.url));

describe("cssv ledger — browser-safe registry", () => {
  it("CssvRegistry does not statically import ledger.js or ledgerNode.js", () => {
    const src = readFileSync(resolve(cssvDir, "../CssvRegistry.js"), "utf8");
    assert.doesNotMatch(src, /from\s+["']\.\/ledger\.js["']/);
    assert.doesNotMatch(src, /from\s+["']\.\/ledgerNode\.js["']/);
    assert.match(src, /ledgerPaths\.js/);
  });

  it("ledgerPaths is pure (no node: specifiers in module)", () => {
    const src = readFileSync(resolve(cssvDir, "../ledgerPaths.js"), "utf8");
    assert.doesNotMatch(src, /node:/);
  });

  it("in-memory registry works without persistence", () => {
    const reg = new CssvRegistry({
      host: new BrowserCssvHost(),
      persist: false,
    });
    reg.registerFrame({
      intentId: "i1",
      timelineId: "t1",
      worldId: "w1",
      timeSeconds: 1,
      parameters: { x: 1 },
    });
    const snap = reg.exportSnapshot();
    assert.equal(snap.frames.length, 1);
    assert.equal(snap.frames[0].intent, "i1");
  });

  it("exportLedgerDownload does not touch filesystem", () => {
    const reg = new CssvRegistry({ persist: false });
    const pack = reg.exportLedgerDownload("test");
    assert.match(pack.filename, /^test-/);
    assert.ok(pack.json.includes('"frames"'));
  });
});

describe("cssv ledger — Node host guard", () => {
  it("isNodeLedgerHost is true under node:test", () => {
    assert.equal(isNodeLedgerHost(), true);
  });

  it("loadLedger succeeds in Node with explicit temp root", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "cssv-ledger-"));
    const ledger = await loadLedger(root);
    assert.ok(Array.isArray(ledger.artifacts));
    assert.ok(Array.isArray(ledger.transitions));
    assert.ok(Array.isArray(ledger.frames));
  });
});

describe("injectableLogger — CSSV structured warn", () => {
  it("routes ledger NDJSON skip to injectable sink", async () => {
    const warnings = [];
    setInjectableLogger({
      warn: (payload) => warnings.push(payload),
    });
    try {
      const { loadNdjson } = await import("../ledgerNode.js");
      const { mkdtempSync, writeFileSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const dir = mkdtempSync(join(tmpdir(), "cssv-ndjson-"));
      const file = join(dir, "bad.ndjson");
      writeFileSync(file, "{ not json }\n", "utf8");
      const rows = await loadNdjson(file);
      assert.deepEqual(rows, []);
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0].tag, "cssv.ledger");
    } finally {
      setInjectableLogger(null);
      assert.equal(getInjectableLogger(), null);
    }
  });
});
