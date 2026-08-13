import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { 
  PhotorealEvidenceRecorder, 
  canonicalFrameRecord, 
  frameHash, 
  runtimeFingerprint 
} from "../PhotorealEvidenceRecorder.js";

describe("PhotorealEvidenceRecorder — Construction & Configuration", () => {
  describe("constructor", () => {
    it("initializes with default values", () => {
      const recorder = new PhotorealEvidenceRecorder();
      assert.equal(recorder.records.length, 0);
      assert.equal(recorder.active, false);
      assert.equal(recorder.worldId, "world-photoreal-001");
      assert.equal(recorder.timelineId, "timeline-photoreal-v1");
      assert.equal(recorder.intentId, "render-4d-photoreal");
      assert.equal(recorder.frameCount, 0);
    });

    it("initializes with custom values", () => {
      const recorder = new PhotorealEvidenceRecorder({
        worldId: "world-custom-001",
        timelineId: "timeline-custom-v2",
        intentId: "render-custom"
      });
      assert.equal(recorder.worldId, "world-custom-001");
      assert.equal(recorder.timelineId, "timeline-custom-v2");
      assert.equal(recorder.intentId, "render-custom");
    });
  });
});

describe("PhotorealEvidenceRecorder — Lifecycle", () => {
  describe("begin()", () => {
    it("activates recorder and clears records", () => {
      const recorder = new PhotorealEvidenceRecorder();
      recorder.records = [{ frame: 0 }];
      recorder.active = true;
      recorder.frameCount = 5;
      
      recorder.begin();
      
      assert.equal(recorder.active, true);
      assert.equal(recorder.records.length, 0);
      assert.equal(recorder.frameCount, 0);
    });
  });

  describe("record()", () => {
    it("throws when not active", () => {
      const recorder = new PhotorealEvidenceRecorder();
      assert.throws(() => recorder.record({}), /Recorder not active/);
    });

    it("validates required fields", () => {
      const recorder = new PhotorealEvidenceRecorder();
      recorder.begin();
      
      assert.throws(() => recorder.record({ frame: -1 }), /V2: missing frame/);
      assert.throws(() => recorder.record({ frame: 0 }), /V2: missing timeSeconds/);
      assert.throws(() => recorder.record({ frame: 0, timeSeconds: 0 }), /V5: intentId mismatch/);
    });

    it("accepts valid frame record", () => {
      const recorder = new PhotorealEvidenceRecorder({
        worldId: "world-test",
        timelineId: "timeline-test",
        intentId: "intent-test"
      });
      recorder.begin();
      
      const frameRecord = {
        frame: 0,
        timeSeconds: 0,
        intentId: "intent-test",
        timelineId: "timeline-test",
        worldId: "world-test",
        parameters: { exposure: 1.0 },
        radiance: new Float32Array([0.5, 0.5, 0.5]),
        aovs: { albedo: new Float32Array([0.18, 0.18, 0.18]) },
        camera: { eye: [0, 0, 0], target: [0, 0, -1], focal: 100, aperture: 2.8, focusDistance: 10 },
        radianceHash: "abc123",
        aovsHash: "def456"
      };
      
      const result = recorder.record(frameRecord);
      assert.ok(result.frameHash);
      assert.equal(recorder.records.length, 1);
      assert.equal(recorder.frameCount, 1);
    });

    it("rejects frame with wrong intentId", () => {
      const recorder = new PhotorealEvidenceRecorder({ intentId: "correct" });
      recorder.begin();
      
      assert.throws(() => recorder.record({
        frame: 0,
        timeSeconds: 0,
        intentId: "wrong",
        timelineId: "timeline-test",
        worldId: "world-test",
        parameters: {},
        radiance: new Float32Array([0]),
        aovs: {},
        camera: {},
        radianceHash: "x",
        aovsHash: "y"
      }), /V5: intentId mismatch/);
    });

    it("rejects frame with wrong timelineId", () => {
      const recorder = new PhotorealEvidenceRecorder({ timelineId: "correct" });
      recorder.begin();
      
      assert.throws(() => recorder.record({
        frame: 0,
        timeSeconds: 0,
        intentId: "intent-test",
        timelineId: "wrong",
        worldId: "world-test",
        parameters: {},
        radiance: new Float32Array([0]),
        aovs: {},
        camera: {},
        radianceHash: "x",
        aovsHash: "y"
      }), /V2: timelineId mismatch/);
    });

    it("rejects frame with wrong worldId", () => {
      const recorder = new PhotorealEvidenceRecorder({ worldId: "correct" });
      recorder.begin();
      
      assert.throws(() => recorder.record({
        frame: 0,
        timeSeconds: 0,
        intentId: "intent-test",
        timelineId: "timeline-test",
        worldId: "wrong",
        parameters: {},
        radiance: new Float32Array([0]),
        aovs: {},
        camera: {},
        radianceHash: "x",
        aovsHash: "y"
      }), /V2: worldId mismatch/);
    });

    it("validates timeSeconds = frame / 30", () => {
      const recorder = new PhotorealEvidenceRecorder();
      recorder.begin();
      
      assert.throws(() => recorder.record({
        frame: 30,
        timeSeconds: 0.5, // Should be 1.0
        intentId: "intent-test",
        timelineId: "timeline-test",
        worldId: "world-test",
        parameters: {},
        radiance: new Float32Array([0]),
        aovs: {},
        camera: {},
        radianceHash: "x",
        aovsHash: "y"
      }), /V2: timeSeconds mismatch/);
    });

    it("requires parameters", () => {
      const recorder = new PhotorealEvidenceRecorder();
      recorder.begin();
      
      assert.throws(() => recorder.record({
        frame: 0,
        timeSeconds: 0,
        intentId: "intent-test",
        timelineId: "timeline-test",
        worldId: "world-test",
        radiance: new Float32Array([0]),
        aovs: {},
        camera: {},
        radianceHash: "x",
        aovsHash: "y"
      }), /V2: missing parameters/);
    });

    it("requires radiance", () => {
      const recorder = new PhotorealEvidenceRecorder();
      recorder.begin();
      
      assert.throws(() => recorder.record({
        frame: 0,
        timeSeconds: 0,
        intentId: "intent-test",
        timelineId: "timeline-test",
        worldId: "world-test",
        parameters: {},
        aovs: {},
        camera: {},
        radianceHash: "x",
        aovsHash: "y"
      }), /V2: missing radiance/);
    });

    it("requires aovs", () => {
      const recorder = new PhotorealEvidenceRecorder();
      recorder.begin();
      
      assert.throws(() => recorder.record({
        frame: 0,
        timeSeconds: 0,
        intentId: "intent-test",
        timelineId: "timeline-test",
        worldId: "world-test",
        parameters: {},
        radiance: new Float32Array([0]),
        camera: {},
        radianceHash: "x",
        aovsHash: "y"
      }), /V2: missing aovs/);
    });

    it("requires camera", () => {
      const recorder = new PhotorealEvidenceRecorder();
      recorder.begin();
      
      assert.throws(() => recorder.record({
        frame: 0,
        timeSeconds: 0,
        intentId: "intent-test",
        timelineId: "timeline-test",
        worldId: "world-test",
        parameters: {},
        radiance: new Float32Array([0]),
        aovs: {},
        radianceHash: "x",
        aovsHash: "y"
      }), /V2: missing camera/);
    });

    it("requires radianceHash (V4 dual evidence)", () => {
      const recorder = new PhotorealEvidenceRecorder();
      recorder.begin();
      
      assert.throws(() => recorder.record({
        frame: 0,
        timeSeconds: 0,
        intentId: "intent-test",
        timelineId: "timeline-test",
        worldId: "world-test",
        parameters: {},
        radiance: new Float32Array([0]),
        aovs: {},
        camera: {},
        aovsHash: "y"
      }), /V4: missing radianceHash/);
    });

    it("requires aovsHash (V4 dual evidence)", () => {
      const recorder = new PhotorealEvidenceRecorder();
      recorder.begin();
      
      assert.throws(() => recorder.record({
        frame: 0,
        timeSeconds: 0,
        intentId: "intent-test",
        timelineId: "timeline-test",
        worldId: "world-test",
        parameters: {},
        radiance: new Float32Array([0]),
        aovs: {},
        camera: {},
        radianceHash: "x"
      }), /V4: missing aovsHash/);
    });
  });

  describe("finalize()", () => {
    it("deactivates and returns records", () => {
      const recorder = new PhotorealEvidenceRecorder();
      recorder.begin();
      recorder.record({
        frame: 0,
        timeSeconds: 0,
        intentId: "render-4d-photoreal",
        timelineId: "timeline-photoreal-v1",
        worldId: "world-photoreal-001",
        parameters: {},
        radiance: new Float32Array([0]),
        aovs: {},
        camera: {},
        radianceHash: "x",
        aovsHash: "y"
      });
      
      const records = recorder.finalize();
      assert.equal(recorder.active, false);
      assert.equal(records.length, 1);
    });

    it("throws when not active", () => {
      const recorder = new PhotorealEvidenceRecorder();
      assert.throws(() => recorder.finalize(), /Recorder not active/);
    });
  });
});

