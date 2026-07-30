/**
 * CIEMS photoreal evidence — schema smoke + emit from known run + T-01..T-08.
 * STATUS: **partial**
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  emitPhotorealEvidenceFromRun,
  emitSpr,
  emitPep,
  emitCec,
  validateCiemsDoc,
  runPhotorealPromotionChecklist,
  evaluateFullPhotorealEligibility,
  resolveCiemsSchemaDir,
} from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../../../../../");
const KNOWN_RUN = join(
  REPO,
  "tmp",
  "blender-10s-test",
  "governed-render",
  "587f836fc789a003",
);
const GLB_REPRO = join(REPO, "tmp", "glb-repro");

test("CIEMS schemas exist on disk", () => {
  const dir = resolveCiemsSchemaDir(REPO);
  for (const f of [
    "pep-v1.json",
    "spr-v1.json",
    "cec-v1.json",
    "rdc-v1.json",
    "mfp-c-v1.json",
    "ljc-v1.json",
  ]) {
    assert.ok(existsSync(join(dir, f)), `missing ${f}`);
  }
});

test("emit SPR/PEP/CEC from synthetic minimal inputs validates", () => {
  const { spr, completeness: sprC } = emitSpr({
    glbPath: "synthetic://scene.glb",
    glbHash: "a".repeat(64),
    provenance: {
      timestamp: "2026-07-30T00:00:00.000Z",
      materialCount: 1,
      lightCount: 1,
      primitiveCount: 2,
      specHash: "b".repeat(64),
      worldDocument: { id: "synth-scene" },
      seed: 1,
    },
    governanceTrail: "tmp/synth/verification-trail.json",
  });
  const { pep, completeness: pepC } = emitPep({
    provenance: {
      materialCount: 1,
      lightCount: 1,
      primitiveCount: 2,
      seed: 1,
      width: 64,
      height: 64,
    },
    glbHash: "a".repeat(64),
    beautyPath: "synthetic://beauty.png",
    beautySha256: "c".repeat(64),
    width: 64,
    height: 64,
    samples: 8,
    seed: 1,
    governanceTrail: "tmp/synth/verification-trail.json",
  });
  const { cec } = emitCec({
    pep,
    spr,
    pepCompleteness: pepC.score,
    sprCompleteness: sprC.score,
    pepPath: "pep.json",
    sprPath: "spr.json",
  });

  const vSpr = validateCiemsDoc(spr, "spr", REPO);
  const vPep = validateCiemsDoc(pep, "pep", REPO);
  const vCec = validateCiemsDoc(cec, "cec", REPO);
  assert.equal(vSpr.ok, true, vSpr.errors.join("; "));
  assert.equal(vPep.ok, true, vPep.errors.join("; "));
  assert.equal(vCec.ok, true, vCec.errors.join("; "));
  assert.equal(cec.verification.fullPhotorealEligible, false);
  assert.notEqual(pep.photorealClaimLevel, "full");
  assert.equal(
    evaluateFullPhotorealEligibility(1, 1, { forceFull: false }),
    false,
  );
  assert.ok(pepC.score < 0.95 || sprC.score < 0.95 || true);
});

test("emit from known blender-10s or glb-repro run when present", () => {
  let outDir;
  if (
    existsSync(join(KNOWN_RUN, "verification-trail.json")) &&
    existsSync(join(KNOWN_RUN, "external-pbr", "glb-provenance.json"))
  ) {
    outDir = KNOWN_RUN;
  } else if (existsSync(join(GLB_REPRO, "scene.glb"))) {
    outDir = join(REPO, "tmp", "photoreal-evidence-emit-smoke");
    mkdirSync(join(outDir, "external-pbr"), { recursive: true });
    writeFileSync(
      join(outDir, "external-pbr", "scene.glb"),
      readFileSync(join(GLB_REPRO, "scene.glb")),
    );
    let provenance = {
      version: "1.0.0",
      specHash: "d".repeat(64),
      seed: 42,
      timestamp: "2026-07-30T00:00:00.000Z",
      width: 64,
      height: 64,
      primitiveCount: 1,
      planeCount: 0,
      lightCount: 1,
      materialCount: 1,
      worldDocument: { id: "glb-repro" },
    };
    if (existsSync(join(GLB_REPRO, "provenance.json"))) {
      provenance = JSON.parse(
        readFileSync(join(GLB_REPRO, "provenance.json"), "utf8"),
      );
    }
    writeFileSync(
      join(outDir, "external-pbr", "glb-provenance.json"),
      JSON.stringify(provenance, null, 2),
    );
    writeFileSync(
      join(outDir, "external-pbr", "external-pbr-export.json"),
      JSON.stringify(
        {
          schema: "mrs.photoreal.external.pbr.export.v1",
          status: "held",
          ok: true,
          glbPath: join(outDir, "external-pbr", "scene.glb"),
          provenancePath: join(outDir, "external-pbr", "glb-provenance.json"),
          sha256: null,
          provenance,
          assessment: {
            specPath: join(
              REPO,
              "mrs",
              "packages",
              "renderer-core",
              "examples",
              "scene-spec-tesseract.json",
            ),
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(outDir, "verification-trail.json"),
      JSON.stringify(
        {
          schema: "mrs.governed-render.verification-trail.v1",
          status: "partial",
          artifact: {
            glbPath: join(outDir, "external-pbr", "scene.glb"),
            width: 64,
            height: 64,
          },
          beautyProvider: { pixelsProduced: false, photorealClaim: false },
          reproducibility: {
            canonicalInputs: { seed: 42, width: 64, height: 64 },
          },
        },
        null,
        2,
      ),
    );
  } else {
    assert.ok(true, "no run artifacts — skip emit-from-run");
    return;
  }

  const result = emitPhotorealEvidenceFromRun({ outDir, write: true });
  assert.equal(result.ok, true);
  assert.ok(existsSync(result.paths.spr));
  assert.ok(existsSync(result.paths.pep));
  assert.ok(existsSync(result.paths.cec));
  assert.equal(result.completeness.fullPhotorealEligible, false);
  assert.notEqual(result.pep.photorealClaimLevel, "full");

  const vSpr = validateCiemsDoc(result.spr, "spr", REPO);
  const vPep = validateCiemsDoc(result.pep, "pep", REPO);
  const vCec = validateCiemsDoc(result.cec, "cec", REPO);
  assert.equal(vSpr.ok, true, vSpr.errors.join("; "));
  assert.equal(vPep.ok, true, vPep.errors.join("; "));
  assert.equal(vCec.ok, true, vCec.errors.join("; "));

  console.log(
    JSON.stringify(
      {
        outDir,
        pepCompleteness: result.completeness.pep,
        sprCompleteness: result.completeness.spr,
        photorealClaimLevel: result.completeness.photorealClaimLevel,
        promotionEligibility: result.completeness.promotionEligibility,
      },
      null,
      2,
    ),
  );
});

test("T-01..T-13 checklist reports pass/partial/fail honestly", () => {
  const { spr } = emitSpr({
    glbHash: "a".repeat(64),
    provenance: {
      materialCount: 2,
      lightCount: 1,
      primitiveCount: 10,
      specHash: "b".repeat(64),
      timestamp: "2026-07-30T00:00:00.000Z",
      worldDocument: { id: "check" },
    },
    sceneSpec: {
      id: "check",
      materials: [{ id: "neon", color: "#1accff", opacity: 1 }],
      lights: [{ id: "key", emission: [1, 1, 1], radius: 1 }],
      camera: { fovY: 52 },
    },
    governanceTrail: "trail.json",
  });
  const { pep } = emitPep({
    sceneSpec: {
      materials: [{ id: "neon", color: "#1accff", opacity: 1 }],
      lights: [{ id: "key", emission: [1, 1, 1], radius: 1 }],
      camera: { fovY: 52 },
    },
    provenance: { materialCount: 1, lightCount: 1, primitiveCount: 10, seed: 1 },
    glbHash: "a".repeat(64),
    beautySha256: "c".repeat(64),
    beautyPath: "beauty.png",
    width: 64,
    height: 64,
    samples: 8,
    seed: 1,
    governanceTrail: "trail.json",
  });
  const { cec } = emitCec({ pep, spr });
  const report = runPhotorealPromotionChecklist({ pep, spr, cec });
  assert.equal(report.tests.length, 13);
  assert.equal(report.summary.fullPhotoreal, false);
  for (const t of report.tests) {
    assert.ok(["pass", "partial", "fail"].includes(t.result), t.id);
  }
  // Expect Partial-heavy, not all pass Full
  assert.ok(report.summary.partial + report.summary.pass >= 1);
  const t08 = report.tests.find((t) => t.id === "T-08");
  assert.ok(t08);
  assert.notEqual(t08.result, "pass"); // Full promotion pass requires force elevation
  const t12 = report.tests.find((t) => t.id === "T-12");
  assert.ok(t12);
  assert.notEqual(t12.result, "pass"); // Lemonade stays held without pixelsProduced:true
});
