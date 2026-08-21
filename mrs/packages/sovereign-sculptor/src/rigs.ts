import { assertFiniteDeep, sha256Canonical } from "./canonical.js";
import type {
  BlendshapeSpec,
  BoneConstraint,
  BoneSpec,
  CharacterRigSchema,
  Mat4Tuple,
  RigCapabilities,
  RigValidationIssue,
  RigValidationResult,
  SkinLayer,
  SkinTextureReference,
  SkinValidationIssue,
  SkinValidationResult,
  Species,
  Vec3,
} from "./types.js";

export const IDENTITY_BIND: Mat4Tuple = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

function bind(x = 0, y = 0, z = 0): Mat4Tuple {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ];
}

function constraint(
  min: Vec3 = [-Math.PI, -Math.PI, -Math.PI],
  max: Vec3 = [Math.PI, Math.PI, Math.PI],
  translationLocked = true,
  scaleLocked = true,
): BoneConstraint {
  return { rotationRadians: { min, max }, translationLocked, scaleLocked };
}

function bone(
  id: string,
  parentId: string | null,
  position: Vec3 = [0, 0, 0],
  limits: BoneConstraint = constraint(),
): BoneSpec {
  return { id, parentId, bindTransform: bind(...position), constraint: limits };
}

function mirroredLimb(prefix: string, parentId: string, x: number, y: number): BoneSpec[] {
  return [
    bone(`${prefix}Upper`, parentId, [x, y, 0], constraint([-2.4, -1.5, -2.4], [2.4, 1.5, 2.4])),
    bone(`${prefix}Lower`, `${prefix}Upper`, [0, -0.42, 0], constraint([0, -0.1, -0.1], [2.7, 0.1, 0.1])),
    bone(`${prefix}End`, `${prefix}Lower`, [0, -0.38, 0], constraint([-0.8, -0.8, -0.8], [0.8, 0.8, 0.8])),
  ];
}

function faceBones(parentId: string, earParent = parentId): BoneSpec[] {
  return [
    bone("jaw", parentId, [0, -0.1, 0.05], constraint([-0.1, -0.1, -0.1], [0.8, 0.1, 0.1])),
    bone("eye.L", parentId, [0.08, 0.05, 0.1], constraint([-0.5, -0.5, 0], [0.5, 0.5, 0])),
    bone("eye.R", parentId, [-0.08, 0.05, 0.1], constraint([-0.5, -0.5, 0], [0.5, 0.5, 0])),
    bone("ear.L", earParent, [0.12, 0.18, 0], constraint([-0.7, -0.7, -0.7], [0.7, 0.7, 0.7])),
    bone("ear.R", earParent, [-0.12, 0.18, 0], constraint([-0.7, -0.7, -0.7], [0.7, 0.7, 0.7])),
  ];
}

const FACE_BLENDSHAPES: readonly BlendshapeSpec[] = [
  { id: "blink.L", regionId: "face", minWeight: 0, maxWeight: 1, symmetricPartnerId: "blink.R" },
  { id: "blink.R", regionId: "face", minWeight: 0, maxWeight: 1, symmetricPartnerId: "blink.L" },
  { id: "browUp.L", regionId: "face", minWeight: 0, maxWeight: 1, symmetricPartnerId: "browUp.R" },
  { id: "browUp.R", regionId: "face", minWeight: 0, maxWeight: 1, symmetricPartnerId: "browUp.L" },
  { id: "jawOpen", regionId: "face", minWeight: 0, maxWeight: 1 },
  { id: "smile", regionId: "face", minWeight: 0, maxWeight: 1 },
  { id: "frown", regionId: "face", minWeight: 0, maxWeight: 1 },
  { id: "muzzleSneer", regionId: "muzzle", minWeight: 0, maxWeight: 1 },
];

