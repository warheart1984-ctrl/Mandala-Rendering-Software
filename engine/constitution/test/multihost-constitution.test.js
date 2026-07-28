/**
 * MultiHost constitutional routing — Browser / Unity / Unreal JS bridges.
 *
 * STATUS: Host constitutional routing layer **enforced** (this file).
 * Unity/Unreal product hosts remain **skeleton** (no Play Mode / PIE CI).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as Browser from "../../runtime/hosts/BrowserHostBridge.js";
import * as Unity from "../../runtime/hosts/UnityHostBridge.js";
import * as Unreal from "../../runtime/hosts/UnrealHostBridge.js";
import {
  HostAction,
  route,
} from "../../runtime/hosts/HostConstitutionalRouter.js";
import { createBrowserAdapter } from "../../conformance/BrowserRuntimeAdapter.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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

describe("multihost-constitution — shared denies", () => {
  const hosts = [
    ["browser", Browser],
    ["unity", Unity],
    ["unreal", Unreal],
  ];

  for (const [name, bridge] of hosts) {
    it(`${name}: denies gpu.print, allows renderAssist`, () => {
      const denied = bridge.route(HostAction.GPU_PRINT, {});
      assert.equal(denied.ok, false, name);
      assert.match(denied.message, /cpu\.rt4d\.print/);

      const assist = bridge.route(HostAction.RENDER_ASSIST, {});
      assert.equal(assist.ok, true, name);
      assert.equal(assist.assistOnly, true);

      const caps = bridge.getCapabilities();
      assert.equal(caps.gpuPrint, false);
      assert.equal(caps.renderAssist, true);

      const id = bridge.getActorIdentity();
      assert.equal(id.host, name);
      assert.ok(id.actor);
    });

    it(`${name}: denies injectEvidence apiKey`, () => {
      const r = bridge.route(HostAction.INJECT_EVIDENCE, {
        evidence: { id: "e1", worldId: "w", timelineId: "t", apiKey: "secret" },
      });
      assert.equal(r.ok, false);
      assert.equal(r.reason, "evidence_purity");
    });

    it(`${name}: denies setDeterminismRequired as GPU print authority`, () => {
      const r = bridge.route(HostAction.SET_DETERMINISM_REQUIRED, {
        asPrintAuthority: true,
        capabilityId: "gpu.compute.nvidia.cuda",
      });
      assert.equal(r.ok, false);
      assert.equal(r.reason, "determinism_not_print_authority");
    });
  }
});

describe("multihost-constitution — BrowserRuntimeAdapter surface", () => {
  it("exposes getActorIdentity / getCapabilities / route alongside probes", async () => {
    const adapter = await createBrowserAdapter(stubFetch);
    assert.equal(typeof adapter.getActorIdentity, "function");
    assert.equal(typeof adapter.getCapabilities, "function");
    assert.equal(typeof adapter.route, "function");
    assert.equal(typeof adapter["ckl.deny-without-intent"], "function");

    const id = adapter.getActorIdentity();
    assert.equal(id.host, "browser");
    assert.equal(id.actor, "4dce.renderer");

    const caps = adapter.getCapabilities();
    assert.equal(caps.gpuPrint, false);

    const denied = adapter.route("gpu.print", {});
    assert.equal(denied.ok, false);
  });
});

describe("multihost-constitution — SoT single route()", () => {
  it("gpu.* capability uses print safeguard", () => {
    const r = route("gpu.compute.nvidia.cuda", { determinismRequired: true });
    assert.equal(r.ok, false);
    assert.match(String(r.code), /GPU_PRINT_SAFEGUARD|HOST_CONSTITUTIONAL/);
  });
});