describe("PhotorealEvidenceRecorder — Frame Hashing", () => {
  describe("frameHash()", () => {
    it("returns hash for valid frame index", () => {
      const recorder = new PhotorealEvidenceRecorder();
      recorder.begin();
      recorder.record({
        frame: 0,
        timeSeconds: 0,
        intentId: "render-4d-photoreal",
        timelineId: "timeline-photoreal-v1",
        worldId: "world-photoreal-001",
        parameters: {},
        radiance: new Float32Array([0.5, 0.5, 0.5]),
        aovs: {},
        camera: {},
        radianceHash: "abc",
        aovsHash: "def"
      });
      
      const hash = recorder.frameHash(0);
      assert.ok(typeof hash === "string");
      assert.equal(hash.length, 32);
    });

    it("throws for out of bounds index", () => {
      const recorder = new PhotorealEvidenceRecorder();
      recorder.begin();
      recorder.record({
        frame: 0,
        timeSeconds: 0,
        intentId: "render-4d-photoreal",
        timelineId: "timeline-photoreal-v1",
        worldId: "world-photoreal-001",
        parameters: {},
        radiance: new Float32Array([0.5, 0.5, 0.5]),
        aovs: {},
        camera: {},
        radianceHash: "abc",
        aovsHash: "def"
      });
      
      assert.throws(() => recorder.frameHash(-1), /out of bounds/);
      assert.throws(() => recorder.frameHash(1), /out of bounds/);
    });
  });

  describe("runtimeFingerprint()", () => {
    it("returns fingerprint from records", () => {
      const recorder = new PhotorealEvidenceRecorder();
      recorder.begin();
      recorder.record({
        frame: 0,
        timeSeconds: 0,
        intentId: "render-4d-photoreal",
        timelineId: "timeline-photoreal-v1",
        worldId: "world-photoreal-001",
        parameters: {},
        radiance: new Float32Array([0.5, 0.5, 0.5]),
        aovs: {},
        camera: {},
        radianceHash: "abc",
        aovsHash: "def",
        renderer: { fingerprint: "custom-fp" }
      });
      
      const fp = recorder.runtimeFingerprint();
      assert.equal(fp, "custom-fp");
    });

    it("returns default fingerprint when no records", () => {
      const recorder = new PhotorealEvidenceRecorder();
      const fp = recorder.runtimeFingerprint();
      assert.ok(typeof fp === "string");
      assert.equal(fp.length, 32);
    });
  });
});

