import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialCertifiedState, freezeCertifiedSnapshot } from "../../proto/certified-state.mjs";
import { createImage, projectFrozen } from "../../proto/mandala-project.mjs";
import { BRDF_LAMBERTIAN_4D, evaluateLayeredBsdf, temporalAlbedo, etaAt } from "../materials/index.mjs";
import { projectFrozenLayered, projectCertifiedLayered, accumulateObserverSamples } from "../project.mjs";

describe("material system v0.3", () => {
  it("layered BSDF reuses 3ρ/(4π) and two layers", () => {
    const r = evaluateLayeredBsdf({
      substrateAlbedo: [0.8, 0.7, 0.5],
      defectAlbedo: [1, 0.2, 0.1],
      mix: 0.5,
      cosTheta: 1,
    });
    assert.equal(r.layers.length, 2);
    assert.ok(Math.abs(BRDF_LAMBERTIAN_4D - 3 / (4 * Math.PI)) < 1e-12);
    assert.ok(Math.abs(r.brdf[0] - r.rho[0] * BRDF_LAMBERTIAN_4D) < 1e-12);
    assert.ok(r.pdf > 0);
  });

  it("temporal albedo and substrate η are deterministic", () => {
    const a = temporalAlbedo([0.82, 0.71, 0.55], 3, 0.2);
    const b = temporalAlbedo([0.82, 0.71, 0.55], 3, 0.2);
    assert.deepEqual(a, b);
    assert.equal(etaAt(1, 2, 3, 0, 7), etaAt(1, 2, 3, 0, 7));
    assert.notEqual(etaAt(1, 2, 3, 0, 7), etaAt(1, 2, 3, 1, 7));
  });

  it("layered projection differs from flat albedo and does not mutate certified hash", () => {
    const state = createInitialCertifiedState({ seed: 7 });
    const hash = state.hash;
    const flat = createImage(16, 16);
    const layered = createImage(16, 16);
    const snap = freezeCertifiedSnapshot(state);
    projectFrozen(snap, flat);
    projectFrozenLayered(snap, layered);
    let diff = 0;
    for (let i = 0; i < flat.rgb.length; i++) diff += Math.abs(flat.rgb[i] - layered.rgb[i]);
    assert.ok(diff > 0, "layered look must change vs flat albedo");
    projectCertifiedLayered(state, createImage(8, 8), { accumulate: true });
    assert.equal(state.hash, hash);
    const acc = createImage(8, 8);
    accumulateObserverSamples(freezeCertifiedSnapshot(state), acc);
    assert.equal(state.hash, hash);
    assert.equal(acc.provenance.mutatesCertified, false);
  });
});