function rig(
  id: string,
  species: Species,
  bones: readonly BoneSpec[],
  capabilities: RigCapabilities,
  blendshapes: readonly BlendshapeSpec[] = FACE_BLENDSHAPES,
): CharacterRigSchema {
  const result: CharacterRigSchema = {
    schemaVersion: "character-rig/1.0",
    status: "core-enforced-fixture-not-production-rig",
    id,
    species,
    bones,
    blendshapes,
    capabilities,
  };
  assertValidCharacterRig(result);
  return result;
}

export function createHumanRig(): CharacterRigSchema {
  const bones: BoneSpec[] = [
    bone("root", null, [0, 0, 0], constraint([0, 0, 0], [0, 0, 0], false, false)),
    bone("pelvis", "root", [0, 0.95, 0]),
    bone("spine", "pelvis", [0, 0.22, 0]),
    bone("chest", "spine", [0, 0.28, 0]),
    bone("neck", "chest", [0, 0.28, 0]),
    bone("head", "neck", [0, 0.18, 0]),
    ...faceBones("head"),
    ...mirroredLimb("arm.L", "chest", 0.24, 0.18),
    ...mirroredLimb("arm.R", "chest", -0.24, 0.18),
    ...mirroredLimb("leg.L", "pelvis", 0.12, -0.12),
    ...mirroredLimb("leg.R", "pelvis", -0.12, -0.12),
  ];
  return rig("human-standard-v1", "human", bones, {
    face: true,
    body: true,
    tail: false,
    ears: false,
    digitigrade: false,
    hands: true,
    paws: false,
  }, FACE_BLENDSHAPES.filter((shape) => shape.id !== "muzzleSneer"));
}

function quadrupedLeg(prefix: string, parent: string, x: number, z: number): BoneSpec[] {
  return [
    bone(`${prefix}.upper`, parent, [x, -0.12, z], constraint([-2.2, -0.7, -0.7], [1.2, 0.7, 0.7])),
    bone(`${prefix}.lower`, `${prefix}.upper`, [0, -0.3, 0], constraint([-0.2, -0.2, -0.2], [2.5, 0.2, 0.2])),
    bone(`${prefix}.paw`, `${prefix}.lower`, [0, -0.24, 0.08], constraint([-0.8, -0.5, -0.5], [0.8, 0.5, 0.5])),
  ];
}

export function createFoxQuadrupedRig(): CharacterRigSchema {
  const bones: BoneSpec[] = [
    bone("root", null, [0, 0, 0], constraint([0, 0, 0], [0, 0, 0], false, false)),
    bone("pelvis", "root", [0, 0.48, -0.35]),
    bone("spine", "pelvis", [0, 0, 0.35]),
    bone("chest", "spine", [0, 0.02, 0.38]),
    bone("neck", "chest", [0, 0.16, 0.18]),
    bone("head", "neck", [0, 0.15, 0.16]),
    bone("muzzle", "head", [0, -0.02, 0.2]),
    ...faceBones("head"),
    bone("tail.0", "pelvis", [0, 0.08, -0.28], constraint([-1.2, -1.2, -1.2], [1.2, 1.2, 1.2])),
    bone("tail.1", "tail.0", [0, 0, -0.28]),
    bone("tail.2", "tail.1", [0, 0, -0.28]),
    ...quadrupedLeg("foreleg.L", "chest", 0.16, 0.18),
    ...quadrupedLeg("foreleg.R", "chest", -0.16, 0.18),
    ...quadrupedLeg("hindleg.L", "pelvis", 0.17, -0.12),
    ...quadrupedLeg("hindleg.R", "pelvis", -0.17, -0.12),
  ];
  return rig("fox-quadruped-v1", "fox", bones, {
    face: true,
    body: true,
    tail: true,
    ears: true,
    digitigrade: true,
    hands: false,
    paws: true,
  });
}

