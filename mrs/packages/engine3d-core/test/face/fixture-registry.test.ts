/**
 * Fixture face registry — governed evidence + AABB integrity.
 * Status: **partial**. Constitutional signature = contentHash + provenance fields.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditDefaultFaceFixtures,
  computeMeshAabb,
  validateAabb,
  registerFixtureFace,
  CONSTITUTIONAL_SIGNATURE_MEANING,
} from "../../src/face/FixtureFaceRegistry.js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot(): string {
  let dir = resolve(here);
  for (let i = 0; i < 12; i++) {
    if (
      existsSync(join(dir, "constitution", "CHARTER.md")) ||
      existsSync(join(dir, "mrs", "assets", "human"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(here, "..", "..", "..", "..", "..");
}

describe("FixtureFaceRegistry AABB", () => {
  it("computes valid AABB from triangle verts", () => {
    const verts = new Float32Array([-1, 0, 0, 1, 2, 3, 0, 1, -2]);
    const aabb = computeMeshAabb(verts);
    assert.equal(aabb.vertexCount, 3);
    assert.ok(aabb.valid);
    assert.deepEqual([...aabb.min], [-1, 0, -2]);
    assert.deepEqual([...aabb.max], [1, 2, 3]);
    assert.ok(validateAabb(aabb).ok);
  });

  it("rejects empty / inverted AABBs", () => {
    const empty = computeMeshAabb(new Float32Array());
    assert.equal(validateAabb(empty).ok, false);
    const inverted = {
      min: [1, 1, 1] as const,
      max: [0, 0, 0] as const,
      valid: true,
      vertexCount: 2,
    };
    assert.equal(validateAabb(inverted).ok, false);
  });
});

describe("FixtureFaceRegistry HumanFaceRigged", () => {
  it("registers fixture with contentHash and lawful AABB", () => {
    const entry = registerFixtureFace("HumanFaceRigged", { strict: true });
    assert.ok(entry.manifest.contentHash.startsWith("sha256:"));
    assert.ok(entry.manifest.provenance?.integrityHash);
    assert.equal(entry.provenance.assetId, entry.manifest.id);
    assert.ok(entry.aabb.vertexCount > 0, "expected mesh verts");
    assert.ok(entry.aabb.valid, `aabb invalid: ${entry.issues.join(",")}`);
    assert.equal(entry.lawfulForRaster, true, entry.issues.join(";"));
    assert.ok(CONSTITUTIONAL_SIGNATURE_MEANING.includes("not PKI"));
  });

  it("audits default faces and writes proof JSON", () => {
    const report = auditDefaultFaceFixtures();
    assert.ok(report.entries.length >= 1);
    assert.ok(report.constitutionalSignatureMeaning.includes("contentHash"));
    const outDir = join(resolveRepoRoot(), "docs", "4d-engine", "proofs", "sx-arch-gaps-2026-07");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, "fixture-face-registry-audit.json"),
      JSON.stringify(
        {
          ok: report.ok,
          issues: report.issues,
          constitutionalSignatureMeaning: report.constitutionalSignatureMeaning,
          entries: report.entries.map((e) => ({
            logicalName: e.logicalName,
            faceAsset: e.faceAsset,
            lawfulForRaster: e.lawfulForRaster,
            contentHash: e.manifest.contentHash,
            aabb: e.aabb,
            issues: e.issues,
            path: e.path,
          })),
        },
        null,
        2,
      ),
    );
    // HumanFaceRigged must be lawful; Neutral may also be.
    const rigged = report.entries.find((e) => e.logicalName === "HumanFaceRigged");
    assert.ok(rigged);
    assert.equal(rigged!.lawfulForRaster, true, rigged!.issues.join(";"));
  });
});
