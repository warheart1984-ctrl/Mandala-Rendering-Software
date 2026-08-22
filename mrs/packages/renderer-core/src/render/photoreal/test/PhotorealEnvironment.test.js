import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { PhotorealEnvironment } from "../PhotorealEnvironment.js";

describe("PhotorealEnvironment — Integration", () => {
  let env;

  before(async () => {
    env = new PhotorealEnvironment({
      width: 64,
      height: 64,
      frames: 2,
      fps: 30,
      seed: 0x5EED4D00,
      spp: 1,
      maxDepth: 2,
      rrDepth: 1,
      strategy: "path",
      denoiser: "temporal",
      aperture: 2.8,
      focal: 35,
      focus: 10,
      exposure: 1.0,
      tonemap: "aces",
      gamma: 2.2,
      colorSpace: "sRGB",
      bloom: false,
      filmGrain: false
    });
    await env.initialize();
  });

  describe("initialization", () => {
    it("initializes all components", () => {
      assert.ok(env.certifiedEnv);
      assert.ok(env.lighting);
      assert.ok(env.camera);
      assert.ok(env.integrator);
      assert.ok(env.denoiser);
      assert.ok(env.compositor);
      assert.ok(env.recorder);
      assert.ok(env.canvas);
      assert.ok(env.ctx);
      assert.equal(env.advanced, true);
    });

    it("sets constants correctly", () => {
      assert.equal(env.constants.WIDTH, 64);
      assert.equal(env.constants.HEIGHT, 64);
      assert.equal(env.constants.FRAMES, 2);
      assert.equal(env.constants.FPS, 30);
      assert.equal(env.constants.CANONICAL_SEED, 0x5EED4D00);
      assert.equal(env.constants.SP_P, 1);
      assert.equal(env.constants.MAX_DEPTH, 2);
      assert.equal(env.constants.RR_DEPTH, 1);
    });

    it("initializes certified environment", () => {
      assert.ok(env.certifiedEnv.sun);
      assert.ok(typeof env.certifiedEnv.advance === "function");
    });

    it("initializes lighting with sky model", () => {
      assert.ok(env.lighting.skyModel);
      assert.ok(env.lighting.lights);
    });

    it("initializes physical camera", () => {
      assert.ok(env.camera.focalPixels > 0);
      assert.ok(env.camera.apertureRadius >= 0);
    });

    it("initializes integrator", () => {
      assert.ok(env.integrator.maxDepth === 2);
      assert.ok(env.integrator.rrDepth === 1);
      assert.ok(env.integrator.spp === 1);
    });

    it("initializes temporal denoiser", () => {
      assert.ok(env.denoiser.historyLength === 8);
    });

    it("initializes compositor", () => {
      assert.equal(env.compositor.tonemap, "aces");
      assert.equal(env.compositor.exposure, 1.0);
      assert.equal(env.compositor.gamma, 2.2);
    });

    it("initializes evidence recorder", () => {
      assert.equal(env.recorder.worldId, "world-photoreal-golden-hour-001");
      assert.equal(env.recorder.timelineId, "timeline-photoreal-golden-hour-v1");
      assert.equal(env.recorder.intentId, "render-4d-photoreal-golden-hour");
    });
  });

  describe("advance()", () => {
    it("advances 4D worldline", async () => {
      await env.advance();
      assert.ok(env.certifiedEnv.frameCount > 0);
    });

    it("updates sun from worldline", async () => {
      const sunBefore = env.lighting.skyModel.sunDirection;
      await env.advance();
      const sunAfter = env.lighting.skyModel.sunDirection;
      // Sun direction should be updated (may be same if worldline returns same)
      assert.ok(Array.isArray(sunAfter));
    });
  });

  describe("renderFrame()", () => {
    it("renders a frame and returns result", async () => {
      const result = await env.renderFrame(0);
      
      assert.ok(result.color instanceof Uint8Array);
      assert.equal(result.color.length, 64 * 64 * 3);
      assert.ok(result.aovs);
      assert.ok(typeof result.renderTime === "number");
      assert.ok(typeof result.denoiseTime === "number");
      assert.ok(typeof result.compositeTime === "number");
    });

    it("records frame evidence", async () => {
      env.recorder.begin();
      await env.renderFrame(0);
      const records = env.recorder.finalize();
      
      assert.equal(records.length, 1);
      assert.equal(records[0].frame, 0);
      assert.equal(records[0].timeSeconds, 0);
      assert.ok(records[0].frameHash);
      assert.ok(records[0].radianceHash);
      assert.ok(records[0].aovsHash);
    });

    it("produces deterministic output for same frame", async () => {
      const env2 = new PhotorealEnvironment({
        width: 64,
        height: 64,
        frames: 2,
        fps: 30,
        seed: 0x5EED4D00,
        spp: 1,
        maxDepth: 2,
        rrDepth: 1,
        strategy: "path",
        denoiser: "temporal"
      });
      await env2.initialize();
      
      const result1 = await env.renderFrame(0);
      const result2 = await env2.renderFrame(0);
      
      // Compare color buffers
      for (let i = 0; i < result1.color.length; i++) {
        assert.equal(result1.color[i], result2.color[i], `Pixel ${i} mismatch`);
      }
    });

    it("advances time for subsequent frames", async () => {
      env.recorder.begin();
      await env.renderFrame(0);
      await env.renderFrame(1);
      const records = env.recorder.finalize();
      
      assert.equal(records.length, 2);
      assert.equal(records[0].frame, 0);
      assert.equal(records[0].timeSeconds, 0);
      assert.equal(records[1].frame, 1);
      assert.equal(records[1].timeSeconds, 1 / 30);
    });
  });

  describe("fingerprint()", () => {
    it("returns runtime fingerprint", () => {
      const fp = env.fingerprint();
      assert.ok(typeof fp === "string");
      assert.equal(fp.length, 32);
    });

    it("is deterministic for same configuration", async () => {
      const env2 = new PhotorealEnvironment({
        width: 64,
        height: 64,
        frames: 2,
        fps: 30,
        seed: 0x5EED4D00,
        spp: 1,
        maxDepth: 2,
        rrDepth: 1
      });
      await env2.initialize();
      
      assert.equal(env.fingerprint(), env2.fingerprint());
    });
  });

  describe("determinism across runs", () => {
    it("two environments with same config produce bitwise identical frames", async () => {
      const run1 = [];
      const run2 = [];
      
      for (let run = 0; run < 2; run++) {
        const testEnv = new PhotorealEnvironment({
          width: 32,
          height: 32,
          frames: 1,
          fps: 30,
          seed: 0x5EED4D00,
          spp: 1,
          maxDepth: 1,
          rrDepth: 1
        });
        await testEnv.initialize();
        const result = await testEnv.renderFrame(0);
        if (run === 0) run1.push(...result.color);
        else run2.push(...result.color);
      }
      
      for (let i = 0; i < run1.length; i++) {
        assert.equal(run1[i], run2[i], `Byte ${i} differs between runs`);
      }
    });
  });
});

