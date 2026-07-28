import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OrientedCapsule } from "../../src/render/rt4d/geometry/hypersurface.js";
import { Hypersphere } from "../../src/render/rt4d/geometry/hypersurface.js";
import {
  Dielectric4D,
  fresnelDielectric,
  dielectricShadowTransmittance,
} from "../../src/render/rt4d/material/dielectric4d.js";
import { MaterialSystem } from "../../src/render/rt4d/material/MaterialSystem.js";
import { Scene4D } from "../../src/render/rt4d/scene/Scene4D.js";
import { vec4 } from "../../src/render/rt4d/math/vec4.js";

describe("OrientedCapsule", () => {
  it("hits a horizontal tube along +z", () => {
    const cap = new OrientedCapsule(vec4(0, 0, 0, 0), vec4(0, 0, 4, 0), 0.5);
    const hit = cap.intersect({
      origin: vec4(0, 0, -1, 0),
      direction: vec4(0, 0, 1, 0),
      tMin: 0.001,
      tMax: 100,
    });
    assert.ok(hit, "expected capsule hit");
    assert.ok(hit.t > 0.4 && hit.t < 1.6, `t=${hit.t}`);
  });

  it("misses when ray is outside the tube radius", () => {
    const cap = new OrientedCapsule(vec4(0, 0, 0, 0), vec4(0, 0, 4, 0), 0.25);
    const hit = cap.intersect({
      origin: vec4(2, 0, -1, 0),
      direction: vec4(0, 0, 1, 0),
      tMin: 0.001,
      tMax: 100,
    });
    assert.equal(hit, null);
  });

  it("exposes finite BVH bounds covering endpoints", () => {
    const cap = new OrientedCapsule(vec4(-1, 0.5, 0, 0), vec4(1, 0.5, 0, 0), 0.2);
    const b = cap.getBounds();
    assert.ok(b.min.x <= -1.2 && b.max.x >= 1.2);
    assert.ok(b.min.y <= 0.3 && b.max.y >= 0.7);
  });
});

describe("Dielectric4D / glass materials", () => {
  it("samples reflection or transmission with positive pdf", () => {
    const d = new Dielectric4D(vec4(0.15, 0.45, 1, 1), 1.52, 0.03);
    const wi = normalizeSafe(vec4(0, 0.7, 0.7, 0));
    const n = vec4(0, 0, 1, 0);
    const sample = d.sample(wi, n, 0.1, 0.2, 0.3);
    assert.ok(sample.pdf > 0);
    assert.ok(length3(sample.value) > 0);
  });

  it("MaterialSystem registers dielectric with mild emission (not isLight)", () => {
    const mats = new MaterialSystem();
    const mat = mats.createMaterial("beam", "dielectric", {
      albedo: vec4(0.15, 0.45, 1, 1),
      ior: 1.52,
      emission: vec4(0.5, 1, 1.4, 0),
    });
    assert.equal(mat.isLight, false);
    assert.equal(mat.isTransmissive, true);
    assert.ok(mat.emission.x > 0);
    assert.equal(mat.type, "dielectric");
  });

  it("Fresnel rim is stronger at grazing than face-on", () => {
    const face = fresnelDielectric(1, 1.52);
    const graz = fresnelDielectric(0.05, 1.52);
    assert.ok(graz > face);
    assert.ok(graz > 0.85, `grazing F=${graz}`);
    // Rim boost must exceed plain Schlick at grazing.
    const r0 = ((1 - 1.52) / (1 + 1.52)) ** 2;
    const plainGraz = r0 + (1 - r0) * (1 - 0.05) ** 5;
    assert.ok(graz > plainGraz);
  });

  it("NEE shadow rays transmit through glass tubes (no hard occlude)", () => {
    const scene = new Scene4D();
    scene.materials.createMaterial("glass", "dielectric", {
      albedo: vec4(0.15, 0.45, 1, 1),
      ior: 1.52,
    });
    scene.materials.createMaterial("core", "light", {
      emission: vec4(10, 10, 10, 0),
      albedo: vec4(1, 1, 1, 1),
    });
    // Tube between shading point (origin) and light at +z.
    scene.addPrimitive(
      new OrientedCapsule(vec4(0, 0, 0.5, 0), vec4(0, 0, 2.5, 0), 0.35),
      "glass",
    );
    scene.addLight(new Hypersphere(vec4(0, 0, 4, 0), 0.4), "core");
    scene.build();

    const shadow = dielectricShadowTransmittance(
      scene,
      vec4(0, 0, -1, 0),
      vec4(0, 0, 1, 0),
      5.5,
    );
    assert.equal(shadow.reachedLight, true);
    assert.ok(
      shadow.transmittance > 0.3 && shadow.transmittance <= 1,
      `T=${shadow.transmittance}`,
    );
  });

  it("opaque blockers still hard-occlude NEE", () => {
    const scene = new Scene4D();
    scene.materials.createMaterial("matte", "lambertian", {
      albedo: vec4(0.5, 0.5, 0.5, 1),
    });
    scene.materials.createMaterial("core", "light", {
      emission: vec4(10, 10, 10, 0),
    });
    scene.addPrimitive(new Hypersphere(vec4(0, 0, 1, 0), 0.4), "matte");
    scene.addLight(new Hypersphere(vec4(0, 0, 4, 0), 0.4), "core");
    scene.build();

    const shadow = dielectricShadowTransmittance(
      scene,
      vec4(0, 0, -1, 0),
      vec4(0, 0, 1, 0),
      5.5,
    );
    assert.equal(shadow.reachedLight, false);
    assert.equal(shadow.transmittance, 0);
  });
});

function normalizeSafe(v) {
  const L = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z + v.w * v.w) || 1;
  return vec4(v.x / L, v.y / L, v.z / L, v.w / L);
}

function length3(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}