export function createAnthroRig(): CharacterRigSchema {
  const bones: BoneSpec[] = [
    bone("root", null, [0, 0, 0], constraint([0, 0, 0], [0, 0, 0], false, false)),
    bone("pelvis", "root", [0, 0.9, 0]),
    bone("spine", "pelvis", [0, 0.24, 0]),
    bone("chest", "spine", [0, 0.3, 0]),
    bone("neck", "chest", [0, 0.26, 0]),
    bone("head", "neck", [0, 0.18, 0]),
    bone("muzzle", "head", [0, -0.02, 0.16]),
    ...faceBones("head"),
    bone("tail.0", "pelvis", [0, 0.05, -0.18]),
    bone("tail.1", "tail.0", [0, 0, -0.3]),
    bone("tail.2", "tail.1", [0, 0, -0.3]),
    ...mirroredLimb("arm.L", "chest", 0.25, 0.17),
    ...mirroredLimb("arm.R", "chest", -0.25, 0.17),
    bone("thigh.L", "pelvis", [0.13, -0.13, 0], constraint([-2.3, -0.8, -0.8], [1.5, 0.8, 0.8])),
    bone("shin.L", "thigh.L", [0, -0.42, 0.08], constraint([0, -0.1, -0.1], [2.6, 0.1, 0.1])),
    bone("hock.L", "shin.L", [0, -0.35, -0.08], constraint([-1.3, -0.5, -0.5], [1.3, 0.5, 0.5])),
    bone("paw.L", "hock.L", [0, -0.18, 0.18]),
    bone("thigh.R", "pelvis", [-0.13, -0.13, 0], constraint([-2.3, -0.8, -0.8], [1.5, 0.8, 0.8])),
    bone("shin.R", "thigh.R", [0, -0.42, 0.08], constraint([0, -0.1, -0.1], [2.6, 0.1, 0.1])),
    bone("hock.R", "shin.R", [0, -0.35, -0.08], constraint([-1.3, -0.5, -0.5], [1.3, 0.5, 0.5])),
    bone("paw.R", "hock.R", [0, -0.18, 0.18]),
  ];
  return rig("anthro-standard-v1", "anthro", bones, {
    face: true,
    body: true,
    tail: true,
    ears: true,
    digitigrade: true,
    hands: true,
    paws: true,
  });
}

const REQUIRED_CAPABILITIES: Readonly<Record<Species, readonly (keyof RigCapabilities)[]>> = {
  human: ["face", "body", "hands"],
  fox: ["face", "body", "tail", "ears", "digitigrade", "paws"],
  anthro: ["face", "body", "tail", "ears", "digitigrade", "hands", "paws"],
};