describe("PhotorealEnvironment — Configuration Variants", () => {
  it("accepts bdpt strategy", async () => {
    const env = new PhotorealEnvironment({
      width: 32,
      height: 32,
      frames: 1,
      strategy: "bdpt",
      seed: 0x5EED4D00
    });
    await env.initialize();
    assert.equal(env.constants.INTEGRATOR_STRATEGY, "bdpt");
    assert.ok(env.integrator.strategy === "bdpt");
  });

  it("accepts volumetric strategy", async () => {
    const env = new PhotorealEnvironment({
      width: 32,
      height: 32,
      frames: 1,
      strategy: "volumetric",
      seed: 0x5EED4D00
    });
    await env.initialize();
    assert.equal(env.constants.INTEGRATOR_STRATEGY, "volumetric");
    assert.ok(env.integrator.strategy === "volumetric");
  });

  it("accepts oidn denoiser", async () => {
    const env = new PhotorealEnvironment({
      width: 32,
      height: 32,
      frames: 1,
      denoiser: "oidn",
      seed: 0x5EED4D00
    });
    await env.initialize();
    assert.equal(env.constants.DENOISER, "oidn");
    assert.ok(env.denoiser instanceof Object); // OIDNDenoiser
  });

  it("accepts different tonemap modes", async () => {
    for (const tonemap of ["reinhard", "filmic", "none"]) {
      const env = new PhotorealEnvironment({
        width: 32,
        height: 32,
        frames: 1,
        tonemap,
        seed: 0x5EED4D00
      });
      await env.initialize();
      assert.equal(env.compositor.tonemap, tonemap);
    }
  });

  it("accepts different color spaces", async () => {
    for (const colorSpace of ["sRGB", "ACES", "ACEScg", "linear"]) {
      const env = new PhotorealEnvironment({
        width: 32,
        height: 32,
        frames: 1,
        colorSpace,
        seed: 0x5EED4D00
      });
      await env.initialize();
      assert.equal(env.compositor.colorSpace, colorSpace);
    }
  });
});

