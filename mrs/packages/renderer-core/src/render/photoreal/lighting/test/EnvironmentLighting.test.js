import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EnvironmentLighting, PointLight, DirectionalLight, SpotLight, AreaLight } from "../EnvironmentLighting.js";
import { V3 } from "../../material/PhotorealUtils.js";

describe("EnvironmentLighting — Analytic Lights", () => {
  describe("PointLight", () => {
    it("evaluates radiance correctly for aligned direction", () => {
      const light = new PointLight({ position: [0, 10, 0], color: [1, 1, 1], intensity: 100 });
      const hitPoint = [0, 0, 0];
      const wi = [0, 1, 0]; // Toward light
      
      const result = light.evaluate(wi, hitPoint);
      assert.ok(result.radiance[0] > 0);
      assert.equal(result.pdf, 1);
      assert.ok(result.lightId);
    });

    it("returns zero for misaligned direction", () => {
      const light = new PointLight({ position: [0, 10, 0], color: [1, 1, 1], intensity: 100 });
      const hitPoint = [0, 0, 0];
      const wi = [1, 0, 0]; // Perpendicular to light
      
      const result = light.evaluate(wi, hitPoint);
      assert.deepEqual(result.radiance, [0, 0, 0]);
      assert.equal(result.pdf, 0);
    });

    it("samples correctly", () => {
      const light = new PointLight({ position: [0, 10, 0], color: [1, 0.8, 0.6], intensity: 50000 });
      const hitPoint = [0, 0, 0];
      const rng = { nextFloat: () => 0.5 };
      
      const result = light.sample(hitPoint, rng);
      assert.ok(result.wi[1] > 0); // Upward
      assert.ok(result.radiance[0] > 0);
      assert.equal(result.pdf, 1);
    });
  });

  describe("DirectionalLight", () => {
    it("evaluates radiance for aligned direction", () => {
      const light = new DirectionalLight({ direction: [0, -1, 0], color: [1, 0.9, 0.8], intensity: 100000 });
      const wi = [0, -1, 0]; // Aligned
      
      const result = light.evaluate(wi, [0, 0, 0]);
      assert.ok(result.radiance[0] > 0);
      assert.equal(result.pdf, 1);
    });

    it("returns zero for misaligned direction", () => {
      const light = new DirectionalLight({ direction: [0, -1, 0], color: [1, 1, 1], intensity: 100000 });
      const wi = [1, 0, 0]; // Perpendicular
      
      const result = light.evaluate(wi, [0, 0, 0]);
      assert.deepEqual(result.radiance, [0, 0, 0]);
      assert.equal(result.pdf, 0);
    });

    it("samples correctly", () => {
      const light = new DirectionalLight({ direction: [0, -1, 0], color: [1, 0.9, 0.8], intensity: 100000 });
      const rng = { nextFloat: () => 0.5 };
      
      const result = light.sample([0, 0, 0], rng);
      assert.deepEqual(result.wi, [0, 1, 0]); // Opposite of light direction
      assert.ok(result.radiance[0] > 0);
      assert.equal(result.pdf, 1);
    });
  });

  describe("SpotLight", () => {
    it("evaluates radiance within cone", () => {
      const light = new SpotLight({ direction: [0, -1, 0], angle: Math.PI / 4, color: [1, 1, 1], intensity: 100 });
      const wi = [0, -1, 0]; // Center of cone
      
      const result = light.evaluate(wi, [0, 0, 0]);
      assert.ok(result.radiance[0] > 0);
    });

    it("returns zero outside penumbra", () => {
      const light = new SpotLight({ direction: [0, -1, 0], angle: Math.PI / 6, penumbra: 0.1, color: [1, 1, 1], intensity: 100 });
      const wi = [1, 0, 0]; // 90 degrees from center
      
      const result = light.evaluate(wi, [0, 0, 0]);
      assert.deepEqual(result.radiance, [0, 0, 0]);
    });

    it("smooths at penumbra edge", () => {
      const light = new SpotLight({ direction: [0, -1, 0], angle: Math.PI / 4, penumbra: 0.2, color: [1, 1, 1], intensity: 100 });
      const edgeDir = V3.normalize([Math.sin(Math.PI / 4 + 0.1), -Math.cos(Math.PI / 4 + 0.1), 0]);
      
      const result = light.evaluate(edgeDir, [0, 0, 0]);
      assert.ok(result.radiance[0] >= 0);
      assert.ok(result.radiance[0] <= 100);
    });
  });

  describe("AreaLight", () => {
    it("evaluates radiance for front-facing", () => {
      const light = new AreaLight({ position: [0, 10, 0], normal: [0, -1, 0], width: 2, height: 2, color: [1, 1, 1], intensity: 100 });
      const hitPoint = [0, 0, 0];
      const wi = [0, 1, 0]; // Toward light
      
      const result = light.evaluate(wi, hitPoint);
      assert.ok(result.radiance[0] > 0);
      assert.ok(result.pdf > 0);
    });

    it("returns zero for back-facing", () => {
      const light = new AreaLight({ position: [0, 10, 0], normal: [0, -1, 0], width: 2, height: 2, color: [1, 1, 1], intensity: 100 });
      const hitPoint = [0, 0, 0];
      const wi = [0, -1, 0]; // Away from light
      
      const result = light.evaluate(wi, hitPoint);
      assert.deepEqual(result.radiance, [0, 0, 0]);
    });

    it("samples within area bounds", () => {
      const light = new AreaLight({ position: [0, 10, 0], normal: [0, -1, 0], width: 2, height: 2, color: [1, 1, 1], intensity: 100 });
      const rng = { nextFloat: () => 0.5 };
      
      const result = light.sample([0, 0, 0], rng);
      assert.ok(result.wi[1] > 0); // Upward
      assert.ok(result.radiance[0] > 0);
      assert.ok(result.pdf > 0);
    });
  });
});

