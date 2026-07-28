/**
 * BrowserRuntimeAdapter constitutional helpers (extends conformance probes).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createBrowserAdapter } from "../../conformance/BrowserRuntimeAdapter.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

async function stubFetch(url) {
  const href = typeof url === "string" ? url : String(url);
  let filePath;
  try {
    filePath = fileURLToPath(new URL(href));
  } catch {
    filePath = resolve(root, href.replace(/^file:\/*/i, ""));
  }
  const text = await readFile(filePath, "utf-8");
  return { ok: true, json: async () => JSON.parse(text) };
}

describe("BrowserRuntimeAdapter — constitutional host API", () => {
  it("route denies gpu.print and allows renderAssist", async () => {
    const adapter = await createBrowserAdapter(stubFetch);
    assert.equal(adapter.route("gpu.print").ok, false);
    assert.equal(adapter.route("renderAssist").ok, true);
    assert.equal(adapter.getCapabilities().injectEvidenceSecrets, false);
  });
});