export function validateCharacterRig(rig: CharacterRigSchema): RigValidationResult {
  const issues: RigValidationIssue[] = [];
  try {
    assertFiniteDeep(rig);
  } catch (error) {
    issues.push({ code: "non-finite", message: String((error as Error).message) });
  }
  const boneIds = new Set<string>();
  rig.bones.forEach((candidate, index) => {
    if (!candidate.id || boneIds.has(candidate.id)) {
      issues.push({ code: "duplicate-bone", message: `duplicate/empty bone ${candidate.id}`, path: `bones[${index}]` });
    }
    boneIds.add(candidate.id);
    if (candidate.bindTransform.length !== 16) {
      issues.push({ code: "bind-transform-length", message: `${candidate.id} bind transform must have 16 values`, path: `bones[${index}]` });
    }
    for (let axis = 0; axis < 3; axis++) {
      if (candidate.constraint.rotationRadians.min[axis]! > candidate.constraint.rotationRadians.max[axis]!) {
        issues.push({ code: "invalid-constraint", message: `${candidate.id} min exceeds max`, path: `bones[${index}]` });
      }
    }
  });
  const roots = rig.bones.filter((candidate) => candidate.parentId === null);
  if (roots.length !== 1) issues.push({ code: "root-count", message: `expected one root, found ${roots.length}` });
  rig.bones.forEach((candidate, index) => {
    if (candidate.parentId !== null && !boneIds.has(candidate.parentId)) {
      issues.push({ code: "missing-parent", message: `${candidate.id} parent ${candidate.parentId} missing`, path: `bones[${index}]` });
    }
    const visited = new Set<string>([candidate.id]);
    let parentId = candidate.parentId;
    while (parentId !== null) {
      if (visited.has(parentId)) {
        issues.push({ code: "bone-cycle", message: `cycle at ${candidate.id}`, path: `bones[${index}]` });
        break;
      }
      visited.add(parentId);
      parentId = rig.bones.find((boneSpec) => boneSpec.id === parentId)?.parentId ?? null;
    }
  });
  for (const capability of REQUIRED_CAPABILITIES[rig.species]) {
    if (!rig.capabilities[capability]) {
      issues.push({ code: "missing-capability", message: `${rig.species} requires ${capability}`, path: `capabilities.${capability}` });
    }
  }
  const blendshapeIds = new Set<string>();
  rig.blendshapes.forEach((shape, index) => {
    if (!shape.id || blendshapeIds.has(shape.id)) {
      issues.push({ code: "duplicate-blendshape", message: `duplicate/empty blendshape ${shape.id}`, path: `blendshapes[${index}]` });
    }
    blendshapeIds.add(shape.id);
    if (!(shape.minWeight <= shape.maxWeight)) {
      issues.push({ code: "invalid-blendshape-range", message: `${shape.id} min exceeds max`, path: `blendshapes[${index}]` });
    }
  });
  rig.blendshapes.forEach((shape, index) => {
    if (shape.symmetricPartnerId && !blendshapeIds.has(shape.symmetricPartnerId)) {
      issues.push({ code: "missing-blendshape-partner", message: `${shape.id} partner missing`, path: `blendshapes[${index}]` });
    }
  });
  return { ok: issues.length === 0, issues };
}

export function assertValidCharacterRig(rig: CharacterRigSchema): void {
  const result = validateCharacterRig(rig);
  if (!result.ok) {
    throw new Error(`invalid CharacterRigSchema: ${result.issues.map((issue) => issue.code).join(", ")}`);
  }
}

