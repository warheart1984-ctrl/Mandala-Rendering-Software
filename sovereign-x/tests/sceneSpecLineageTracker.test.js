/**
 * SceneSpec lineage tracker smoke test — no secrets in rows.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MemoryLineageStore,
  SceneSpecLineageTracker,
} from "../lineage/sceneSpecLineageTracker.js";

describe("SceneSpecLineageTracker", () => {
  it("records assist → print chain without keys", () => {
    const store = new MemoryLineageStore();
    const lineage = new SceneSpecLineageTracker(store);
    lineage.recordFluxAssist({
      intentId: "t1",
      sourceImage: "./a.png",
      prompt: "coffee shop",
      fluxResult: { tags: ["face:soft"], cameras: [{}], lighting: [{}, {}] },
    });
    lineage.recordSceneSpec({
      intentId: "t1",
      sceneSpecHints: { tags: ["face:soft"] },
    });
    lineage.recordCharacterSpec({
      intentId: "t1",
      characterSpec: { kind: "CharacterSpec", faceStyle: "soft" },
    });
    lineage.recordRt4dPrint({ intentId: "t1", frameHash: "abc123" });
    const rows = store.list();
    assert.equal(rows.length, 4);
    assert.equal(rows[0].assistOnly, true);
    assert.equal(rows[3].printSoT, true);
    const blob = JSON.stringify(rows);
    assert.ok(!blob.includes("nvapi"));
    assert.ok(!blob.includes("Authorization"));
  });
});
