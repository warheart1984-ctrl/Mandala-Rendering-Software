// RT3D evidence bridge acceptance: envelope build + verify against the RT3D ledger.
// Grounded on Rt3dLedger capture + replay determinism.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { convertSceneSpecification } from "@mrs/renderer-core/scene-spec";
import { Rt3dLedger } from "../src/persistence/rt3dLedger.ts";
import {
  buildRt3dEvidenceEnvelope,
  verifyRt3dEvidenceEnvelope,
  trajectoryRoot,
} from "../src/evidence/rt3dEvidenceBridge.ts";

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

const LINEAGE = { intentId: "intent-l3-1", timelineId: "timeline-l3-1", worldId: "world-l3-1" };
const DIR = join(tmpdir(), "rt3d-evidence-test");
let ledger;

before(() => {
  if (existsSync(DIR)) {
    for (const f of readdirSync(DIR)) unlinkSync(join(DIR, f));
  } else {
    mkdirSync(DIR, { recursive: true });
  }
  ledger = new Rt3dLedger({ directory: DIR, fixedDelta: 1 / 60 });
});

describe("RT3D evidence bridge", () => {
  it("AC-C1: buildRt3dEvidenceEnvelope attaches provenance + trajectory anchors to a captured entry", async () => {
    const { worldDocument, specHash, seed } = convertSceneSpecification(TESSERACT_SPEC);
    const entry = ledger.capture({
      sceneId: "rt3d-scene-" + specHash.slice(0, 16),
      specHash,
      seed,
      worldDocument,
      frames: 12,
      lineage: LINEAGE,
    });
    const env = buildRt3dEvidenceEnvelope(entry);
    assert.equal(env.operation, "rt3d_state_capture");
    assert.equal(env.source, "mrs-rt4d-engine/rt3d-ledger");
    assert.equal(env.specHash, entry.specHash);
    assert.equal(env.seed, entry.seed);
    assert.equal(env.fixedDelta, entry.fixedDelta);
    assert.equal(env.frames, entry.frames);
    assert.equal(env.intentId, LINEAGE.intentId);
    assert.equal(env.timelineId, LINEAGE.timelineId);
    assert.equal(env.worldId, LINEAGE.worldId);
    assert.ok(env.trajectoryRoot.length === 64, "trajectoryRoot is a sha256");
    assert.ok(env.replayToken.length === 64, "replayToken is a sha256");
    // replayToken = sha256(specHash:seed:fixedDelta:frames:trajectoryRoot)
    const { createHash } = await import("node:crypto");
    const expected = createHash("sha256").update(`${entry.specHash}:${entry.seed}:${entry.fixedDelta}:${entry.frames}:${env.trajectoryRoot}`, "utf8").digest("hex");
    assert.equal(env.replayToken, expected);
  });

  it("AC-C2: verifyRt3dEvidenceEnvelope passes for an untampered captured entry", () => {
    const { worldDocument, specHash, seed } = convertSceneSpecification(TESSERACT_SPEC);
    const entry = ledger.capture({
      sceneId: "rt3d-scene-" + specHash.slice(0, 16),
      specHash,
      seed,
      worldDocument,
      frames: 16,
      lineage: LINEAGE,
    });
    const env = buildRt3dEvidenceEnvelope(entry);
    const report = verifyRt3dEvidenceEnvelope(env, entry, (e) => ledger.replay(e));
    assert.equal(report.replayOk, true, "replay invariant holds");
    assert.equal(report.trajectoryRecomputed, true, "trajectory root recomputes identically");
    assert.equal(report.mismatch, undefined);
  });

  it("AC-C3: a tampered snapshot body fails verification (replay mismatch + root drift)", () => {
    const { worldDocument, specHash, seed } = convertSceneSpecification(TESSERACT_SPEC);
    const entry = ledger.capture({
      sceneId: "rt3d-scene-" + specHash.slice(0, 16),
      specHash,
      seed,
      worldDocument,
      frames: 6,
      lineage: LINEAGE,
    });
    const env = buildRt3dEvidenceEnvelope(entry);

    // Mutate the in-memory entry (simulating corruption / tampering).
    const tampered = structuredClone(entry);
    tampered.snapshots[2].bodies[0].position.x += 3.0;
    // NOTE: entry.checksum is NOT recomputed here — a tampered on-disk file
    // would be rejected by Rt3dLedger.load first; this test exercises the
    // evidence layer's independent trajectory-root guard.
    const report = verifyRt3dEvidenceEnvelope(env, tampered, (e) => ledger.replay(e));
    assert.equal(report.replayOk, false, "replay fails on tampered positions");
    assert.ok(typeof report.mismatch === "string", "mismatch reason present");
    assert.equal(report.trajectoryRecomputed, false, "trajectory root drifts on tamper");
  });
});
