import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEditorArgs, runEditor, EDITOR_STATUS } from "../editor/cli.mjs";

describe("editor v0.8", () => {
  it("refuses physics edits without a Chamber proposal", () => {
    const refused = runEditor({ command: "set-phi", propose: false });
    assert.equal(refused.ok, false);
    assert.equal(refused.code, "physics-edit-requires-proposal");
    const still = runEditor({ command: "set-phi", propose: true });
    assert.equal(still.ok, false);
  });

  it("lists slices and reports certified hash; --organ is a working stub", () => {
    const listed = runEditor({ command: "list", seed: 7, steps: 2 });
    assert.ok(listed.slices.length >= 3);
    assert.equal(listed.abiId, "mandala-engine-organ.v1");
    const hashed = runEditor({ command: "hash", seed: 7, steps: 2 });
    assert.equal(hashed.hash, listed.slices[listed.slices.length - 1].hash);
    const scrubbed = runEditor({ command: "scrub", t: 1, seed: 7, steps: 2 });
    assert.equal(scrubbed.t, 1);
    assert.equal(scrubbed.ownsTime, false);
    const organ = runEditor(parseEditorArgs(["node", "cli.mjs", "--organ", "Mandala"]));
    assert.equal(organ.organ, "Mandala");
    assert.equal(organ.liveShaderReload, "blocked-with-evidence");
    assert.equal(EDITOR_STATUS, "partial");
  });
});
