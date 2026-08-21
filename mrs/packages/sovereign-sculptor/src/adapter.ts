import { assertFiniteDeep, canonicalJson, sha256Canonical } from "./canonical.js";
import {
  assertConstitutionalCharacterRecord,
  type ApprovedSkinChannel,
  createConstitutionalCharacterRecord,
  DIFFUSION_POLISH_ONLY_POLICY,
  type ConstitutionalCharacterRecord,
  type DiffusionPolishPolicy,
  type WholeBodySkinLayer,
} from "./constitutional.js";
import { exportSculptGlbBundle, type SculptGlbBundle } from "./glb.js";
import type {
  CharacterRigBinding,
  CharacterRigRegistry,
  CharacterRigSchema,
  Mat4Tuple,
  SculptDocument,
  Vec3,
} from "./types.js";

export type Quaternion = readonly [number, number, number, number];

export interface BonePoseTransform {
  readonly boneId: string;
  readonly translation: Vec3;
  readonly rotation: Quaternion;
  readonly scale: Vec3;
}

export interface BlendshapePoseWeight {
  readonly blendshapeId: string;
  readonly weight: number;
}

export interface CharacterPoseFrame {
  readonly schemaVersion: "sovereign-pose-frame/1.0";
  readonly frameId: string;
  readonly rigId: string;
  readonly rigVersion: CharacterRigSchema["schemaVersion"];
  readonly frameIndex: number;
  readonly timeSeconds: number;
  readonly boneTransforms: readonly BonePoseTransform[];
  readonly blendshapeWeights: readonly BlendshapePoseWeight[];
  readonly provenance: {
    readonly intentId: string | null;
    readonly operatorId: string;
    readonly sourcePoseId?: string | null;
  };
}

export interface MaterialTextureBinding {
  readonly skinLayerId: string;
  readonly skinLayerDigest: string;
  readonly materialRegions: WholeBodySkinLayer["materialRegions"];
  readonly channel: ApprovedSkinChannel;
  readonly assetRef: string;
  readonly textureSha256: string;
  readonly topologyDigest: string;
  readonly uvDigest: string;
  readonly surfaceOnly: true;
}

export interface Engine3DMandalaBinding extends CharacterRigBinding {
  readonly schemaVersion: "engine3d-mandala-character-binding/1.0";
  readonly status: "governed-fixture-binding";
  readonly bindingId: string;
  readonly constitutionalRecordDigest: string;
  readonly engine3dRecordRef: string;
  readonly mandalaRecordRef: string;
  readonly glbDigest: string;
  readonly topologyDigest: string;
  readonly vertexOrderDigest: string;
  readonly uvDigest: string;
  readonly armatureDigest: string;
  readonly blendshapeDigest: string;
  readonly materialTextureBindings: readonly MaterialTextureBinding[];
  readonly diffusionPolicy: DiffusionPolishPolicy;
  readonly geometryMutationAllowed: false;
}

export interface AddCharacterRigInput {
  readonly document: SculptDocument;
  readonly rig: CharacterRigSchema;
  readonly bundle?: SculptGlbBundle;
  readonly constitutionalRecord?: ConstitutionalCharacterRecord;
  readonly skinLayers?: readonly WholeBodySkinLayer[];
  readonly sourceSha256?: string;
}

export interface AppliedCharacterPose {
  readonly schemaVersion: "engine3d-mandala-pose-application/1.0";
  readonly status: "deterministic-fixture-pose-application";
  readonly characterId: string;
  readonly rigId: string;
  readonly bindingId: string;
  readonly constitutionalRecordDigest: string;
  readonly frame: CharacterPoseFrame;
  readonly frameDigest: string;
  readonly materialTextureBindings: readonly MaterialTextureBinding[];
  readonly geometryMutation: {
    readonly allowed: false;
    readonly operations: readonly [];
  };
  readonly diffusionPolicy: DiffusionPolishPolicy;
  readonly replayDigest: string;
}

export interface RegisteredCharacter {
  readonly document: SculptDocument;
  readonly rig: CharacterRigSchema;
  readonly bundle: SculptGlbBundle;
  readonly constitutionalRecord: ConstitutionalCharacterRecord;
  readonly binding: Engine3DMandalaBinding;
}

function materialTextureBindings(record: ConstitutionalCharacterRecord): MaterialTextureBinding[] {
  return record.skinLayers.flatMap((layer, layerIndex) =>
    Object.entries(layer.textureChannels).map(([channel, reference]) => ({
      skinLayerId: layer.id,
      skinLayerDigest: record.skinLayerDigests[layerIndex]!,
      materialRegions: layer.materialRegions,
      channel: channel as ApprovedSkinChannel,
      assetRef: reference.assetRef,
      textureSha256: reference.digest,
      topologyDigest: layer.topologyDigest,
      uvDigest: layer.uvDigest,
      surfaceOnly: true as const,
    })),
  );
}

