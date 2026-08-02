// RT3D Ledger acceptance: capture → save → load → replay determinism + integrity.
// Grounded on renderer-core `convertSceneSpecification` + EngineHost.runFrames determinism.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { convertSceneSpecification } from "@mrs/renderer-core/scene-spec";
import { Rt3dLedger } from "../src/persistence/rt3dLedger.ts";

const TESSERACT_SPEC = {
  schemaVersion: "1.0",
  kind: "SceneSpecification",
  id: "hackathon-tesseract-spin",
  name: "Rotating tesseract",
  materials: [{ id: "neon", color: "#1accff", opacity: 1, wireframe: false }],
  entities: [
    {
      id: "tess",
      materialId: "neon",
      transform4d: { rotate: { xw: 0, zw: 0 } },
      geometry: { kind: "surface", surfaceId: "tesseract" },
    },
  ],
  defaultObservation: { modeId: "perspective_w", params: { d4: 4 } },
};

const LINEAGE = {
  intentId: "intent-l3-1",
  timelineId: "timeline-l3-1",
  worldId: "world-l3-1",
};

const DIR = join(tmpdir(), "rt3d-ledger-test");

let ledger;

before(() => {
  if (existsSync(DIR)) {
    for (const f of readdirSync(DIR)) {
      unlinkSync(join(DIR, f));
    }
  } else {
    mkdirSync(DIR, { recursive: true });
  }
  ledger = new Rt3dLedger({ directory: DIR, fixedDelta: 1 / 60 });
});

function buildSpecSeedHash() {
  return convertSceneSpecification(TESSERACT_SPEC);
}

describe("Rt3dLedger persistence + replay", () => {
  it("AC-L1: convertSceneSpecification yields a worldDocument with body-bearing entities", () => {
    const { worldDocument, specHash, seed } = buildSpecSeedHash();
    assert.ok(specHash, "specHash is non-empty");
    assert.ok(Number.isFinite(seed), "seed is a finite number");
    assert.equal(worldDocument.schemaVersion, "1.0");
    assert.ok(Array.isArray(worldDocument.entities), "worldDocument has entities");
  });

  it("AC-L2: capture produces per-frame snapshots whose count equals frames", () => {
    const { worldDocument, specHash, seed } = buildSpecSeedHash();
    const entry = ledger.capture({
      sceneId: "rt3d-scene-" + specHash.slice(0, 16),
      specHash,
      seed,
      worldDocument,
      frames: 24,
      lineage: LINEAGE,
    });
    assert.equal(entry.snapshots.length, 24);
    assert.equal(entry.frames, 24);
    assert.equal(entry.fixedDelta, 1 / 60);
    for (const snap of entry.snapshots) {
      assert.ok(snap.frameIndex > 0);
      assert.ok(Number.isFinite(snap.elapsed));
      assert.ok(snap.bodyCount > 0);
    }
  });

  it("AC-L3: save + load round-trips the entry with a valid checksum", () => {
    const { worldDocument, specHash, seed } = buildSpecSeedHash();
    const entry = ledger.capture({
      sceneId: "rt3d-scene-" + specHash.slice(0, 16),
      specHash,
      seed,
      worldDocument,
      frames: 8,
      lineage: LINEAGE,
    });
    ledger.save(entry);
    assert.ok(existsSync(join(DIR, specHash + ".json")), "ledger file written");

    const loaded = ledger.load(specHash);
    assert.ok(loaded, "load returns the entry");
    assert.equal(loaded.sceneId, entry.sceneId);
    assert.equal(loaded.frames, 8);
    assert.equal(loaded.snapshots.length, 8);
    assert.equal(computeChecksum(loaded), loaded.checksum, "checksum re-verifies after load");
  });

  it("AC-L4: replay determinism — re-running reproduces every captured frame within 1e-9", () => {
    const { worldDocument, specHash, seed } = buildSpecSeedHash();
    const entry = ledger.capture({
      sceneId: "rt3d-scene-" + specHash.slice(0, 16),
      specHash,
      seed,
      worldDocument,
      frames: 40,
      lineage: LINEAGE,
    });
    ledger.save(entry);
    const reloaded = ledger.load(specHash);
    const result = ledger.replay(reloaded);
    assert.equal(result.ok, true, "replay mismatch: " + (result.mismatch || ""));
  });

  it("AC-L5: checksum tamper detection — mutating a snapshot body causes load to reject", () => {
    const { worldDocument, specHash, seed } = buildSpecSeedHash();
    const entry = ledger.capture({
      sceneId: "rt3d-scene-" + specHash.slice(0, 16),
      specHash,
      seed,
      worldDocument,
      frames: 4,
      lineage: LINEAGE,
    });
    ledger.save(entry);

    const rawPath = join(DIR, specHash + ".json");
    const raw = JSON.parse(readFileSync(rawPath, "utf8"));
    raw.snapshots[1].bodies[0].position.x += 1.0;
    writeFileSync(rawPath, JSON.stringify(raw), "utf8");

    assert.throws(
      () => ledger.load(specHash),
      /checksum/,
      "load throws on checksum failure",
    );
  });

  it("AC-L6: replay rejects a malformed entry whose snapshot count != frames", () => {
    const { worldDocument, specHash, seed } = buildSpecSeedHash();
    const entry = ledger.capture({
      sceneId: "rt3d-scene-" + specHash.slice(0, 16),
      specHash,
      seed,
      worldDocument,
      frames: 4,
      lineage: LINEAGE,
    });
    const bad = { ...entry, snapshots: entry.snapshots.slice(0, 2) };
    bad.checksum = computeChecksum(bad);
    const result = ledger.replay(bad);
    assert.equal(result.ok, false);
    assert.match(result.mismatch, /snapshot count|snapshot mismatch/i);
  });
});

function computeChecksum(entry) {
  const canonical = JSON.stringify(sortKeys({
    sceneId: entry.sceneId,
    specHash: entry.specHash,
    seed: entry.seed,
    fixedDelta: entry.fixedDelta,
    frames: entry.frames,
    snapshots: entry.snapshots,
    lineage: entry.lineage,
  }));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}
