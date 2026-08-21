/**
 * Character holography tests — muscle / face / body / rig-tensor / CIEMS / creatures.
 *   node --test character/holography/test/holography.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCharacterAsset } from "../../models/character.mjs";
import {
  buildSkinEGT,
  createMuscleRegion,
  buildMuscleRegionFromEgt,
  fireMuscle,
  fireNamedMuscle,
  assertMuscleFire,
  buildFacePatch,
  buildFaceEGT,
  applySmile,
  assertSmileDiffers,
  expressionFingerprint,
  buildBodyEGT,
  evolveBreathing,
  assertBreathingChanges,
  bodyFingerprint,
  buildRigNodes,
  computeEntanglementTensors,
  mat3IsPsdIsh,
  mat3SymmetryResidual,
  mat3Frobenius,
  assertActivationRisesWithK,
  activateMuscleFromCurvature,
  regionActivationFromCurvature,
  enrichWithRigCiems,
  aggregateGovernance,
  RIG_NODE_STATUS,
  RIG_CIEMS_STATUS,
  instantiateTemplate,
  synthesizeAnatomyFromBoundary,
  runConstitutionalLoop,
  assertBreatheUpdatesRho,
  createIndividual,
  getTaxonomyTree,
  spawn,
  spawnMythar,
  CREATURE_CONTRACT,
} from "../index.mjs";

describe("character holography", () => {
  const asset = buildCharacterAsset({ id: "test-holo" });

  it("builds deterministic skin EGT", () => {
    const a = buildSkinEGT(asset, { t: 0 });
    const b = buildSkinEGT(asset, { t: 0 });
    assert.equal(a.hash, b.hash);
    assert.ok(a.nodes.length > 50);
    assert.ok(a.edges.length > 50);
  });

  it("MuscleRegion fire increases ρ and |displacement|; anchors < belly", () => {
    const egt = buildSkinEGT(asset);
    const muscle = buildMuscleRegionFromEgt(egt, {
      id: 1,
      name: "torso_band",
      region: "torso",
      yMin: 1.32,
      yMax: 1.58,
      maxSeeds: 24,
    });
    assert.ok(muscle.vertexIds.length >= 2);
    assert.ok(muscle.anchorVertexIds.length >= 1);
    assert.equal(muscle.fiberDir.length, 3);

    const rest = fireMuscle(egt, muscle, 0.0);
    const fired = fireMuscle(egt, muscle, 1.0);
    const proof = assertMuscleFire(fired);
    assert.ok(proof.ok, JSON.stringify(proof));
    assert.ok(fired.metrics.meanRho > rest.metrics.meanRho - 1e-9);
    assert.ok(fired.metrics.maxDisplacement > 0);
    assert.ok(
      fired.metrics.meanAnchorDisplacement < fired.metrics.meanBellyDisplacement,
    );
    const fired2 = fireMuscle(egt, muscle, 1.0);
    assert.equal(fired.fingerprint, fired2.fingerprint);
  });

  it("fireNamedMuscle torso works", () => {
    const egt = buildSkinEGT(asset);
    const r = fireNamedMuscle(egt, "torso", 1);
    assert.ok(assertMuscleFire(r).ok);
  });

  it("createMuscleRegion API shape", () => {
    const m = createMuscleRegion({
      id: 7,
      vertexIds: [1, 2, 3],
      anchorVertexIds: [1],
      fiberDir: [0, 2, 0],
      name: "toy",
    });
    assert.equal(m.id, 7);
    assert.deepEqual(m.fiberDir, [0, 1, 0]);
  });

  it("smile fingerprint differs from neutral", () => {
    const patch = buildFacePatch();
    const neutral = buildFaceEGT(patch);
    const smile = applySmile(neutral);
    const proof = assertSmileDiffers(neutral, smile);
    assert.ok(proof.ok, JSON.stringify(proof));
    assert.notEqual(expressionFingerprint(neutral), smile.fingerprint);
    const smile2 = applySmile(buildFaceEGT(buildFacePatch()));
    assert.equal(smile.fingerprint, smile2.fingerprint);
  });

  it("full-body EGT builds; breathing changes torso ρ", () => {
    const body = buildBodyEGT(asset);
    assert.ok(body.nodes.length > 50);
    assert.ok(body.layers?.skin?.length === body.nodes.length);
    const fp1 = bodyFingerprint(body);
    const fp2 = bodyFingerprint(buildBodyEGT(asset));
    assert.equal(fp1, fp2);

    const seq = evolveBreathing(body, 6);
    const proof = assertBreathingChanges(seq);
    assert.ok(proof.ok, JSON.stringify(proof));
  });

  it("entanglement tensor E is symmetric PSD-ish; ‖E‖ rises with coupling", () => {
    const egt = buildSkinEGT(asset);
    const { E, norms } = computeEntanglementTensors(egt);
    assert.equal(E.length, egt.nodes.length);
    for (let i = 0; i < Math.min(32, E.length); i++) {
      assert.ok(mat3IsPsdIsh(E[i]), `node ${i} not PSD-ish`);
      assert.ok(mat3SymmetryResidual(E[i]) < 1e-12, `node ${i} asymmetric`);
      assert.equal(mat3Frobenius(E[i]), norms[i]);
    }
    const i0 = egt.edges[0].i;
    const before = norms[i0];
    for (const e of egt.edges) {
      if (e.i === i0 || e.j === i0) e.w_ij = Math.min(1, e.w_ij + 0.4);
    }
    const after = computeEntanglementTensors(egt).norms[i0];
    assert.ok(after > before, `‖E‖ should rise: ${before} → ${after}`);

    const nodes = buildRigNodes(egt);
    assert.ok(nodes[0].gov.intent >= 0 && nodes[0].gov.intent <= 1);
    assert.equal(egt.rigNodeStatus, RIG_NODE_STATUS);
  });

  it("muscle activation A rises with curvature K", () => {
    const egt = buildSkinEGT(asset);
    const muscle = buildMuscleRegionFromEgt(egt, {
      id: 1,
      name: "torso_band",
      region: "torso",
      yMin: 1.32,
      yMax: 1.58,
      maxSeeds: 20,
    });
    const proof = assertActivationRisesWithK(egt, muscle);
    assert.ok(proof.ok, JSON.stringify(proof));

    const low = regionActivationFromCurvature(egt, muscle, { t: 1, blend: 1 });
    const act = activateMuscleFromCurvature(egt, muscle, { t: 1 });
    assert.ok(act.regionActivation > 0);
    assert.ok(act.meanBellyRho > 0);

    const fired = fireMuscle(egt, muscle, 1, { useCurvatureActivation: true });
    assert.ok(fired.metrics.maxDisplacement > 0);
    assert.ok(fired.metrics.curvatureActivation?.meanK != null);
    assert.ok(fired.metrics.meanRho >= low.A * 0.05);
  });

  it("frame governance aggregates I,E,C,S appear in receipt", () => {
    const egt = buildSkinEGT(asset);
    const { receipt } = enrichWithRigCiems(egt);
    assert.equal(receipt.status, RIG_CIEMS_STATUS);
    const m = receipt.frameGovernance.means;
    assert.ok(m.count > 0);
    for (const key of ["intent", "evidence", "conformance", "stewardship"]) {
      assert.ok(m[key] >= 0 && m[key] <= 1, key);
    }
    assert.equal(receipt.frameGovernance.I, m.intent);
    assert.equal(receipt.tags.charterEnforced, false);
    assert.equal(receipt.tags.organismArena, "declared");

    const again = aggregateGovernance(egt);
    assert.equal(again.count, m.count);
    assert.ok(Math.abs(again.intent - m.intent) < 1e-12);
  });

  it("Mythar template instantiates deterministically; infers muscle + bone", () => {
    const a = instantiateTemplate("mythar-humanoid", {
      individualId: "t1",
      synthesizeBulk: true,
    });
    const b = instantiateTemplate("mythar-humanoid", {
      individualId: "t1",
      synthesizeBulk: true,
    });
    assert.equal(a.fingerprint, b.fingerprint);
    assert.ok(a.bulk.muscles.clusters.length >= 1, "need ≥1 muscle cluster");
    assert.ok(a.bulk.bones.paths.length >= 1, "need ≥1 bone path");

    const egt = buildSkinEGT(asset);
    const bulk = synthesizeAnatomyFromBoundary(egt);
    assert.ok(bulk.muscles.clusters.length >= 1 || bulk.bones.paths.length >= 1);
  });

  it("breathe primitive updates ρ; taxonomy skeleton has Mythar", () => {
    const inst = instantiateTemplate("mythar-humanoid", {
      individualId: "breath-t",
      synthesizeBulk: false,
    });
    const loop = runConstitutionalLoop(inst.egt, "breathe", 6, {
      flow: { ...inst.behavioralFlows.breathe, centralOnly: true },
    });
    const proof = assertBreatheUpdatesRho(loop);
    assert.ok(proof.ok, JSON.stringify(proof));
    assert.ok(loop.traces[0].stages.intent);
    assert.ok(loop.traces[0].stages.stewardship);

    const tree = getTaxonomyTree();
    assert.equal(tree.genus.id, "bipedal");
    assert.ok(tree.species.some((s) => s.id === "mythar-humanoid"));
    const ind = createIndividual("mythar-humanoid", { id: "x" });
    assert.equal(ind.speciesId, "mythar-humanoid");
  });

  it("walk primitive is partial (not stub) and changes ρ", () => {
    const inst = instantiateTemplate("mythar-humanoid", {
      individualId: "walk-t",
      synthesizeBulk: false,
    });
    const loop = runConstitutionalLoop(inst.egt, "walk", 4, { amp: 0.12 });
    assert.equal(loop.primitive, "walk");
    assert.ok(!loop.traces[0].stages.stub);
    let d = 0;
    const a = loop.frames[0];
    const b = loop.frames[loop.frames.length - 1];
    for (let i = 0; i < a.rho.length; i++) d += Math.abs(a.rho[i] - b.rho[i]);
    assert.ok(d > 1e-6);
  });

  it("spawn(signature) is mesh-free and deterministic", () => {
    const a = spawn("mythar-humanoid", { individualId: "spawn-t", synthesizeBulk: true });
    const b = spawnMythar({ individualId: "spawn-t", synthesizeBulk: true });
    assert.equal(a.meshLoad, false);
    assert.equal(a.fingerprint, b.fingerprint);
    assert.equal(a.taxonomy.genus, "bipedal");
    assert.equal(a.taxonomy.species, "mythar-humanoid");
    assert.ok(a.bulk.muscles.clusters.length >= 1);
    assert.ok(a.bulk.bones.paths.length >= 1);
    assert.equal(CREATURE_CONTRACT.pillars.length, 3);
    assert.equal(a.livingConstitutionalEcosystem, "declared");
  });
});