export function createEngine3DMandalaBinding(
  record: ConstitutionalCharacterRecord,
): Engine3DMandalaBinding {
  assertConstitutionalCharacterRecord(record);
  const references = {
    characterId: record.characterId,
    rigId: record.rigId,
    sculptDocumentId: record.sculptDocumentId,
    constitutionalRecordDigest: record.recordDigest,
    glbDigest: record.digests.glbDigest,
    topologyDigest: record.digests.topologyDigest,
    vertexOrderDigest: record.digests.vertexOrderDigest,
    uvDigest: record.digests.uvDigest,
    armatureDigest: record.digests.armatureDigest,
    blendshapeDigest: record.digests.blendshapeDigest,
  };
  const bindingId = `binding:${sha256Canonical(references)}`;
  return {
    schemaVersion: "engine3d-mandala-character-binding/1.0",
    status: "governed-fixture-binding",
    bindingId,
    characterId: record.characterId,
    rigId: record.rigId,
    sculptDocumentId: record.sculptDocumentId,
    constitutionalRecordDigest: record.recordDigest,
    engine3dRecordRef: `sha256:${record.recordDigest}`,
    mandalaRecordRef: `sha256:${record.recordDigest}`,
    glbDigest: record.digests.glbDigest,
    topologyDigest: record.digests.topologyDigest,
    vertexOrderDigest: record.digests.vertexOrderDigest,
    uvDigest: record.digests.uvDigest,
    armatureDigest: record.digests.armatureDigest,
    blendshapeDigest: record.digests.blendshapeDigest,
    materialTextureBindings: materialTextureBindings(record),
    diffusionPolicy: DIFFUSION_POLISH_ONLY_POLICY,
    geometryMutationAllowed: false,
  };
}

function quaternionLength(rotation: Quaternion): number {
  return Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3]);
}

function validatePoseFrame(frame: CharacterPoseFrame, rig: CharacterRigSchema): void {
  assertFiniteDeep(frame);
  if (frame.schemaVersion !== "sovereign-pose-frame/1.0") throw new Error("unsupported pose frame schema");
  if (!frame.frameId) throw new Error("pose frame id is required");
  if (frame.rigId !== rig.id || frame.rigVersion !== rig.schemaVersion) throw new Error("pose frame rig reference mismatch");
  if (!Number.isInteger(frame.frameIndex) || frame.frameIndex < 0) throw new Error("pose frameIndex must be a non-negative integer");
  if (!Number.isFinite(frame.timeSeconds) || frame.timeSeconds < 0) throw new Error("pose timeSeconds must be non-negative and finite");
  if (!frame.provenance.operatorId) throw new Error("pose operatorId is required");

  const bones = new Map(rig.bones.map((bone) => [bone.id, bone]));
  const seenBones = new Set<string>();
  for (const transform of frame.boneTransforms) {
    const bone = bones.get(transform.boneId);
    if (!bone) throw new Error(`pose references unknown bone ${transform.boneId}`);
    if (seenBones.has(transform.boneId)) throw new Error(`pose repeats bone ${transform.boneId}`);
    seenBones.add(transform.boneId);
    if (transform.translation.length !== 3 || transform.rotation.length !== 4 || transform.scale.length !== 3) {
      throw new Error(`pose transform layout is invalid for ${transform.boneId}`);
    }
    const length = quaternionLength(transform.rotation);
    if (Math.abs(length - 1) > 1e-5) throw new Error(`pose quaternion is not normalized for ${transform.boneId}`);
    if (bone.constraint.translationLocked && transform.translation.some((value) => value !== 0)) {
      throw new Error(`translation is locked for ${transform.boneId}`);
    }
    if (bone.constraint.scaleLocked && transform.scale.some((value) => value !== 1)) {
      throw new Error(`scale is locked for ${transform.boneId}`);
    }
  }

  const blendshapes = new Map(rig.blendshapes.map((shape) => [shape.id, shape]));
  const seenBlendshapes = new Set<string>();
  for (const weighted of frame.blendshapeWeights) {
    const spec = blendshapes.get(weighted.blendshapeId);
    if (!spec) throw new Error(`pose references unknown blendshape ${weighted.blendshapeId}`);
    if (seenBlendshapes.has(weighted.blendshapeId)) throw new Error(`pose repeats blendshape ${weighted.blendshapeId}`);
    seenBlendshapes.add(weighted.blendshapeId);
    if (weighted.weight < spec.minWeight || weighted.weight > spec.maxWeight) {
      throw new Error(`blendshape weight is out of range for ${weighted.blendshapeId}`);
    }
  }
}

