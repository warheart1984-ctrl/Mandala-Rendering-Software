import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "../src/cli.js");

function run(args: readonly string[]): string {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

describe("Sovereign Sculptor command-line pipeline", () => {
  it("generates deterministic human, fox, and anthro bundles and verifies each GLB", () => {
    const first = mkdtempSync(join(tmpdir(), "sovereign-sculptor-a-"));
    const second = mkdtempSync(join(tmpdir(), "sovereign-sculptor-b-"));
    try {
      run(["fixture", "all", "--out", first]);
      run(["fixture", "all", "--out", second]);
      for (const species of ["human", "fox", "anthro"] as const) {
        const stem = `${species}-character-fixture`;
        const entriesA = readdirSync(join(first, species)).sort();
        const entriesB = readdirSync(join(second, species)).sort();
        assert.deepEqual(entriesA, entriesB);
        for (const entry of entriesA) {
          assert.deepEqual(
            readFileSync(join(first, species, entry)),
            readFileSync(join(second, species, entry)),
            `${species}/${entry} must be byte-identical`,
          );
        }
        const glbA = join(first, species, `${stem}.glb`);
        const verification = JSON.parse(run(["verify", glbA, "--profile", species])) as { ok: boolean };
        assert.equal(verification.ok, true);
      }
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });
});
