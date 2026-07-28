/**
 * Soft splat acceptance tests.
 *
 * STATUS: **enforced**
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { softSplatAccumulate } from "./softSplat.js";
import { projectFootprint } from "./projectFootprint.js";
import { fromHyperspheres } from "./fromHyperspheres.js";
import { fromSceneSpec } from "./fromSceneSpec.js";
import { ProtonRegistry } from "./registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("proton softSplat", () => {
  it("refuses without intentId", () => {
    assert.throws(
      () => softSplatAccumulate([], { width: 8, height: 8 }),
      /intentId is required/,
    );
  });

  it("same inputs → same frameSha256 (deterministic)", () => {
    const protons = fromHyperspheres([
      { id: "a", mu: [0, 0, 0, 0], radius: 1, color: [1, 0.5, 0.2], opacity: 0.9 },
      { id: "b", center: [0.8, 0.1, 0, 0], radius: 0.6, color: [0.2, 0.8, 1], opacity: 0.8 },
    ]);
    const fps = projectFootprint(protons, { width: 64, height: 64 });
    const opts = {
      width: 64,
      height: 64,
      intentId: "test-intent-det",
      protonCount: protons.length,
      protonsHash: "abc",
    };
    const a = softSplatAccumulate(fps, opts);
    const b = softSplatAccumulate(fps, opts);
    assert.equal(a.evidence.frameSha256, b.evidence.frameSha256);
    assert.equal(a.evidence.frameSha256.length, 64);
  });

  it("protonCount matches registry / footprints", () => {
    const protons = fromHyperspheres([
      { id: "p0", mu: [0, 0, 0, 0], radius: 1 },
      { id: "p1", mu: [1, 0, 0, 0], radius: 0.5 },
    ]);
    const reg = new ProtonRegistry();
    for (const p of protons) reg.add(p);
    const fps = projectFootprint(reg.list(), { width: 32, height: 32 });
    const { evidence } = softSplatAccumulate(fps, {
      width: 32,
      height: 32,
      intentId: "count-intent",
      protonCount: reg.size,
      protonsHash: reg.hash(),
    });
    assert.equal(evidence.protonCount, 2);
    assert.equal(evidence.kernel.type, "gaussian2d");
    assert.equal(evidence.kernel.supportSigma, 3);
    assert.ok(evidence.protonsHash);
  });

  it("projectFootprint yields isotropic footprints for protons", () => {
    const protons = fromHyperspheres([
      { id: "c", mu: [0, 0, 0, 0], radius: 1.2, color: [1, 1, 1] },
    ]);
    const fps = projectFootprint(protons, { width: 128, height: 128, scale: 80 });
    assert.equal(fps.length, 1);
    assert.ok(fps[0].sigma >= 0.5);
    assert.ok(Number.isFinite(fps[0].x));
    assert.ok(Number.isFinite(fps[0].y));
  });

  it("soft splat sibling path has no PRNG and no still-renderer import", () => {
    const src = readFileSync(join(__dirname, "softSplat.js"), "utf8");
    assert.equal(/HeadlessStillRenderer/.test(src), false);
    assert.equal(/\bMath\.random\b/.test(src), false);
    assert.equal(/from\s+["'].*Headless/.test(src), false);
  });

  it("evidence fields attach on success", () => {
    const fps = projectFootprint(
      fromHyperspheres([{ id: "e", mu: [0, 0, 0, 0], radius: 1 }]),
      { width: 16, height: 16 },
    );
    const { evidence } = softSplatAccumulate(fps, {
      width: 16,
      height: 16,
      intentId: "ev-1",
      worldId: "w-1",
      timelineId: "t-1",
      timeSeconds: 0,
      protonsHash: "ph",
    });
    assert.equal(evidence.intentId, "ev-1");
    assert.equal(evidence.worldId, "w-1");
    assert.equal(evidence.timelineId, "t-1");
    assert.equal(evidence.timeSeconds, 0);
    assert.ok(evidence.frameSha256);
  });

  it("anisotropic Σ without radius is out of MVP (no footprint)", () => {
    const protons = fromHyperspheres([
      { id: "aniso", Sigma: [[1, 0], [0, 1]], mu: [0, 0, 0, 0] },
    ]);
    assert.equal(protons.length, 0);
  });

  it("fromSceneSpec central-orb / surface produces ≥1 proton", () => {
    const protons = fromSceneSpec(
      {
        entities: [
          {
            id: "orb",
            geometry: { kind: "surface", surfaceId: "central-orb" },
          },
        ],
      },
      { intentId: "scene-1" },
    );
    assert.ok(protons.length >= 1);
    assert.ok(protons[0].mu || protons[0].center);
    assert.equal(protons[0].meta?.intentId, "scene-1");
  });
});