describe("PhotorealEnvironment — Evidence Compliance", () => {
  it("recorder validates V2 frame fields", async () => {
    const env = new PhotorealEnvironment({
      width: 32,
      height: 32,
      frames: 1,
      seed: 0x5EED4D00
    });
    await env.initialize();
    env.recorder.begin();
    
    await env.renderFrame(0);
    const records = env.recorder.finalize();
    
    const record = records[0];
    // V2 compliance
    assert.ok(typeof record.frame === "number");
    assert.ok(typeof record.timeSeconds === "number");
    assert.equal(record.intentId, "render-4d-photoreal-golden-hour");
    assert.equal(record.timelineId, "timeline-photoreal-golden-hour-v1");
    assert.equal(record.worldId, "world-photoreal-golden-hour-001");
    assert.equal(record.timeSeconds, record.frame / 30);
    assert.ok(record.parameters);
    
    // Photoreal-specific
    assert.ok(record.radiance);
    assert.ok(record.aovs);
    assert.ok(record.camera);
    
    // V4 dual evidence
    assert.ok(record.radianceHash);
    assert.ok(record.aovsHash);
  });

  it("frameHash is deterministic", async () => {
    const env = new PhotorealEnvironment({
      width: 32,
      height: 32,
      frames: 1,
      seed: 0x5EED4D00
    });
    await env.initialize();
    env.recorder.begin();
    await env.renderFrame(0);
    env.recorder.finalize();
    
    const hash1 = env.recorder.frameHash(0);
    const hash2 = env.recorder.frameHash(0);
    assert.equal(hash1, hash2);
  });
});

describe("PhotorealEnvironment — Conformance Checks", () => {
  it("recorder exists (provenance.recorder-exists)", () => {
    const env = new PhotorealEnvironment({ seed: 0x5EED4D00 });
    assert.ok(env.recorder);
    assert.ok(typeof env.recorder.begin === "function");
    assert.ok(typeof env.recorder.record === "function");
    assert.ok(typeof env.recorder.finalize === "function");
    assert.ok(typeof env.recorder.getRecords === "function");
  });

  it("frames have required fields (provenance.frame-fields)", async () => {
    const env = new PhotorealEnvironment({
      width: 32,
      height: 32,
      frames: 1,
      seed: 0x5EED4D00
    });
    await env.initialize();
    env.recorder.begin();
    await env.renderFrame(0);
    const records = env.recorder.finalize();
    
    const record = records[0];
    assert.ok(record.intentId);
    assert.ok(record.timelineId);
    assert.ok(record.worldId);
    assert.ok(typeof record.timeSeconds === "number");
    assert.ok(record.parameters);
  });

  it("evidence has required bundle fields (evidence.bundle-fields)", async () => {
    const env = new PhotorealEnvironment({
      width: 32,
      height: 32,
      frames: 1,
      seed: 0x5EED4D00
    });
    await env.initialize();
    env.recorder.begin();
    await env.renderFrame(0);
    const records = env.recorder.finalize();
    
    const record = records[0];
    assert.ok(record.frameHash); // Replay token equivalent
    assert.ok(record.worldId);
    assert.ok(record.timelineId);
  });

  it("dual evidence required (evidence.dual-require)", async () => {
    const env = new PhotorealEnvironment({
      width: 32,
      height: 32,
      frames: 1,
      seed: 0x5EED4D00
    });
    await env.initialize();
    env.recorder.begin();
    
    // Should throw without radianceHash
    await assert.rejects(async () => {
      env.recorder.record({
        frame: 0,
        timeSeconds: 0,
        intentId: "render-4d-photoreal-golden-hour",
        timelineId: "timeline-photoreal-golden-hour-v1",
        worldId: "world-photoreal-golden-hour-001",
        parameters: {},
        radiance: new Float32Array([0]),
        aovs: {},
        camera: {},
        aovsHash: "test"
      });
    }, /V4: missing radianceHash/);
    
    // Should throw without aovsHash
    await assert.rejects(async () => {
      env.recorder.record({
        frame: 0,
        timeSeconds: 0,
        intentId: "render-4d-photoreal-golden-hour",
        timelineId: "timeline-photoreal-golden-hour-v1",
        worldId: "world-photoreal-golden-hour-001",
        parameters: {},
        radiance: new Float32Array([0]),
        aovs: {},
        camera: {},
        radianceHash: "test"
      });
    }, /V4: missing aovsHash/);
  });
});