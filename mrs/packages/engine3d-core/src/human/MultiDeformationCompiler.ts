import { hashCanonical } from "../scene/hash.js";
import { deformHumanRig } from "./HumanRigDeformer.js";
import type { DeformedHumanRigFrame, DeformedMesh, HumanRig } from "./HumanRigTypes.js";
import { MuscleDeformer } from "./MuscleDeformer.js";

export interface MultiDeformationState extends DeformedHumanRigFrame {
  readonly muscleActivation: Readonly<Record<string, number>>;
}

function applyMusclesToMesh(mesh: DeformedMesh, rig: HumanRig, activation: Readonly<Record<string, number>>): DeformedMesh & { muscleHash?: string; softTissueHash?: string } {
  if (!rig.muscleRig) return mesh;
  const result = new MuscleDeformer(rig.muscleRig).apply(mesh.vertices, activation);
  return {
    ...mesh,
    vertices: result.vertices,
    muscleHash: result.muscleHash,
    softTissueHash: result.softTissueHash,
  };
}

export class MultiDeformationCompiler {
  constructor(private readonly rig: HumanRig) {}

  compile(time = 0, options: { readonly poseId?: string; readonly muscleActivation?: Readonly<Record<string, number>> } = {}): MultiDeformationState {
    const base = deformHumanRig(this.rig, options.poseId, time);
    const muscleActivation = options.muscleActivation ?? {};
    const meshes = base.meshes.map((mesh) => applyMusclesToMesh(mesh, this.rig, muscleActivation));
    const muscleHashes = meshes.flatMap((mesh) => "muscleHash" in mesh && mesh.muscleHash ? [mesh.muscleHash] : []);
    const softTissueHashes = meshes.flatMap((mesh) => "softTissueHash" in mesh && mesh.softTissueHash ? [mesh.softTissueHash] : []);
    const muscleHash = this.rig.muscleRig
      ? hashCanonical({
          activation: muscleActivation,
          muscles: this.rig.muscleRig.muscles,
          perMesh: muscleHashes,
        })
      : undefined;
    const softTissueHash = this.rig.muscleRig
      ? hashCanonical({
          regions: this.rig.muscleRig.regions,
          touched: softTissueHashes,
        })
      : undefined;
    return {
      ...base,
      meshes,
      muscleActivation,
      muscleHash,
      softTissueHash,
      meshDeformationHash: hashCanonical(meshes.map((mesh) => ({
        id: mesh.id,
        materialId: mesh.materialId,
        appliedMorphs: mesh.appliedMorphs ?? {},
        vertices: Array.from(mesh.vertices),
        normals: mesh.normals ? Array.from(mesh.normals) : [],
        indices: Array.from(mesh.indices),
      }))),
    };
  }
}
