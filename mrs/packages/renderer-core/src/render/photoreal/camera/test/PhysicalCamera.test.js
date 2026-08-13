import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PhysicalCamera } from "../PhysicalCamera.js";
import { V3 } from "../../material/PhotorealUtils.js";

describe("PhysicalCamera — Construction & Properties", () => {
  describe("constructor", () => {
    it("initializes with default values", () => {
      const cam = new PhysicalCamera({ imageWidth: 1920, imageHeight: 1080 });
      assert.equal(cam.fov, 60);
      assert.equal(cam.focalLength, 35);
      assert.deepEqual(cam.sensorSize, [36, 24]);
      assert.equal(cam.aperture, 2.8);
      assert.equal(cam.focusDistance, 10);
      assert.equal(cam.shutterAngle, 180);
      assert.deepEqual(cam.eye, [0, 0, 0]);
      assert.deepEqual(cam.target, [0, 0, -1]);
      assert.deepEqual(cam.up, [0, 1, 0]);
    });

    it("initializes with custom values", () => {
      const cam = new PhysicalCamera({
        fov: 90,
        focalLength: 50,
        sensorSize: [24, 16],
        aperture: 1.4,
        focusDistance: 5,
        shutterAngle: 270,
        eye: [1, 2, 3],
        target: [4, 5, 6],
        up: [0, 1, 0],
        imageWidth: 1280,
        imageHeight: 720
      });
      assert.equal(cam.fov, 90);
      assert.equal(cam.focalLength, 50);
      assert.deepEqual(cam.sensorSize, [24, 16]);
      assert.equal(cam.aperture, 1.4);
      assert.equal(cam.focusDistance, 5);
      assert.equal(cam.shutterAngle, 270);
      assert.deepEqual(cam.eye, [1, 2, 3]);
      assert.deepEqual(cam.target, [4, 5, 6]);
    });

    it("computes view matrix correctly", () => {
      const cam = new PhysicalCamera({
        eye: [0, 0, 5],
        target: [0, 0, 0],
        up: [0, 1, 0],
        imageWidth: 1920,
        imageHeight: 1080
      });
      // Forward should point toward target
      assert.ok(Math.abs(cam.viewMatrix.forward[2] + 1) < 1e-6);
      assert.ok(Math.abs(cam.viewMatrix.right[0] - 1) < 1e-6);
      assert.ok(Math.abs(cam.viewMatrix.up[1] - 1) < 1e-6);
    });

    it("computes projection parameters", () => {
      const cam = new PhysicalCamera({
        focalLength: 35,
        sensorSize: [36, 24],
        aperture: 2.8,
        focusDistance: 10,
        imageWidth: 1920,
        imageHeight: 1080
      });
      assert.ok(cam.focalPixels > 0);
      assert.ok(cam.apertureRadius > 0);
      assert.ok(cam.cocScale > 0);
    });
  });

  describe("setResolution", () => {
    it("updates image dimensions and recomputes projection", () => {
      const cam = new PhysicalCamera({ imageWidth: 1920, imageHeight: 1080 });
      const oldFocalPixels = cam.focalPixels;
      
      cam.setResolution(3840, 2160);
      assert.equal(cam.imageWidth, 3840);
      assert.equal(cam.imageHeight, 2160);
      // focalPixels should scale with height
      assert.ok(Math.abs(cam.focalPixels - oldFocalPixels * 2) < 1e-6);
    });
  });

  describe("setEye / setTarget / setFocusDistance / setAperture", () => {
    it("updates eye and recomputes view matrix", () => {
      const cam = new PhysicalCamera({ imageWidth: 1920, imageHeight: 1080 });
      cam.setEye([10, 0, 0]);
      assert.deepEqual(cam.eye, [10, 0, 0]);
      assert.ok(Math.abs(cam.viewMatrix.eye[0] - 10) < 1e-6);
    });

    it("updates target and recomputes view matrix", () => {
      const cam = new PhysicalCamera({ imageWidth: 1920, imageHeight: 1080 });
      cam.setTarget([0, 0, -10]);
      assert.deepEqual(cam.target, [0, 0, -10]);
      assert.ok(Math.abs(cam.viewMatrix.forward[2] + 1) < 1e-6);
    });

    it("updates focus distance and recomputes projection", () => {
      const cam = new PhysicalCamera({ imageWidth: 1920, imageHeight: 1080 });
      const oldRadius = cam.apertureRadius;
      cam.setFocusDistance(20);
      assert.equal(cam.focusDistance, 20);
      assert.ok(Math.abs(cam.apertureRadius - oldRadius * 2) < 1e-6);
    });

    it("updates aperture and recomputes projection", () => {
      const cam = new PhysicalCamera({ imageWidth: 1920, imageHeight: 1080 });
      const oldRadius = cam.apertureRadius;
      cam.setAperture(5.6);
      assert.equal(cam.aperture, 5.6);
      assert.ok(Math.abs(cam.apertureRadius - oldRadius * 0.5) < 1e-6);
    });
  });
});

