import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PathIntegrator, BDPTIntegrator, VolumetricIntegrator } from "../PathIntegrator.js";
import { PhotorealRNG, V3 } from "../material/PhotorealUtils.js";

describe("PathIntegrator — Construction & Configuration", () => {
  describe("constructor", () => {
    it("initializes with default values", () => {
      const integrator = new PathIntegrator();
      assert.equal(integrator.maxDepth, 16);
      assert.equal(integrator.rrDepth, 4);
      assert.equal(integrator.spp, 1);
      assert.equal(integrator.strategy, "path");
      assert.equal(integrator.clampRadiance, 1e4);
      assert.ok(integrator.rng instanceof PhotorealRNG);
    });

    it("initializes with custom values", () => {
      const integrator = new PathIntegrator({
        maxDepth: 32,
        rrDepth: 8,
        spp: 64,
        strategy: "bdpt",
        clampRadiance: 1e5,
        seed: 0x12345678
      });
      assert.equal(integrator.maxDepth, 32);
      assert.equal(integrator.rrDepth, 8);
      assert.equal(integrator.spp, 64);
      assert.equal(integrator.strategy, "bdpt");
      assert.equal(integrator.clampRadiance, 1e5);
    });

    it("uses deterministic RNG with same seed", () => {
      const rng1 = new PathIntegrator({ seed: 0x5EED4D00 }).rng;
      const rng2 = new PathIntegrator({ seed: 0x5EED4D00 }).rng;
      
      for (let i = 0; i < 10; i++) {
        assert.equal(rng1.next(), rng2.next());
      }
    });
  });
});

describe("PathIntegrator — MIS Weight", () => {
  it("computes balance heuristic correctly", () => {
    const integrator = new PathIntegrator();
    
    assert.equal(integrator.misWeight(0.5, 0.5), 0.5);
    assert.equal(integrator.misWeight(1.0, 0.0), 1.0);
    assert.equal(integrator.misWeight(0.0, 1.0), 0.0);
    assert.equal(integrator.misWeight(0.25, 0.75), 0.1);
    assert.equal(integrator.misWeight(0.75, 0.25), 0.9);
  });
});

describe("PathIntegrator — traceSingle", () => {
  it("returns result structure", () => {
    const integrator = new PathIntegrator({ maxDepth: 1, seed: 0x5EED4D00 });
    const rng = new PhotorealRNG(0x5EED4D00);
    
    const scene = {
      intersect: () => null,
      environment: {
        evaluateRadiance: () => [0.1, 0.2, 0.3]
      },
      getMaterial: () => ({})
    };
    
    const ray = { origin: [0, 0, 0], direction: [0, 0, -1] };
    const result = integrator.traceSingle(ray, scene, rng);
    
    assert.ok(result.radiance);
    assert.equal(result.radiance.length, 3);
    assert.ok(result.aovs);
    assert.ok(result.aovs.direct);
    assert.ok(result.aovs.indirect);
    assert.ok(result.aovs.albedo);
    assert.ok(result.aovs.normal);
    assert.ok(typeof result.aovs.depth === "number");
    assert.ok(typeof result.aovs.materialId === "number");
  });

  it("returns environment radiance when no hit", () => {
    const integrator = new PathIntegrator({ maxDepth: 1, seed: 0x5EED4D00 });
    const rng = new PhotorealRNG(0x5EED4D00);
    
    const scene = {
      intersect: () => null,
      environment: {
        evaluateRadiance: (wi) => [0.5, 0.5, 0.5]
      },
      getMaterial: () => ({})
    };
    
    const ray = { origin: [0, 0, 0], direction: [0, 0, -1] };
    const result = integrator.traceSingle(ray, scene, rng);
    
    assert.deepEqual(result.radiance, [0.5, 0.5, 0.5]);
  });
});

