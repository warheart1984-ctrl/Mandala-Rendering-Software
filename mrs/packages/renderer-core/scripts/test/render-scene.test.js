/**
 * Tests for scripts/render-scene.mjs — SceneSpecification still path.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { renderSceneFromSpec } from "../render-scene.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "render-scene.mjs");

const SPEC = {
  schemaVersion: "1.0",
  kind: "SceneSpecification",
  id: "test-tesseract",
  materials: [{ id: "neon", color: "#1accff", opacity: 1 }],
  entities: [
    {
      id: "tess",
      materialId: "neon",
      geometry: { kind: "surface", surfaceId: "tesseract" },
    },
  ],
  camera: {
    position4d: [4.3, 1.4, 0.2, 0.1],
    target4d: [0, 0.1, 0, 0],
  },
  output: { width: 32, height: 24, samples: 2, maxDepth: 3, seed: 7 },
};

describe("renderSceneFromSpec", () => {
  it("renders a PNG with provenance including specHash", () => {
    const { png, provenance } = renderSceneFromSpec(SPEC);
    assert.ok(png.length > 100);
    assert.equal(png[0], 0x89);
    assert.equal(provenance.kind, "deterministic-scene-spec-4d-render");
    assert.equal(typeof provenance.specHash, "string");
    assert.equal(provenance.specHash.length, 64);
    assert.equal(provenance.seed, 7);
    assert.equal(provenance.frameIndex, 0);
    assert.equal(provenance.sha256, createHash("sha256").update(png).digest("hex"));
  });

  it("is deterministic across two runs", () => {
    const a = renderSceneFromSpec(SPEC);
    const b = renderSceneFromSpec(SPEC);
    assert.equal(a.provenance.sha256, b.provenance.sha256);
    assert.deepEqual(a.png, b.png);
  });

  it("rejects invalid spec with field paths", () => {
    assert.throws(
      () =>
        renderSceneFromSpec({
          schemaVersion: "1.0",
          id: "bad",
          entities: [],
        }),
      (err) => {
        assert.equal(err.code, "SPEC_INVALID");
        assert.ok(Array.isArray(err.errors));
        assert.ok(err.errors.some((e) => e.path === "entities"));
        return true;
      },
    );
  });

  it("samples animation frame with different hash content but stable seed", () => {
    const animSpec = {
      ...SPEC,
      animation: {
        duration: 1,
        fps: 2,
        keyframes: [
          { time: 0, entities: { tess: { transform4d: { rotate: { xw: 0 } } } } },
          {
            time: 1,
            entities: { tess: { transform4d: { rotate: { xw: 1.5 } } } },
          },
        ],
      },
    };
    const f0 = renderSceneFromSpec(animSpec, { frame: 0 });
    const f1 = renderSceneFromSpec(animSpec, { frame: 1 });
    assert.equal(f0.provenance.seed, f1.provenance.seed);
    assert.notEqual(f0.provenance.sha256, f1.provenance.sha256);
  });
});

describe("render-scene CLI", () => {
  it("writes PNG via --spec", () => {
    const dir = mkdtempSync(join(tmpdir(), "render-scene-"));
    try {
      const specPath = join(dir, "spec.json");
      const outPath = join(dir, "out.png");
      writeFileSync(specPath, JSON.stringify(SPEC));
      const proc = spawnSync(
        process.execPath,
        [SCRIPT, "--spec", specPath, "--output", outPath],
        { encoding: "utf8" },
      );
      assert.equal(proc.status, 0, proc.stderr);
      const png = readFileSync(outPath);
      assert.ok(png.length > 100);
      const line = proc.stdout.trim().split(/\r?\n/).pop();
      const prov = JSON.parse(line);
      assert.equal(prov.kind, "deterministic-scene-spec-4d-render");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
