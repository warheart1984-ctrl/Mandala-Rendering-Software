import type { HumanRig, HumanRigValidationIssue, HumanRigValidationResult } from "./HumanRigTypes.js";

function issue(code: string, message: string, path?: string): HumanRigValidationIssue {
  return { code, message, path };
}

export function validateHumanRig(rig: HumanRig): HumanRigValidationResult {
  const issues: HumanRigValidationIssue[] = [];
  if (!rig.id) issues.push(issue("missing-rig-id", "HumanRig requires a stable id.", "id"));
  if (!rig.skeleton.bones.length) issues.push(issue("missing-bones", "HumanRig requires at least one bone.", "skeleton.bones"));
  if (!rig.skeleton.rootBoneId) issues.push(issue("missing-root-bone", "HumanRig requires rootBoneId.", "skeleton.rootBoneId"));

  const boneIds = new Set<string>();
  for (const [i, bone] of rig.skeleton.bones.entries()) {
    if (!bone.id) issues.push(issue("missing-bone-id", "Bone requires id.", `skeleton.bones.${i}`));
    if (boneIds.has(bone.id)) issues.push(issue("duplicate-bone-id", `Duplicate bone id ${bone.id}.`, `skeleton.bones.${i}`));
    boneIds.add(bone.id);
    if (bone.localTransform.length !== 16) issues.push(issue("invalid-local-transform", "Bone localTransform must contain 16 numbers.", `skeleton.bones.${i}.localTransform`));
    if (bone.inverseBind.length !== 16) issues.push(issue("invalid-inverse-bind", "Bone inverseBind must contain 16 numbers.", `skeleton.bones.${i}.inverseBind`));
  }

  if (!boneIds.has(rig.skeleton.rootBoneId)) {
    issues.push(issue("unknown-root-bone", `rootBoneId ${rig.skeleton.rootBoneId} is not in bones.`, "skeleton.rootBoneId"));
  }

  if (!rig.meshes.all.length) issues.push(issue("missing-meshes", "HumanRig requires at least one tagged mesh.", "meshes"));
  for (const [i, mesh] of rig.meshes.all.entries()) {
    const vertexCount = mesh.vertices.length / 3;
    if (!Number.isInteger(vertexCount) || vertexCount <= 0) issues.push(issue("invalid-vertices", "Mesh vertices must be xyz triples.", `meshes.all.${i}.vertices`));
    if (mesh.skinWeights.length !== vertexCount * 4) issues.push(issue("invalid-skin-weights", "Mesh WEIGHTS_0 must contain four weights per vertex.", `meshes.all.${i}.skinWeights`));
    if (mesh.skinIndices.length !== vertexCount * 4) issues.push(issue("invalid-skin-indices", "Mesh JOINTS_0 must contain four joint indices per vertex.", `meshes.all.${i}.skinIndices`));
    if (!mesh.materialId) issues.push(issue("missing-material", "Mesh requires materialId.", `meshes.all.${i}.materialId`));
  }

  if (rig.capabilities.muscleRig || rig.muscleRig) {
    if (!rig.capabilities.muscleRig) {
      issues.push(issue("missing-muscle-capability", "HumanRig.muscleRig requires capabilities.muscleRig === true.", "capabilities.muscleRig"));
    }
    if (!rig.muscleRig) {
      issues.push(issue("missing-muscle-rig", "capabilities.muscleRig requires HumanRig.muscleRig.", "muscleRig"));
    } else {
      if (!rig.muscleRig.muscles.length) issues.push(issue("missing-muscles", "MuscleRig requires at least one muscle.", "muscleRig.muscles"));
      if (!rig.muscleRig.regions.length) issues.push(issue("missing-soft-tissue-regions", "MuscleRig requires at least one soft-tissue region.", "muscleRig.regions"));
      const regionIds = new Set<string>();
      const facialCurveIds = new Set((rig.facialRig?.curves ?? []).map((curve) => curve.id));
      for (const [i, region] of rig.muscleRig.regions.entries()) {
        if (regionIds.has(region.id)) issues.push(issue("duplicate-soft-tissue-region", `Duplicate soft-tissue region id ${region.id}.`, `muscleRig.regions.${i}.id`));
        regionIds.add(region.id);
      }
      const meshVertexCounts = rig.meshes.all.map((mesh) => mesh.vertices.length / 3);
      for (const [i, muscle] of rig.muscleRig.muscles.entries()) {
        if (!boneIds.has(muscle.originBoneId)) issues.push(issue("unknown-muscle-origin-bone", `Muscle ${muscle.id} references unknown originBoneId ${muscle.originBoneId}.`, `muscleRig.muscles.${i}.originBoneId`));
        if (!boneIds.has(muscle.insertionBoneId)) issues.push(issue("unknown-muscle-insertion-bone", `Muscle ${muscle.id} references unknown insertionBoneId ${muscle.insertionBoneId}.`, `muscleRig.muscles.${i}.insertionBoneId`));
        if (!facialCurveIds.has(muscle.activationCurveId)) issues.push(issue("unknown-muscle-activation-curve", `Muscle ${muscle.id} references unknown activationCurveId ${muscle.activationCurveId}.`, `muscleRig.muscles.${i}.activationCurveId`));
        if (!regionIds.has(muscle.influenceRegionId)) issues.push(issue("unknown-muscle-region", `Muscle ${muscle.id} references unknown influenceRegionId ${muscle.influenceRegionId}.`, `muscleRig.muscles.${i}.influenceRegionId`));
        if (muscle.direction?.some((value) => !Number.isFinite(value))) issues.push(issue("invalid-muscle-direction", "Muscle direction values must be finite.", `muscleRig.muscles.${i}.direction`));
      }
      for (const [i, region] of rig.muscleRig.regions.entries()) {
        if (!Number.isFinite(region.stiffness)) issues.push(issue("invalid-region-stiffness", "Soft-tissue stiffness must be finite.", `muscleRig.regions.${i}.stiffness`));
        if (!Number.isFinite(region.damping)) issues.push(issue("invalid-region-damping", "Soft-tissue damping must be finite.", `muscleRig.regions.${i}.damping`));
        const maxVertexCount = Math.max(0, ...meshVertexCounts);
        for (const vertexIndex of region.vertexIndices) {
          if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= maxVertexCount) {
            issues.push(issue("invalid-region-vertex-index", `Soft-tissue region ${region.id} references invalid vertex ${vertexIndex}.`, `muscleRig.regions.${i}.vertexIndices`));
          }
        }
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
