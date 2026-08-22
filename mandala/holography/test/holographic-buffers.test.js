/**
 * Holographic appearance buffers — streaming cache, shaders, uniforms.
 *   node --test mandala/holography/test/holographic-buffers.test.js
 *   node --test mandala/engine/test/holo-chamber.test.js
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEntanglementRenderer,
  HOLOGRAPHIC_ATTRIBUTE_NAMES,
  HOLOGRAPHIC_SHADER_SOT,
  HOLOGRAPHIC_SHADER_STATUS,
  HOLOGRAPHIC_BUFFER_STATUS,
  HOLOGRAPHIC_STREAMING_STATUS,
  HOLOGRAPHIC_GPU_RASTER_STATUS,
  MYTHAR_BOUNDARY_COLOR,
  EFR_MODES,
} from "../index.mjs";
import { spawnMythar, CharacterHolographicRig } from "../../../character/holography/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "../../..");

describe("holographic buffers + shaders", () => {
  it("shader files exist at SoT and drop-in paths", () => {
    assert.equal(HOLOGRAPHIC_SHADER_STATUS, "partial");
    assert.equal(HOLOGRAPHIC_BUFFER_STATUS, "partial");
    assert.equal(HOLOGRAPHIC_STREAMING_STATUS, "partial");
    assert.equal(HOLOGRAPHIC_GPU_RASTER_STATUS, "declared");
    assert.ok(existsSync(HOLOGRAPHIC_SHADER_SOT.vert));
    assert.ok(existsSync(HOLOGRAPHIC_SHADER_SOT.frag));
    assert.ok(existsSync(join(REPO, "src/mandala/shaders/holographic.vert")));
    assert.ok(existsSync(join(REPO, "src/mandala/shaders/holographic.frag")));
    const vert = readFileSync(HOLOGRAPHIC_SHADER_SOT.vert, "utf8");
    const frag = readFileSync(HOLOGRAPHIC_SHADER_SOT.frag, "utf8");
    assert.match(vert, /attribute float entanglementDensity/);
    assert.match(vert, /attribute vec3 entanglementDirection/);
    assert.match(vert, /attribute float curvature/);
    assert.match(vert, /attribute float entanglementWeight/);
    assert.match(vert, /attribute vec4 governance/);
    assert.match(vert, /attribute vec3 baseNormal/);
    assert.match(frag, /uniform vec3 uBoundaryColor/);
    assert.match(frag, /D_GGX/);
    const dropVert = readFileSync(join(REPO, "src/mandala/shaders/holographic.vert"), "utf8");
    assert.match(dropVert, /mandala\/holography\/shaders/);
  });

  it("empty nodes return null", () => {
    const renderer = createEntanglementRenderer({ mode: "composite" });
    assert.equal(renderer.buildHolographicBuffers({ nodes: [] }), null);
  });

  it("over-max node count returns null", () => {
    const renderer = createEntanglementRenderer({ mode: "composite", maxNodes: 2 });
    const out = renderer.buildHolographicBuffers({
      nodes: [{}, {}, {}],
    });
    assert.equal(out, null);
  });

  it("geometry and cache arrays are allocated once (streaming, not realloc)", () => {
    const spawned = spawnMythar({ individualId: "holo-stream-0", synthesizeBulk: true });
    const rig = new CharacterHolographicRig({ creature: "Mythar", governance: 0.868 });
    rig.update(spawned.egt, spawned.bulk, { conformance: 0.868, stewardship: 1 });
    const renderer = createEntanglementRenderer({ mode: "composite", width: 64, height: 64 });
    const a = renderer.buildHolographicBuffers(rig);
    const geo = renderer.geometry;
    const cachePos = renderer._bufferCache.pos;
    assert.ok(a);
    assert.equal(a.count, rig.nodes.length);
    assert.ok(a.h_ij);
    rig.update(spawned.egt, spawned.bulk, { conformance: 0.868, stewardship: 1 });
    const b = renderer.buildHolographicBuffers(rig);
    assert.equal(renderer.geometry, geo);
    assert.equal(renderer._bufferCache.pos, cachePos);
    assert.equal(b.count, a.count);
  });

  it("packed path copies into cache (.set); cache identity stays; needsUpdate + drawRange", () => {
    const spawned = spawnMythar({ individualId: "holo-buf-0", synthesizeBulk: true });
    const rig = new CharacterHolographicRig({ creature: "Mythar", governance: 0.868 });
    rig.update(spawned.egt, spawned.bulk, { conformance: 0.868, stewardship: 1 });
    const n = spawned.egt.nodes.length;
    assert.ok(n > 10);
    assert.equal(rig.buffers.entanglementDensity.length, n);
    assert.equal(rig.nodes[0].entanglementDensity, rig.buffers.entanglementDensity[0]);
    assert.ok(typeof globalThis.THREE === "undefined");

    const renderer = createEntanglementRenderer({ mode: "composite", width: 64, height: 64 });
    const ret = renderer.buildHolographicBuffers(rig);
    assert.notEqual(ret, rig.buffers);
    assert.equal(ret.count, n);
    assert.ok(renderer.holoBuffers.h_ij);
    assert.equal(renderer.holoBuffers.entanglementDensity.length, n);
    assert.equal(renderer.holoBuffers.curvature.length, n);
    assert.equal(renderer.holoBuffers.entanglementWeight.length, n);
    assert.equal(renderer.holoBuffers.position.length, n * 3);
    assert.equal(renderer.holoBuffers.entanglementDirection.length, n * 3);
    assert.equal(renderer.holoBuffers.baseNormal.length, n * 3);
    assert.equal(renderer.holoBuffers.governance.length, n * 4);
    assert.notEqual(renderer._bufferCache.rho, rig.buffers.entanglementDensity);
    assert.equal(renderer._bufferCache.rho[0], rig.buffers.entanglementDensity[0]);
    assert.equal(renderer.holoBuffers.entanglementDensity.buffer, renderer._bufferCache.rho.buffer);

    for (const name of HOLOGRAPHIC_ATTRIBUTE_NAMES) {
      const attr = renderer.geometry.attributes[name];
      assert.ok(attr, `missing attribute ${name}`);
      assert.equal(attr.needsUpdate, true);
      assert.ok(attr.array.length > n || attr.array.length === n * 3 || attr.array.length === n * 4 || attr.array.length >= n);
    }
    assert.equal(renderer.geometry.drawRange.count, n);
    assert.equal(renderer.uniforms.uAnisotropy.value, 1.2);
    assert.equal(renderer.uniforms.uMuscleGain.value, 0.3);
    assert.equal(renderer.uniforms.uBoneThreshold.value, 0.8);
    assert.deepEqual(renderer.uniforms.uBoundaryColor.value, [...MYTHAR_BOUNDARY_COLOR]);
    assert.equal(renderer.uniforms.uInducedMetric.value.length, 9);
    assert.equal(typeof renderer.uniforms.uInducedMetric.value.fromArray, "function");
    assert.equal(renderer.gpuRasterStatus, "declared");
    assert.equal(renderer.streamingStatus, "partial");

    const img = renderer.renderBoundary(spawned.egt, { h_ij: spawned.egt.h_ij }, EFR_MODES.COMPOSITE);
    assert.equal(img.usedHoloBuffers, true);
    assert.equal(img.rgb.length, 64 * 64 * 3);
    let lit = 0;
    for (let i = 0; i < img.rgb.length; i++) lit += img.rgb[i];
    assert.ok(lit > 0, "COMPOSITE from holographic buffers should not be empty");
  });

  it("fallback aliases fill when packed buffers are missing", () => {
    const renderer = createEntanglementRenderer({ mode: "composite" });
    const out = renderer.buildHolographicBuffers({
      nodes: [
        {
          rho: 0.42,
          K: 0.9,
          w_sum: 0.3,
          d_ij: [0, 0, 1],
          h_normal: [0, 1, 0],
          x_mu: { x: 1, y: 2, z: 3 },
          governance: { intent: 0.5, evidence: 0.6, conformance: 0.7, stewardship: 0.8 },
        },
      ],
    });
    assert.equal(out.count, 1);
    assert.equal(renderer.holoBuffers.entanglementDensity[0], Math.fround(0.42));
    assert.equal(renderer.holoBuffers.curvature[0], Math.fround(0.9));
    assert.equal(renderer.holoBuffers.entanglementWeight[0], Math.fround(0.3));
    assert.equal(renderer.holoBuffers.position[0], 1);
    assert.equal(renderer.holoBuffers.position[1], 2);
    assert.equal(renderer.holoBuffers.position[2], 3);
    assert.ok(renderer.holoBuffers.h_ij);
  });

  it("uTime updates from bulk.t", () => {
    const spawned = spawnMythar({ individualId: "holo-time-0", synthesizeBulk: true });
    const rig = new CharacterHolographicRig();
    rig.update(spawned.egt, spawned.bulk);
    rig.bulk = { t: 7 };
    const renderer = createEntanglementRenderer({ mode: "composite" });
    renderer.buildHolographicBuffers(rig);
    assert.equal(renderer.material.uniforms.uTime.value, 7);
    renderer.material.uniforms.uTime.value = 11;
    assert.equal(renderer.uniforms.uTime.value, 11);
  });

  it("toThreeGeometry throws without THREE (Node-safe)", () => {
    const spawned = spawnMythar({ individualId: "holo-buf-1", synthesizeBulk: true });
    const rig = new CharacterHolographicRig();
    rig.update(spawned.egt, spawned.bulk);
    assert.throws(() => rig.toThreeGeometry(null), /Three\.js/);
  });
});