describe("EnvironmentLighting — Sky and Environment", () => {
  describe("constructor", () => {
    it("initializes with Hosek-Wilkie sky by default", () => {
      const env = new EnvironmentLighting();
      assert.ok(env.skyModel);
      assert.ok(env.lights);
      assert.equal(env.lights.length, 0);
    });

    it("initializes with Preetham sky when specified", () => {
      const env = new EnvironmentLighting({ skyModel: "preetham" });
      assert.ok(env.skyModel);
    });

    it("initializes with analytic lights", () => {
      const env = new EnvironmentLighting({
        lights: [
          { type: "point", position: [0, 10, 0], intensity: 100 },
          { type: "directional", direction: [0, -1, 0], intensity: 100000 }
        ]
      });
      assert.equal(env.lights.length, 2);
      assert.ok(env.lights[0] instanceof PointLight);
      assert.ok(env.lights[1] instanceof DirectionalLight);
    });
  });

  describe("addLight / removeLight / getLight", () => {
    it("adds and retrieves lights", () => {
      const env = new EnvironmentLighting();
      const light = env.addLight({ type: "point", position: [0, 10, 0], intensity: 100 });
      assert.ok(light);
      assert.equal(env.lights.length, 1);
      
      const retrieved = env.getLight(light.lightId);
      assert.equal(retrieved, light);
    });

    it("removes lights by id", () => {
      const env = new EnvironmentLighting();
      const light = env.addLight({ type: "point", position: [0, 10, 0], intensity: 100 });
      env.removeLight(light.lightId);
      assert.equal(env.lights.length, 0);
      assert.equal(env.getLight(light.lightId), undefined);
    });
  });

  describe("updateSunFromWorldline", () => {
    it("updates sky model sun direction", () => {
      const env = new EnvironmentLighting();
      const mockWorldline = {
        getSunPosition: (time) => [0.5, 0.8, 0.3]
      };
      env.sunWorldline = mockWorldline;
      
      env.updateSunFromWorldline(0.5);
      assert.ok(V3.dot(env.skyModel.sunDirection, [0.5, 0.8, 0.3]) > 0.99);
    });

    it("creates directional sun light if missing", () => {
      const env = new EnvironmentLighting();
      const mockWorldline = {
        getSunPosition: (time) => [0.5, 0.8, 0.3]
      };
      env.sunWorldline = mockWorldline;
      
      env.updateSunFromWorldline(0.5);
      const sunLight = env.lights.find(l => l.type === "directional");
      assert.ok(sunLight);
      assert.ok(V3.dot(sunLight.direction, [0.5, 0.8, 0.3]) > 0.99);
    });

    it("updates existing sun light direction", () => {
      const env = new EnvironmentLighting();
      const mockWorldline = {
        getSunPosition: (time) => time === 0 ? [1, 0, 0] : [0, 1, 0]
      };
      env.sunWorldline = mockWorldline;
      
      env.updateSunFromWorldline(0);
      const dir1 = env.lights.find(l => l.type === "directional").direction;
      
      env.updateSunFromWorldline(1);
      const dir2 = env.lights.find(l => l.type === "directional").direction;
      
      assert.ok(V3.dot(dir1, [1, 0, 0]) > 0.99);
      assert.ok(V3.dot(dir2, [0, 1, 0]) > 0.99);
    });
  });

  describe("evaluateRadiance", () => {
    it("returns sky radiance for no lights", () => {
      const env = new EnvironmentLighting({ skyModel: "preetham" });
      const radiance = env.evaluateRadiance([0, 1, 0], [0, 0, 0], [0, 1, 0]);
      assert.ok(Array.isArray(radiance));
      assert.equal(radiance.length, 3);
    });

    it("adds analytic light radiance", () => {
      const env = new EnvironmentLighting({
        skyModel: "preetham",
        lights: [{ type: "directional", direction: [0, -1, 0], intensity: 100000, color: [1, 1, 1] }]
      });
      const wi = [0, -1, 0];
      const radiance = env.evaluateRadiance(wi, [0, 0, 0], [0, 1, 0]);
      assert.ok(radiance[0] > 0);
    });
  });

  describe("sampleLight", () => {
    it("returns null for no lights", () => {
      const env = new EnvironmentLighting();
      const result = env.sampleLight([0, 0, 0], [0, 1, 0], { nextFloat: () => 0.5 });
      assert.equal(result.lightId, null);
      assert.equal(result.pdf, 0);
    });

    it("samples a light when present", () => {
      const env = new EnvironmentLighting({
        lights: [
          { type: "point", position: [0, 10, 0], intensity: 100, color: [1, 1, 1] },
          { type: "directional", direction: [0, -1, 0], intensity: 100000, color: [1, 1, 1] }
        ]
      });
      const rng = { nextFloat: () => 0.5 };
      const result = env.sampleLight([0, 0, 0], [0, 1, 0], rng);
      assert.ok(result.lightId);
      assert.ok(result.pdf > 0);
    });
  });

  describe("MIS weight", () => {
    it("computes balance heuristic correctly", () => {
      const env = new EnvironmentLighting();
      const w = env.misWeight(0.5, 0.5);
      assert.equal(w, 0.5);
      
      const w2 = env.misWeight(1.0, 0.0);
      assert.equal(w2, 1.0);
      
      const w3 = env.misWeight(0.0, 1.0);
      assert.equal(w3, 0.0);
    });
  });
});

describe("EnvironmentLighting — Environment Map", () => {
  it("samples env map when provided", () => {
    const envMap = {
      data: new Uint8Array(4 * 2 * 3), // 4x2 RGB
      width: 4,
      height: 2
    };
    // Fill with white
    for (let i = 0; i < envMap.data.length; i++) envMap.data[i] = 255;
    
    const env = new EnvironmentLighting({ envMap, envMapIntensity: 1.0 });
    const radiance = env.sampleEnvMap([0, 1, 0]); // Zenith
    assert.equal(radiance[0], 1.0);
    assert.equal(radiance[1], 1.0);
    assert.equal(radiance[2], 1.0);
  });

  it("returns zero for null env map", () => {
    const env = new EnvironmentLighting();
    const radiance = env.sampleEnvMap([0, 1, 0]);
    assert.deepEqual(radiance, [0, 0, 0]);
  });
});