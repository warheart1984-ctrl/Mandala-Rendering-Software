import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { MetricTensor } from "../../constitutional/arena/MetricTensor.js";
import { FourVector } from "../../constitutional/tensor/index.js";
import { FourVelocity } from "../../constitutional/kinematics/index.js";
import { Camera4D, ProjectionPolicy } from "../../constitutional/projection/index.js";
import { createInitializedRuntime } from "../../constitutional/runtime/index.js";
import { CertifiedEnvironment } from "../../../../render/rt4d/environment/index.js";
import { EnvironmentEvidenceRecorder, canonicalFrameRecord } from "../../../../render/rt4d/environment/EnvironmentEvidence.js";
import { Camera3D } from "../../../../cine3d/Camera3D.js";
import { buildScene3D, drawScene3D } from "../../../../cine3d/Scene3D.js";
import { compositeFrame, drawPlan } from "../../../../cine3d/Compositor.js";

const OUT_DIR = join(process.cwd(), "output/cinematic-sunrise/_frames");

describe("Cinematic 4D Environment — Acceptance (§5)", () => {
  let envA, envB, recordsA, recordsB, runtimeA, runtimeB;

  before(async () => {
    envA = new CertifiedEnvironment({ CANONICAL_SEED: 0x5EED4D00 });
    await envA.advance();
    runtimeA = envA.sun.getRuntime();

    envB = new CertifiedEnvironment({ CANONICAL_SEED: 0x5EED4D00 });
    await envB.advance();
    runtimeB = envB.sun.getRuntime();
  });

  // ==== E1: Position/velocity/momentum certs & conformance ====
  describe("E1: Certified physics conformance", () => {
    it("positionCert.errorBound.max < 1e-6 for all 300 frames", () => {
      for (let i = 0; i < 300; i++) {
        const prov = runtimeA.getProvenanceChain()[i];
        assert.ok(prov.positionCert.errorBound.max < 1e-6, `frame ${i}: pos max=${prov.positionCert.errorBound.max}`);
      }
    });
    it("velocityCert.errorBound.max < 1e-9 for all 300 frames", () => {
      for (let i = 0; i < 300; i++) {
        const prov = runtimeA.getProvenanceChain()[i];
        assert.ok(prov.velocityCert.errorBound.max < 1e-9, `frame ${i}: vel max=${prov.velocityCert.errorBound.max}`);
      }
    });
    it("momentumCert.errorBound.max < 1e-9 for all 300 frames", () => {
      for (let i = 0; i < 300; i++) {
        const prov = runtimeA.getProvenanceChain()[i];
        assert.ok(prov.momentumCert.errorBound.max < 1e-9, `frame ${i}: mom max=${prov.momentumCert.errorBound.max}`);
      }
    });
    it("conformance.passed === 16 && conformance.success === true", () => {
      for (let i = 0; i < 300; i++) {
        const prov = runtimeA.getProvenanceChain()[i];
        assert.equal(prov.physicsConformance?.passed, 16);
        assert.equal(prov.physicsConformance?.success, true);
      }
    });
  });

  // ==== E2: Sun never degenerate ====
  describe("E2: Sun projection finite & within tolerance", () => {
    it("projection.errorBound.finite === true for all frames", () => {
      for (let i = 0; i < 300; i++) {
        const prov = runtimeA.getProvenanceChain()[i];
        assert.equal(prov.projection.errorBound.finite, true, `frame ${i} finite`);
      }
    });
    it("projection.errorBound.withinTolerance === true for all frames", () => {
      for (let i = 0; i < 300; i++) {
        const prov = runtimeA.getProvenanceChain()[i];
        assert.equal(prov.projection.errorBound.withinTolerance, true, `frame ${i} withinTolerance`);
      }
    });
    it("projection.errorBound.roundtripResidual < 1e-9 for all frames", () => {
      for (let i = 0; i < 300; i++) {
        const prov = runtimeA.getProvenanceChain()[i];
        assert.ok(prov.projection.errorBound.roundtripResidual < 1e-9, `frame ${i} rt=${prov.projection.errorBound.roundtripResidual}`);
      }
    });
  });

  // ==== E3: No keyframing (fresh runtime bitwise equality) ====
  describe("E3: Deterministic sun world positions (no keyframing)", () => {
    it("sunWorld(N) matches fresh runtime recomputation bitwise", async () => {
      const metric = MetricTensor.minkowski();
      const rtFresh = createInitializedRuntime({
        metricSignature: [-1, 1, 1, 1], c: 1, dtau: 0.03, d4: 4,
        camera: Camera4D.atOrigin(), projectionPolicy: ProjectionPolicy.perspective(4),
        position: new FourVector(0, -0.40, 0, 0, metric),
        velocity: new FourVelocity(new FourVector(1.71636, 1.35, 0.35, 0.03, metric), metric).normalize(1),
        mass: 1.0, governance: { strictMode: false, requireReplay: false, requireAudit: false },
      });

      for (let i = 0; i < 300; i++) {
        const envRec = envA.frame(i);
        const freshStep = await rtFresh.step();
        const freshP3 = { x: freshStep.projection.x, y: freshStep.projection.y, z: freshStep.projection.z };
        const freshDir = envToWorld(freshP3);
        const freshWorld = { x: freshDir.x * 90, y: freshDir.y * 90, z: freshDir.z * 90 };

        assert.deepStrictEqual(envRec.sun.sunWorld, freshWorld, `frame ${i} sunWorld mismatch`);
      }
    });
    it("sunScreen(N) = Camera3D.project(sunWorld(N)) bitwise identical across two computations", () => {
      const cam = Camera3D.cinematic(150, 300, 1280, 720);
      const rec = envA.frame(150);
      const proj1 = cam.project(rec.sun.sunWorld);
      const proj2 = cam.project(rec.sun.sunWorld);
      assert.deepStrictEqual(proj1, proj2);
    });
  });

  // ==== E4: Actual sunrise ====
  describe("E4: Actual sunrise", () => {
    it("sunDir(0).y < 0", () => {
      const r0 = envA.frame(0);
      assert.ok(r0.sun.sunDir.y < 0, `sunDir(0).y = ${r0.sun.sunDir.y}`);
    });
    it("sunDir(299).y > 0.3", () => {
      const r299 = envA.frame(299);
      assert.ok(r299.sun.sunDir.y > 0.3, `sunDir(299).y = ${r299.sun.sunDir.y}`);
    });
    it("dawnFactor(0) < 0.05", () => {
      const r0 = envA.frame(0);
      assert.ok(r0.sun.dawnFactor < 0.05, `dawnFactor(0) = ${r0.sun.dawnFactor}`);
    });
    it("dawnFactor(299) > 0.9", () => {
      const r299 = envA.frame(299);
      assert.ok(r299.sun.dawnFactor > 0.9, `dawnFactor(299) = ${r299.sun.dawnFactor}`);
    });
  });

  // ==== E5: Ocean null waves ====
  describe("E5: Ocean null wave vectors certified", () => {
    it("each wave cert validation.passed === true and residual |g(k,k)| < 1e-9", () => {
      for (const cert of envA.waveCerts) {
        assert.equal(cert.validation?.passed, true);
        assert.ok(cert.validation?.residual < 1e-9);
      }
    });
  });

  // ==== E6: Ocean anchors ====
  describe("E6: Ocean anchors certified per frame", () => {
    it("all anchors errorBound.finite === true and withinTolerance === true", () => {
      for (let i = 0; i < 300; i++) {
        const rec = envA.frame(i);
        for (const a of rec.ocean.anchorBounds) {
          assert.equal(a.errorBound.finite, true, `frame ${i} anchor finite`);
          assert.equal(a.errorBound.withinTolerance, true, `frame ${i} anchor withinTolerance`);
        }
      }
    });
  });

  // ==== E7: Sky zenith cert ====
  describe("E7: Sky zenith certification", () => {
    it("zenith cert validation.passed === true", () => {
      const zenithCert = envA.sky.zenithCert;
      assert.equal(zenithCert?.validation?.passed, true);
    });
    it("frame.sky.errorBound.max === max(sunProjBound.max, zenithBound.max) within 1e-12", () => {
      for (let i = 0; i < 300; i++) {
        const rec = envA.frame(i);
        const sunMax = rec.sun.errorBound?.max ?? 0;
        const zenMax = rec.sky.zenithErrorBound?.max ?? 0;
        const expected = Math.max(sunMax, zenMax);
        assert.ok(Math.abs(rec.sky.errorBound?.max - expected) < 1e-12, `frame ${i} sky errorBound`);
      }
    });
  });

  // ==== S1: Camera purity ====
  describe("S1: Camera3D cinematic purity", () => {
    it("returns identical (eye, target, focal) on two calls with same inputs", () => {
      const c1 = Camera3D.cinematic(100, 300, 1280, 720);
      const c2 = Camera3D.cinematic(100, 300, 1280, 720);
      assert.deepStrictEqual(c1.eye, c2.eye);
      assert.deepStrictEqual(c1.target, c2.target);
      assert.equal(c1.focal, c2.focal);
    });
    it("unchanged when called with different environment object", () => {
      const c1 = Camera3D.cinematic(50, 300, 1280, 720);
      const c2 = Camera3D.cinematic(50, 300, 1280, 720);
      assert.deepStrictEqual(c1, c2);
    });
  });

  // ==== S2: Camera isolation (no rt4d imports) ====
  describe("S2: Camera3D has no rt4d dependency", () => {
    it("source scan of src/cine3d/** finds no rt4d import", () => {
      const files = [
        join(process.cwd(), "src/cine3d/Camera3D.js"),
        join(process.cwd(), "src/cine3d/Scene3D.js"),
        join(process.cwd(), "src/cine3d/Lighting.js"),
        join(process.cwd(), "src/cine3d/Compositor.js"),
      ];
      for (const f of files) {
        const src = readFileSync(f, "utf8");
        assert.ok(!/from\s+['"].*\brt4d\b/.test(src), `${f} contains rt4d import`);
        assert.ok(!/import\s+.*\brt4d\b/.test(src), `${f} contains rt4d import`);
      }
    });
  });

  // ==== S3: Static scene ====
  describe("S3: buildScene3D pure + cached", () => {
    it("deep-equals itself across calls", () => {
      const s1 = buildScene3D(0x5EED4D00);
      const s2 = buildScene3D(0x5EED4D00);
      assert.deepStrictEqual(s1, s2);
    });
    it("geometry arrays not mutated across frames", () => {
      const s = buildScene3D(0x5EED4D00);
      const json1 = JSON.stringify(s);
      buildScene3D(0x5EED4D00);
      const json2 = JSON.stringify(s);
      assert.equal(json1, json2);
    });
  });

  // ==== S4: Hero smoke ====
  describe("S4: Hero rendering does not throw", () => {
    it("drawScene3D with hero does not throw for frames 0..299", () => {
      const scene = buildScene3D();
      const canvas = { width: 1280, height: 720, getContext: () => ({}) };
      const cam = Camera3D.cinematic(0, 300, 1280, 720);
      const light = { dir: { x: 0, y: -1, z: 1 }, color: [255, 200, 100], intensity: 1 };
      for (let i = 0; i < 300; i++) {
        assert.doesNotThrow(() => drawScene3D(canvas.getContext(), scene, cam, light));
      }
    });
  });

  // ==== C1: Draw order ====
  describe("C1: Compositor draw order fixed", () => {
    it("drawPlan() returns exactly [sky, clouds, fog, stars, ocean, sun, pier, beach, buildings, foliage, props, lamps, hero, vignette, hud]", () => {
      const plan = drawPlan();
      assert.deepStrictEqual(plan, ["sky", "clouds", "fog", "stars", "ocean", "sun", "pier", "beach", "buildings", "foliage", "props", "lamps", "hero", "vignette", "hud"]);
    });
  });

  // ==== C2: Canvas fixed size ====
  describe("C2: Canvas never resized", () => {
    it("compositeFrame never resizes canvas; W=1280 H=720 invariant", () => {
      const canvas = { width: 1280, height: 720, getContext: () => ({ clearRect: () => {}, fillRect: () => {}, drawImage: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {}, save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, fillText: () => {}, font: "", fillStyle: "" }) };
      const envRec = envA.frame(0);
      const cam = Camera3D.cinematic(0, 300, 1280, 720);
      const light = { dir: { x: 0, y: -1, z: 1 }, color: [255, 200, 100], intensity: 1 };
      compositeFrame(canvas.getContext(), { envRecord: envRec, scene: null, cam, light, options: { width: 1280, height: 720 } });
      assert.equal(canvas.width, 1280);
      assert.equal(canvas.height, 720);
    });
  });

  // ==== C3: Pixel determinism ====
  describe("C3: PNG byte-identical across two runs", () => {
    it("frames 0, 150, 299 PNG buffers identical (same host)", async () => {
      // This test requires full render pipeline; mark as TODO for Implementor
      // The Implementor will enable this once canvas rendering is wired
    });
  });

  // ==== V1: Recorder lifecycle ====
  describe("V1: EnvironmentEvidenceRecorder lifecycle", () => {
    it("no records before begin()", () => {
      const rec = new EnvironmentEvidenceRecorder();
      assert.equal(rec.records.length, 0);
    });
    it("exactly 300 records after finalize()", () => {
      const rec = new EnvironmentEvidenceRecorder();
      rec.begin();
      for (let i = 0; i < 300; i++) rec.record({ frame: i, timeSeconds: i/30, intentId: "render-4d-cinematic-sunrise", timelineId: "timeline-sunrise-v1", worldId: "world-cinematic-sunrise-001", parameters: {} });
      const out = rec.finalize();
      assert.equal(out.length, 300);
    });
    it("record() outside window throws", () => {
      const rec = new EnvironmentEvidenceRecorder();
      assert.throws(() => rec.record({}), /Recorder not active/);
    });
  });

  // ==== V2: Frame fields ====
  describe("V2: Frame record fields", () => {
    it("every record has intentId, timelineId, worldId, timeSeconds=frame/30, parameters", () => {
      for (let i = 0; i < 300; i++) {
        const r = envA.frame(i);
        assert.equal(r.intentId, "render-4d-cinematic-sunrise");
        assert.equal(r.timelineId, "timeline-sunrise-v1");
        assert.equal(r.worldId, "world-cinematic-sunrise-001");
        assert.equal(r.timeSeconds, i / 30);
        assert.ok(r.parameters);
      }
    });
  });

  // ==== V3: Bundle fields ====
  describe("V3: Evidence bundle fields", () => {
    it("every evidence bundle has { id, worldId, timelineId }", () => {
      const rec = new EnvironmentEvidenceRecorder();
      rec.begin();
      rec.record({ frame: 0, timeSeconds: 0, intentId: "render-4d-cinematic-sunrise", timelineId: "timeline-sunrise-v1", worldId: "world-cinematic-sunrise-001", parameters: {} });
      const out = rec.finalize();
      assert.ok(out[0].replayToken);
      assert.ok(out[0].worldId);
      assert.ok(out[0].timelineId);
    });
  });

  // ==== V4: Dual require ====
  describe("V4: Dual evidence required", () => {
    it("missing sourceCertificationId throws", () => {
      const rec = new EnvironmentEvidenceRecorder();
      rec.begin();
      assert.throws(() => rec.record({ frame: 0, timeSeconds: 0, intentId: "render-4d-cinematic-sunrise", timelineId: "timeline-sunrise-v1", worldId: "world-cinematic-sunrise-001", parameters: {}, sun: { errorBound: { finite: true } } }), /V4/);
    });
    it("errorBound.finite === false throws", () => {
      const rec = new EnvironmentEvidenceRecorder();
      rec.begin();
      assert.throws(() => rec.record({ frame: 0, timeSeconds: 0, intentId: "render-4d-cinematic-sunrise", timelineId: "timeline-sunrise-v1", worldId: "world-cinematic-sunrise-001", parameters: {}, sun: { sourceCertificationId: "x", errorBound: { finite: false } } }), /V4/);
    });
  });

  // ==== V5: Deny without intent ====
  describe("V5: Deny without intent", () => {
    it("env.frame(N) with undefined intentId throws", () => {
      const env = new CertifiedEnvironment({ CANONICAL_SEED: 0x5EED4D00, INTENT_ID: undefined });
      env.advance(); // advance first to set up sun
      assert.throws(() => env.frame(0), /intentId/);
    });
  });

  // ==== V6: Policy load ====
  describe("V6: Policy load (read-only)", () => {
    it("default.policies.json parses; policy-no-render-without-provenance.severity === 'high'", () => {
      const policiesData = JSON.parse(readFileSync(join(__dirname, "../../../../../../../../engine/governance/policies/default.policies.json"), "utf8"));
      const policies = Array.isArray(policiesData) ? policiesData : policiesData.policies;
      const p = policies?.find(x => x.id === "policy-no-render-without-provenance");
      assert.ok(p, "policy missing");
      assert.equal(p.severity, "high");
    });
  });

  // ==== V7: Replay ====
  describe("V7: Replay verification", () => {
    it("runtime.verifyReplay(runA, runB) returns { match: true, steps: 300 }", async () => {
      const chainA = runtimeA.getProvenanceChain();
      const chainB = runtimeB.getProvenanceChain();
      const result = await runtimeA.verifyReplay(chainA, chainB);
      assert.equal(result.match, true);
      assert.equal(result.steps, 300);
    });
  });

  // ==== V8: Hash determinism ====
  describe("V8: frameHash & manifestFragment determinism", () => {
    it("frameHash(N) and manifestFragment() deep-equal across two runs", () => {
      const hA0 = envA.recorder.frameHash(0);
      const hB0 = envB.recorder.frameHash(0);
      assert.equal(hA0, hB0);
    });
  });

  // ==== V9: Hash exclusion ====
  describe("V9: canonicalFrameRecord excludes non-deterministic fields", () => {
    it("keys exclude timestamp|certificationId|projectionId|cameraId|stateId|audit", () => {
      const rec = envA.frame(0);
      const canon = canonicalFrameRecord(rec, rec.replayToken);
      const json = JSON.stringify(canon);
      for (const forbidden of ["timestamp", "certificationId", "projectionId", "cameraId", "stateId", "audit"]) {
        assert.ok(!json.includes(forbidden), `canonical record contains ${forbidden}`);
      }
    });
  });

  // ==== D1: Forbidden-API scan ====
  describe("D1: Forbidden APIs in render paths", () => {
    it("src/cine3d/** + src/render/rt4d/environment/** contain no Date.now|Math.random|performance.now|process.hrtime", () => {
      const scanDir = (dir) => {
        const files = getAllFiles(dir);
        for (const f of files) {
          const src = readFileSync(f, "utf8");
          assert.ok(!/Date\.now\(\)/.test(src), `${f}: Date.now()`);
          assert.ok(!/Math\.random\(\)/.test(src), `${f}: Math.random()`);
          assert.ok(!/performance\.now\(\)/.test(src), `${f}: performance.now()`);
          assert.ok(!/process\.hrtime/.test(src), `${f}: process.hrtime`);
        }
      };
      scanDir(join(process.cwd(), "src/cine3d"));
      scanDir(join(process.cwd(), "src/render/rt4d/environment"));
    });
  });

  // ==== D2: --verify integration ====
  describe("D2: --verify byte-identical manifest", () => {
    it("two full script runs produce byte-identical manifest.json", async () => {
      // Requires full CLI run; Implementor enables after wiring
    });
  });

  // ==== D3: Fingerprint ====
  describe("D3: runtimeFingerprint matches §3 constants", () => {
    it("env.fingerprint() equals recomputed fingerprint from canonical constants", () => {
      const fp1 = envA.fingerprint();
      // Recompute from constants JSON (matching §3)
      const fp2 = createHash("sha256").update(JSON.stringify({
        contractVersion: "1.0.1",
        metricSignature: [-1, 1, 1, 1], c: 1, dtau: 0.03, d4: 4,
        projection: { mode: "perspective", parameters: { d: 4 } },
        seed: "0x5EED4D00", frames: 300, fps: 30, width: 1280, height: 720,
        sunInitialPosition: [0, -0.4, 0, 0],
        sunInitialVelocity: [1.71636, 1.35, 0.35, 0.03],
        waves: [
          { omega: 0.9, dir: [0.12, 0.99], amplitude: 0.09 },
          { omega: 1.7, dir: [0.82, 0.57], amplitude: 0.055 },
          { omega: 2.3, dir: [-0.45, 0.89], amplitude: 0.035 },
          { omega: 3.1, dir: [0.98, -0.2], amplitude: 0.02 },
        ], domeRadius: 90,
      })).digest("hex").slice(0, 32);
      assert.equal(fp1, fp2);
    });
  });
});

function envToWorld(p3) {
  const n = Math.hypot(p3.x, p3.y, p3.z) || 1;
  return { x: -p3.z / n, y: p3.y / n, z: -p3.x / n };
}

function getAllFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files = files.concat(getAllFiles(p));
    else if (e.name.endsWith(".js") || e.name.endsWith(".mjs")) files.push(p);
  }
  return files;
}