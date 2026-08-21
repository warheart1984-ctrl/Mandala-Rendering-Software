import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBlenderAnthroInvocation, type BlenderRuntime } from "../src/blender.js";

describe("Sovereign Sculptor Blender adapter", () => {
  it("builds the Linux Flatpak invocation without Windows paths", () => {
    const runtime: BlenderRuntime = {
      command: "flatpak",
      prefixArgs: ["run", "--command=blender", "org.blender.Blender"],
      source: "flatpak-user",
    };
    const invocation = buildBlenderAnthroInvocation(runtime, {
      outputDir: "/tmp/mandala-blender-proof",
      rigPath: "/tmp/anthro.rig.json",
      skinPath: "/tmp/anthro.skin.json",
      blueprintPath: "/tmp/heroic-fox.blueprint.json",
      size: 512,
      seed: 1990,
    });
    assert.equal(invocation.command, "flatpak");
    assert.deepEqual(invocation.args.slice(0, 3), runtime.prefixArgs);
    assert.ok(invocation.args.some((part) => part.endsWith("sovereign_anthro_demo.py")));
    assert.ok(invocation.args.includes("/tmp/anthro.rig.json"));
    assert.ok(invocation.args.includes("/tmp/anthro.skin.json"));
    assert.ok(invocation.args.includes("/tmp/heroic-fox.blueprint.json"));
    assert.ok(!invocation.args.some((part) => part.includes("C:\\Program Files")));
  });

  it("rejects unsafe render dimensions before starting Blender", () => {
    const runtime: BlenderRuntime = { command: "blender", prefixArgs: [], source: "native" };
    assert.throws(() => buildBlenderAnthroInvocation(runtime, { size: 64 }), /256 to 4096/);
  });
});