describe("PathIntegrator — Integration (stub scene)", () => {
  it("integrate returns radiance and AOVs arrays", () => {
    const integrator = new PathIntegrator({ spp: 1, maxDepth: 1, seed: 0x5EED4D00 });
    const rng = new PhotorealRNG(0x5EED4D00);
    
    const camera = {
      imageWidth: 64,
      imageHeight: 64,
      generateRaySimple: (x, y, rng) => ({
        origin: [0, 0, 0],
        direction: [0, 0, -1],
        weight: 1.0
      })
    };
    
    const scene = {
      intersect: () => null,
      environment: {
        evaluateRadiance: () => [0.2, 0.3, 0.4]
      },
      getMaterial: () => ({})
    };
    
    const result = integrator.integrate(scene, camera, rng);
    
    assert.ok(result.radiance instanceof Float32Array);
    assert.equal(result.radiance.length, 64 * 64 * 3);
    assert.ok(result.aovs.albedo instanceof Float32Array);
    assert.ok(result.aovs.normal instanceof Float32Array);
    assert.ok(result.aovs.depth instanceof Float32Array);
    assert.ok(result.aovs.direct instanceof Float32Array);
    assert.ok(result.aovs.indirect instanceof Float32Array);
  });

  it("produces deterministic output with same seed", () => {
    const seed = 0x5EED4D00;
    
    const integrator1 = new PathIntegrator({ spp: 1, maxDepth: 1, seed });
    const rng1 = new PhotorealRNG(seed);
    const camera1 = {
      imageWidth: 32,
      imageHeight: 32,
      generateRaySimple: (x, y, rng) => ({
        origin: [0, 0, 0],
        direction: [0, 0, -1],
        weight: 1.0
      })
    };
    const scene1 = {
      intersect: () => null,
      environment: { evaluateRadiance: () => [0.2, 0.3, 0.4] },
      getMaterial: () => ({})
    };
    
    const integrator2 = new PathIntegrator({ spp: 1, maxDepth: 1, seed });
    const rng2 = new PhotorealRNG(seed);
    const camera2 = {
      imageWidth: 32,
      imageHeight: 32,
      generateRaySimple: (x, y, rng) => ({
        origin: [0, 0, 0],
        direction: [0, 0, -1],
        weight: 1.0
      })
    };
    const scene2 = {
      intersect: () => null,
      environment: { evaluateRadiance: () => [0.2, 0.3, 0.4] },
      getMaterial: () => ({})
    };
    
    const result1 = integrator1.integrate(scene1, camera1, rng1);
    const result2 = integrator2.integrate(scene2, camera2, rng2);
    
    for (let i = 0; i < result1.radiance.length; i++) {
      assert.equal(result1.radiance[i], result2.radiance[i]);
    }
  });
});

describe("BDPTIntegrator", () => {
  it("extends PathIntegrator", () => {
    const integrator = new BDPTIntegrator({ eyeDepth: 3, lightDepth: 3 });
    assert.ok(integrator instanceof PathIntegrator);
    assert.equal(integrator.strategy, "bdpt");
    assert.equal(integrator.eyeDepth, 3);
    assert.equal(integrator.lightDepth, 3);
  });

  it("inherits PathIntegrator methods", () => {
    const integrator = new BDPTIntegrator({ maxDepth: 8, seed: 0x5EED4D00 });
    assert.equal(integrator.maxDepth, 8);
    assert.equal(integrator.misWeight(0.5, 0.5), 0.5);
  });
});

describe("VolumetricIntegrator", () => {
  it("extends PathIntegrator", () => {
    const integrator = new VolumetricIntegrator({ maxSteps: 128, stepSize: 0.05 });
    assert.ok(integrator instanceof PathIntegrator);
    assert.equal(integrator.strategy, "volumetric");
    assert.equal(integrator.maxSteps, 128);
    assert.equal(integrator.stepSize, 0.05);
  });

  it("inherits PathIntegrator methods", () => {
    const integrator = new VolumetricIntegrator({ maxDepth: 16, seed: 0x5EED4D00 });
    assert.equal(integrator.maxDepth, 16);
    assert.equal(integrator.misWeight(0.5, 0.5), 0.5);
  });
});

describe("PathIntegrator — Clamping", () => {
  it("clamps radiance to max value", () => {
    const integrator = new PathIntegrator({ maxDepth: 1, clampRadiance: 10, seed: 0x5EED4D00 });
    const rng = new PhotorealRNG(0x5EED4D00);
    
    const scene = {
      intersect: () => null,
      environment: {
        evaluateRadiance: () => [100, 200, 50] // Way over clamp
      },
      getMaterial: () => ({})
    };
    
    const ray = { origin: [0, 0, 0], direction: [0, 0, -1] };
    const result = integrator.traceSingle(ray, scene, rng);
    
    assert.ok(result.radiance[0] <= 10);
    assert.ok(result.radiance[1] <= 10);
    assert.ok(result.radiance[2] <= 10);
  });
});