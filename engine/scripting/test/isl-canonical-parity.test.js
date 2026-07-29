/**
 * ISL SoT — canonical scripts vs fixture manifest (JS authoritative).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

import { createIslEngine } from "../IslInterpreter.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const manifest = JSON.parse(
  readFileSync(resolve(repoRoot, "engine/scripting/isl-canonical-fixtures.json"), "utf8"),
);

describe("isl-canonical-parity — JS SoT vs fixtures", () => {
  const isl = createIslEngine();

  for (const fx of manifest.fixtures) {
    it(`${fx.id}: CompileAndEvaluate matches manifest`, async () => {
      const modPath = resolve(repoRoot, fx.module);
      const modUrl = pathToFileURL(modPath).href;
      const mod = await import(modUrl);
      const source = mod[fx.export];
      assert.equal(typeof source, "string", `${fx.export} missing`);

      const intent = isl.CompileAndEvaluate(source);
      const exp = fx.expect;

      assert.equal(intent.type, exp.type);
      assert.equal(intent.world, exp.world);
      assert.equal(intent.source, exp.source);

      if (exp.timeline != null) assert.equal(intent.timeline, exp.timeline);
      if (exp.entity != null) assert.equal(intent.entity, exp.entity);
      if (exp.at != null) assert.equal(intent.at, exp.at);
      if (exp.evidenceId != null) assert.equal(intent.evidenceId, exp.evidenceId);
      if (exp.params != null) {
        assert.deepEqual(intent.params, exp.params);
      }
    });
  }
});