describe("canonicalFrameRecord", () => {
  it("creates canonical record excluding non-deterministic fields", () => {
    const frameRecord = {
      frame: 0,
      timeSeconds: 0,
      t: 0,
      replayToken: "token123",
      radianceHash: "radhash",
      aovsHash: "aovhash",
      camera: { eye: [0, 0, 0], target: [0, 0, -1], focal: 100, aperture: 2.8, focusDistance: 10 },
      integrator: { spp: 64, maxDepth: 16, strategy: "path" },
      denoiser: { enabled: true, method: "temporal", historyLength: 8 },
      renderer: { contract: "photoreal.v1", backend: "cpu", seed: "0x5EED4D00" },
      parameters: { exposure: 1.0 },
      intentId: "render-test",
      timelineId: "timeline-test",
      worldId: "world-test",
      timestamp: Date.now() // Non-deterministic
    };
    
    const canonical = canonicalFrameRecord(frameRecord, "token123");
    
    assert.equal(canonical.frame, 0);
    assert.equal(canonical.timeSeconds, 0);
    assert.equal(canonical.replayToken, "token123");
    assert.equal(canonical.radianceHash, "radhash");
    assert.equal(canonical.aovsHash, "aovhash");
    assert.ok(canonical.camera);
    assert.ok(canonical.integrator);
    assert.ok(canonical.denoiser);
    assert.ok(canonical.renderer);
    assert.ok(canonical.parameters);
    assert.equal(canonical.intentId, "render-test");
    assert.equal(canonical.timelineId, "timeline-test");
    assert.equal(canonical.worldId, "world-test");
    assert.ok(!canonical.timestamp); // Excluded
  });
});

describe("frameHash", () => {
  it("computes deterministic hash", () => {
    const record = { frame: 0, value: 42 };
    const hash1 = frameHash(record);
    const hash2 = frameHash(record);
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 32);
  });

  it("differs for different records", () => {
    const hash1 = frameHash({ frame: 0 });
    const hash2 = frameHash({ frame: 1 });
    assert.notEqual(hash1, hash2);
  });
});

describe("runtimeFingerprint", () => {
  it("computes deterministic fingerprint", () => {
    const config = { seed: "0x5EED4D00", frames: 300 };
    const fp1 = runtimeFingerprint(config);
    const fp2 = runtimeFingerprint(config);
    assert.equal(fp1, fp2);
    assert.equal(fp1.length, 32);
  });

  it("differs for different configs", () => {
    const fp1 = runtimeFingerprint({ seed: "0x5EED4D00" });
    const fp2 = runtimeFingerprint({ seed: "0x12345678" });
    assert.notEqual(fp1, fp2);
  });
});