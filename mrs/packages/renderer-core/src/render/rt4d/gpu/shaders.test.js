import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RAYGEN_WGSL, SHADE_WGSL, ACCUM_WGSL } from "./shaders.js";

describe("shaders", () => {
  it("RAYGEN_WGSL is a non-empty string containing compute entry", () => {
    assert.ok(typeof RAYGEN_WGSL === "string");
    assert.ok(RAYGEN_WGSL.length > 500);
    assert.ok(RAYGEN_WGSL.includes("@compute"));
    assert.ok(RAYGEN_WGSL.includes("rayOrigins[idx]"));
  });

  it("SHADE_WGSL is a non-empty string containing compute entry", () => {
    assert.ok(typeof SHADE_WGSL === "string");
    assert.ok(SHADE_WGSL.length > 1000);
    assert.ok(SHADE_WGSL.includes("@compute"));
    assert.ok(SHADE_WGSL.includes("cosineWeightedSampleS3"));
    assert.ok(SHADE_WGSL.includes("3.0 * mat.albedo / (4.0 * PI)"));
  });

  it("ACCUM_WGSL is a non-empty string containing compute entry", () => {
    assert.ok(typeof ACCUM_WGSL === "string");
    assert.ok(ACCUM_WGSL.length > 300);
    assert.ok(ACCUM_WGSL.includes("@compute"));
    assert.ok(ACCUM_WGSL.includes("outputBuffer[idx]"));
  });

  it("shaders contain consistent struct definitions", () => {
    // FrameParams struct appears in both SHADE and ACCUM
    assert.ok(SHADE_WGSL.includes("struct FrameParams"));
    assert.ok(ACCUM_WGSL.includes("struct FrameParams"));
    assert.ok(RAYGEN_WGSL.includes("struct Camera"));
  });

  it("shaders reference compatible WGSL features", () => {
    assert.ok(RAYGEN_WGSL.includes("var<storage, read_write>"));
    assert.ok(SHADE_WGSL.includes("var<storage, read>"));
    assert.ok(ACCUM_WGSL.includes("var<storage, read_write>"));
  });
});
