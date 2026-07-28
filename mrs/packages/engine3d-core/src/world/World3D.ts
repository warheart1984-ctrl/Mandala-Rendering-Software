import type { Body } from "./Body.js";
import type { WorldMesh } from "./WorldMesh.js";
import type { UniversalMaterial } from "./WorldObject.js";
import type { FacePoseFrame, FaceRigConfig } from "../face/index.js";
import type { DeformedHumanRigFrame } from "../human/HumanRigTypes.js";
import { bindDefaultFaceMaterials } from "../materials/FaceMaterials.js";
import { bindDefaultLatticeMaterials } from "../materials/LatticeMaterials.js";
import { World3DFace } from "./World3DFace.js";

export interface World3D {
  readonly bodies: Body[];
  readonly mesh: WorldMesh;
  /** Named material table (face_skin / eye / mouth when face rig bound). */
  readonly materials: Record<string, UniversalMaterial>;
  /** True after `addLatticeMaterials()` binds glass/chrome/core defaults. */
  readonly latticeMaterialsBound?: boolean;
  face?: World3DFace;
  addBody(body: Body): void;
  removeBody(id: string): void;
  addFaceRig(config: FaceRigConfig): World3DFace;
  applyFacePose(pose: FacePoseFrame): DeformedHumanRigFrame | undefined;
  /** Bind DEFAULT_LATTICE_MATERIALS into `materials`. */
  addLatticeMaterials?(): void;
}

export class DefaultWorld3D implements World3D {
  readonly bodies: Body[] = [];
  readonly materials: Record<string, UniversalMaterial> = {};
  latticeMaterialsBound = false;
  face?: World3DFace;

  constructor(public readonly mesh: WorldMesh) {}

  addBody(body: Body): void {
    if (this.bodies.some((b) => b.id === body.id)) {
      throw new Error(`World3D already has body id ${body.id}`);
    }
    this.bodies.push(body);
  }

  removeBody(id: string): void {
    const idx = this.bodies.findIndex((b) => b.id === id);
    if (idx >= 0) {
      this.bodies.splice(idx, 1);
    }
  }

  addFaceRig(config: FaceRigConfig): World3DFace {
    this.face = new World3DFace(config);
    bindDefaultFaceMaterials(this.materials);
    return this.face;
  }

  addLatticeMaterials(): void {
    bindDefaultLatticeMaterials(this.materials);
    this.latticeMaterialsBound = true;
  }

  applyFacePose(pose: FacePoseFrame): DeformedHumanRigFrame | undefined {
    return this.face?.applyPose(pose);
  }
}