export function characterRigHash(rig: CharacterRigSchema): string {
  assertValidCharacterRig(rig);
  return sha256Canonical(rig);
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SKIN_CHANNEL_NAMES = [
  "baseColor",
  "celShade",
  "normalDetail",
  "roughness",
  "fur",
  "marking",
  "opacity",
] as const;
const REQUIRED_SKIN_CHANNELS = SKIN_CHANNEL_NAMES.slice(0, 4);

function validateTextureReference(
  reference: SkinTextureReference,
  path: string,
  issues: SkinValidationIssue[],
): void {
  if (!reference || typeof reference !== "object") {
    issues.push({ code: "missing-texture-reference", message: `${path} is required`, path });
    return;
  }
  if (!reference.assetRef?.trim()) {
    issues.push({ code: "missing-asset-ref", message: `${path}.assetRef is required`, path });
  }
  if (!SHA256_PATTERN.test(reference.digest)) {
    issues.push({ code: "invalid-digest", message: `${path}.digest must be lower-case SHA-256`, path });
  }
  if (!["image/png", "image/jpeg", "image/webp", "image/ktx2"].includes(reference.mimeType)) {
    issues.push({ code: "invalid-mime-type", message: `${path}.mimeType is unsupported`, path });
  }
  if (reference.colorSpace !== "srgb" && reference.colorSpace !== "linear") {
    issues.push({ code: "invalid-color-space", message: `${path}.colorSpace is unsupported`, path });
  }
}

/** Enforces that a SkinLayer is whole-body, surface-only, and topology-bound. */
export function validateSkinLayer(layer: SkinLayer): SkinValidationResult {
  const issues: SkinValidationIssue[] = [];
  try {
    assertFiniteDeep(layer);
  } catch (error) {
    issues.push({ code: "non-finite", message: String((error as Error).message) });
  }
  if (layer.schemaVersion !== "sovereign-skin-layer/1.0") {
    issues.push({ code: "schema-version", message: "unsupported SkinLayer schemaVersion" });
  }
  if (!layer.id?.trim() || !layer.version?.trim()) {
    issues.push({ code: "missing-identity", message: "SkinLayer id and version are required" });
  }
  if (layer.bodyCoverage !== "whole-body") {
    issues.push({ code: "partial-coverage", message: "SkinLayer must cover the whole body" });
  }
  if (!layer.rigId?.trim() || !layer.sculptDocumentId?.trim()) {
    issues.push({ code: "missing-binding", message: "rigId and sculptDocumentId are required" });
  }
  if (!SHA256_PATTERN.test(layer.topologyDigest) || !SHA256_PATTERN.test(layer.uvDigest)) {
    issues.push({ code: "invalid-binding-digest", message: "topologyDigest and uvDigest must be lower-case SHA-256" });
  }
  if (layer.surfaceOnly !== true || layer.anatomyMutationAllowed !== false) {
    issues.push({
      code: "anatomy-policy",
      message: "SkinLayer must remain surface-only with anatomyMutationAllowed:false",
    });
  }

  const regionIds = new Set<string>();
  (layer.materialRegions ?? []).forEach((region, index) => {
    if (!region.id?.trim() || regionIds.has(region.id)) {
      issues.push({ code: "invalid-material-region", message: `duplicate/empty material region ${region.id}`, path: `materialRegions[${index}]` });
    }
    regionIds.add(region.id);
    if (!region.sculptRegionId?.trim() || !region.materialId?.trim()) {
      issues.push({ code: "invalid-material-binding", message: `${region.id} requires sculptRegionId and materialId`, path: `materialRegions[${index}]` });
    }
  });
  if (!layer.materialRegions?.length) {
    issues.push({ code: "missing-material-regions", message: "at least one material region is required" });
  }

  const channelRecord = (layer.textureChannels ?? {}) as unknown as Record<string, SkinTextureReference>;
  for (const channel of REQUIRED_SKIN_CHANNELS) {
    if (!(channel in channelRecord)) {
      issues.push({ code: "missing-texture-channel", message: `${channel} texture channel is required`, path: `textureChannels.${channel}` });
    }
  }
  for (const channel of Object.keys(channelRecord)) {
    if (!(SKIN_CHANNEL_NAMES as readonly string[]).includes(channel)) {
      issues.push({
        code: "geometry-channel-forbidden",
        message: `texture channel ${channel} is not surface-only; displacement/height channels are forbidden`,
        path: `textureChannels.${channel}`,
      });
      continue;
    }
    validateTextureReference(channelRecord[channel]!, `textureChannels.${channel}`, issues);
  }

  const provenance = layer.generationProvenance;
  if (provenance && !["operator-authored", "governed-model", "procedural-bake"].includes(provenance.method)) {
    issues.push({ code: "invalid-generation-method", message: "generation provenance method is unsupported" });
  }
  if (!provenance?.generatorId?.trim() || !provenance.generatorVersion?.trim()
    || !provenance.authorityRef?.trim() || !provenance.rightsRef?.trim()) {
    issues.push({ code: "incomplete-provenance", message: "generator, authority, and rights provenance are required" });
  }
  const provenanceDigests = [
    ...(provenance?.inputDigests ?? []),
    ...(provenance?.promptDigest ? [provenance.promptDigest] : []),
  ];
  if (provenanceDigests.some((digest) => !SHA256_PATTERN.test(digest))) {
    issues.push({ code: "invalid-provenance-digest", message: "provenance digests must be lower-case SHA-256" });
  }
  return { ok: issues.length === 0, issues };
}

export function assertValidSkinLayer(layer: SkinLayer): void {
  const result = validateSkinLayer(layer);
  if (!result.ok) {
    throw new Error(`invalid SkinLayer: ${result.issues.map((issue) => issue.code).join(", ")}`);
  }
}

export function skinLayerHash(layer: SkinLayer): string {
  assertValidSkinLayer(layer);
  return sha256Canonical(layer);
}