function poseReplayBody(
  binding: Engine3DMandalaBinding,
  frame: CharacterPoseFrame,
): Omit<AppliedCharacterPose, "replayDigest"> {
  const frameDigest = sha256Canonical(frame);
  return {
    schemaVersion: "engine3d-mandala-pose-application/1.0",
    status: "deterministic-fixture-pose-application",
    characterId: binding.characterId,
    rigId: binding.rigId,
    bindingId: binding.bindingId,
    constitutionalRecordDigest: binding.constitutionalRecordDigest,
    frame,
    frameDigest,
    materialTextureBindings: binding.materialTextureBindings,
    geometryMutation: { allowed: false, operations: [] },
    diffusionPolicy: DIFFUSION_POLISH_ONLY_POLICY,
  };
}

/** In-memory authority used by Engine3D/Mandala adapters; no global mutable singleton. */
export class InMemoryCharacterRigRegistry {
  readonly #characters = new Map<string, RegisteredCharacter>();
  readonly #rigs = new Map<string, CharacterRigSchema>();
  readonly #bindings = new Map<string, Engine3DMandalaBinding>();

  addCharacterRig(input: AddCharacterRigInput): Engine3DMandalaBinding {
    const bundle = input.bundle ?? exportSculptGlbBundle(input.document, input.rig);
    const constitutionalRecord = input.constitutionalRecord ?? createConstitutionalCharacterRecord({
      document: input.document,
      rig: input.rig,
      bundle,
      ...(input.skinLayers ? { skinLayers: input.skinLayers } : {}),
      ...(input.sourceSha256 ? { sourceSha256: input.sourceSha256 } : {}),
    });
    assertConstitutionalCharacterRecord(constitutionalRecord, {
      document: input.document,
      rig: input.rig,
      bundle,
      ...(input.sourceSha256 ? { sourceSha256: input.sourceSha256 } : {}),
    });
    if (input.skinLayers && canonicalJson(input.skinLayers) !== canonicalJson(constitutionalRecord.skinLayers)) {
      throw new Error("skin layers do not match the supplied constitutional record");
    }
    const binding = createEngine3DMandalaBinding(constitutionalRecord);
    const previous = this.#characters.get(binding.characterId);
    if (previous) {
      if (previous.constitutionalRecord.recordDigest !== constitutionalRecord.recordDigest) {
        throw new Error(`character ${binding.characterId} is already registered with different governed content`);
      }
      return previous.binding;
    }
    const previousRig = this.#rigs.get(input.rig.id);
    if (previousRig && canonicalJson(previousRig) !== canonicalJson(input.rig)) {
      throw new Error(`rig ${input.rig.id} is already registered with different content`);
    }
    const registered: RegisteredCharacter = {
      document: input.document,
      rig: input.rig,
      bundle,
      constitutionalRecord,
      binding,
    };
    this.#characters.set(binding.characterId, registered);
    this.#rigs.set(input.rig.id, input.rig);
    this.#bindings.set(binding.characterId, binding);
    return binding;
  }

  applyCharacterPose(characterId: string, frame: CharacterPoseFrame): AppliedCharacterPose {
    const registered = this.#characters.get(characterId);
    if (!registered) throw new Error(`character ${characterId} is not registered`);
    validatePoseFrame(frame, registered.rig);
    const body = poseReplayBody(registered.binding, frame);
    return { ...body, replayDigest: sha256Canonical(body) };
  }

  getCharacter(characterId: string): RegisteredCharacter | undefined {
    return this.#characters.get(characterId);
  }

  snapshot(): CharacterRigRegistry {
    return {
      rigs: [...this.#rigs.values()],
      bindings: [...this.#bindings.values()],
    };
  }

  clear(): void {
    this.#characters.clear();
    this.#rigs.clear();
    this.#bindings.clear();
  }
}

export function addCharacterRig(
  registry: InMemoryCharacterRigRegistry,
  input: AddCharacterRigInput,
): Engine3DMandalaBinding {
  return registry.addCharacterRig(input);
}

export function applyCharacterPose(
  registry: InMemoryCharacterRigRegistry,
  characterId: string,
  frame: CharacterPoseFrame,
): AppliedCharacterPose {
  return registry.applyCharacterPose(characterId, frame);
}

/** Utility for consumers that store absolute bone matrices instead of TRS pose frames. */
export function assertFiniteBoneMatrices(matrices: Readonly<Record<string, Mat4Tuple>>): void {
  assertFiniteDeep(matrices);
  for (const [boneId, matrix] of Object.entries(matrices)) {
    if (!boneId || matrix.length !== 16) throw new Error(`invalid bone matrix ${boneId}`);
  }
}
