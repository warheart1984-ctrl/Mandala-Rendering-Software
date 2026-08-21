import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runE2E } from "../run-e2e.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../../../output/mandala-engine-e2e");

describe("mandala engine e2e", () => {
  it("runs organs end-to-end and writes png+wav+receipt without mutating physics on illegal or render", async () => {
    const r = await runE2E({
      seed: 7,
      tEnd: 3,
      outDir: OUT,
      trySd: false,
      tryTts: false,
      tryGpu: false,
      width: 32,
      height: 32,
    });
    assert.equal(r.illegalRejected, true);
    assert.equal(r.renderDidNotMutate, true);
    assert.equal(r.schemaErrors.length, 0);
    assert.equal(r.receipt.movieLaneOwnsTime, false);
    assert.equal(r.receipt.hashUnchangedOnIllegal, true);
    assert.ok(existsSync(r.pngPath));
    assert.ok(existsSync(r.wavPath));
    assert.ok(existsSync(r.receiptPath));
    assert.ok(r.receipt.artifacts.some((a) => a.kind === "png"));
    assert.ok(r.receipt.artifacts.some((a) => a.kind === "wav"));
    assert.equal(r.receipt.physics?.operator, "lattice-hamiltonian");
  });
});