describe("PhysicalCamera — Ray Generation", () => {
  describe("generateRaySimple", () => {
    it("generates ray for center pixel", () => {
      const cam = new PhysicalCamera({
        imageWidth: 1920,
        imageHeight: 1080,
        fov: 60,
        eye: [0, 0, 0],
        target: [0, 0, -1]
      });
      const rng = { nextFloat: () => 0.5 };
      const ray = cam.generateRaySimple(960, 540, rng);
      
      assert.ok(ray.origin);
      assert.equal(ray.origin.length, 3);
      assert.ok(ray.direction);
      assert.equal(ray.direction.length, 3);
      assert.equal(ray.weight, 1.0);
      // Center ray should point forward (negative Z)
      assert.ok(ray.direction[2] < 0);
    });

    it("generates ray for corner pixels", () => {
      const cam = new PhysicalCamera({
        imageWidth: 1920,
        imageHeight: 1080,
        fov: 60,
        eye: [0, 0, 0],
        target: [0, 0, -1]
      });
      const rng = { nextFloat: () => 0.5 };
      
      // Top-left
      const rayTL = cam.generateRaySimple(0, 0, rng);
      assert.ok(rayTL.direction[0] < 0); // Left
      assert.ok(rayTL.direction[1] > 0); // Up
      
      // Bottom-right
      const rayBR = cam.generateRaySimple(1919, 1079, rng);
      assert.ok(rayBR.direction[0] > 0); // Right
      assert.ok(rayBR.direction[1] < 0); // Down
    });

    it("applies depth of field when aperture > 0", () => {
      const cam = new PhysicalCamera({
        imageWidth: 1920,
        imageHeight: 1080,
        aperture: 1.4,
        focusDistance: 5,
        eye: [0, 0, 0],
        target: [0, 0, -1]
      });
      const rng = { nextFloat: () => 0.5 };
      const ray = cam.generateRaySimple(960, 540, rng);
      
      // Origin should be offset from eye due to DoF
      assert.ok(V3.length(V3.sub(ray.origin, cam.eye)) > 0);
    });

    it("no depth of field when aperture is 0", () => {
      const cam = new PhysicalCamera({
        imageWidth: 1920,
        imageHeight: 1080,
        aperture: 0,
        eye: [0, 0, 0],
        target: [0, 0, -1]
      });
      const rng = { nextFloat: () => 0.5 };
      const ray = cam.generateRaySimple(960, 540, rng);
      
      assert.deepEqual(ray.origin, cam.eye);
    });
  });

  describe("generateRay (with time)", () => {
    it("generates ray with time parameter", () => {
      const cam = new PhysicalCamera({
        imageWidth: 1920,
        imageHeight: 1080,
        shutterAngle: 180,
        eye: [0, 0, 0],
        target: [0, 0, -1]
      });
      const rng = { nextFloat: () => 0.5 };
      const ray = cam.generateRay(960, 540, 0.5, rng);
      
      assert.ok(ray.time !== undefined);
      assert.ok(typeof ray.time === "number");
    });
  });
});

describe("PhysicalCamera — Cinematic Factory", () => {
  it("creates cinematic camera with animated eye/target", () => {
    const cam = PhysicalCamera.cinematic(0, 300, 1280, 720);
    assert.ok(cam instanceof PhysicalCamera);
    assert.equal(cam.imageWidth, 1280);
    assert.equal(cam.imageHeight, 720);
    assert.ok(cam.focalPixels > 0);
  });

  it("produces different eye/target for different frames", () => {
    const cam0 = PhysicalCamera.cinematic(0, 300, 1280, 720);
    const cam150 = PhysicalCamera.cinematic(150, 300, 1280, 720);
    
    assert.ok(!V3.equals(cam0.eye, cam150.eye));
    assert.ok(!V3.equals(cam0.target, cam150.target));
  });

  it("returns to same position after full cycle", () => {
    const cam0 = PhysicalCamera.cinematic(0, 300, 1280, 720);
    const cam300 = PhysicalCamera.cinematic(300, 300, 1280, 720);
    
    // Should be same (full cycle)
    assert.ok(V3.equals(cam0.eye, cam300.eye));
    assert.ok(V3.equals(cam0.target, cam300.target));
  });
});

describe("PhysicalCamera — Depth of Field Helper", () => {
  it("computes circle of confusion correctly", () => {
    const cam = new PhysicalCamera({
      imageWidth: 1920,
      imageHeight: 1080,
      focalLength: 35,
      aperture: 2.8,
      focusDistance: 10,
      sensorSize: [36, 24]
    });
    
    const dof = cam.depthOfField(10); // At focus distance
    assert.equal(dof.cocRadius, 0);
    assert.equal(dof.focusDistance, 10);
    
    const dof2 = cam.depthOfField(5); // Closer
    assert.ok(dof2.cocRadius > 0);
    
    const dof3 = cam.depthOfField(20); // Farther
    assert.ok(dof3.cocRadius > 0);
    assert.ok(dof3.cocRadius > dof2.cocRadius); // Larger CoC when further from focus
  });
});

describe("PhysicalCamera — Determinism", () => {
  it("produces identical cameras with same config", () => {
    const config = {
      fov: 75,
      focalLength: 24,
      sensorSize: [36, 24],
      aperture: 2.0,
      focusDistance: 8,
      shutterAngle: 180,
      eye: [1, 2, 3],
      target: [4, 5, 6],
      up: [0, 1, 0],
      imageWidth: 1920,
      imageHeight: 1080
    };
    
    const cam1 = new PhysicalCamera(config);
    const cam2 = new PhysicalCamera(config);
    
    assert.deepEqual(cam1.eye, cam2.eye);
    assert.deepEqual(cam1.target, cam2.target);
    assert.deepEqual(cam1.viewMatrix.right, cam2.viewMatrix.right);
    assert.deepEqual(cam1.viewMatrix.up, cam2.viewMatrix.up);
    assert.deepEqual(cam1.viewMatrix.forward, cam2.viewMatrix.forward);
    assert.equal(cam1.focalPixels, cam2.focalPixels);
    assert.equal(cam1.apertureRadius, cam2.apertureRadius);
  });
});