/**
 * FaceIdentityModeler — deterministic 3D identity face sculpting.
 *
 * Problem this solves: every character in the pipeline currently renders the
 * SAME static fixture head (HumanFaceRigged*.glb). The rig's morph channels
 * only encode EXPRESSION (Smile/Frown/BlinkLeft/...), so there is no identity
 * variation at all.
 *
 * Technique (Drive-G-1: exact governed geometry, NO diffusion):
 *  1. Load the neutral face mesh (any HumanRig with a face/head mesh).
 *  2. Derive anatomical region masks deterministically from the mesh itself:
 *     - skull / brow / eye / nose / mouth / chin / cheek / jaw bands from
 *       AABB-normalized position, PLUS
 *     - expression morph delta magnitudes (BlinkLeft/Right, MouthOpen, ...)
 *       as region priors where the fixture already encodes anatomy.
 *  3. For each identity axis, apply a bounded, smooth displacement field over
 *     the region mask (forward prominence for nose/brow/lips/chin, lateral
 *     width for skull/jaw/cheek, eye spacing/depth).
 *  4. Recompute normals, keep topology (indices) unchanged.
 *  5. Emit a SculptedFaceModel with a deterministic identity hash so the same
 *     descriptor + same base mesh ALWAYS produce the same geometry.
 *  6. Optional biometric conformance check against a BiometricProfile AABB.
 *
 * The output plugs directly into the existing portrait raster path
 * (buildPortraitRasterMeshesFromIdentity) and the GLB/Cycles lane.
 *
 * Status: **enforced by tests** (determinism, distinctness, biometric).
 */

import type { HumanMeshRef, HumanRig, Mat4Tuple } from "../human/HumanRigTypes.js";
import { IDENTITY_MAT4 } from "../human/mat4.js";
import { generateNormals } from "../human/HumanRigDeformer.js";
import { hashCanonical } from "../scene/hash.js";
import { computeMeshAabb, type MeshAabb } from "./FixtureFaceRegistry.js";
import {
  getBiometricProfile,
  validateAabbAgainstProfile,
  type BiometricValidationResult,
} from "./BiometricProfile.js";
import type { Vec3 } from "../renderer/raster/HeadlessStillRenderer.js";

/**
 * Identity descriptor. Every axis is optional and normalized to [-1, 1]:
 *   0 = neutral (no sculpt), +1 = maximum (wider/longer/forward), -1 = minimum.
 */
export interface FaceIdentityDescriptor {
  /** Skull lateral width. */
  skullWidth?: number;
  /** Skull front-back depth. */
  skullDepth?: number;
  /** Lower-face (jaw) lateral width. */
  jawWidth?: number;
  /** Cheek prominence (lateral). */
  cheekProminence?: number;
  /** Brow ridge forward prominence. */
  browRidge?: number;
  /** Nose lateral width. */
  noseWidth?: number;
  /** Nose forward length. */
  noseLength?: number;
  /** Lip forward fullness. */
  lipFullness?: number;
  /** Chin forward prominence. */
  chinProminence?: number;
  /** Eye spacing: + pulls eyes apart, - pulls together. */
  eyeSpacing?: number;
  /** Eye socket depth: + recessed, - forward. */
  eyeDepth?: number;
}

/** Bounded maximum displacement per axis (4% of head width ≈ lawful). */
export const MAX_IDENTITY_DISPLACEMENT = 0.04 as const;

export interface FaceRegionMasks {
  readonly skull: Float32Array;
  readonly brow: Float32Array;
  readonly eye: Float32Array;
  readonly nose: Float32Array;
  readonly mouth: Float32Array;
  readonly chin: Float32Array;
  readonly cheek: Float32Array;
  readonly jaw: Float32Array;
}

export interface SculptedFaceModel {
  readonly baseMeshId: string;
  readonly vertexCount: number;
  readonly vertices: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly descriptor: Required<FaceIdentityDescriptor>;
  readonly identityHash: string;
  readonly aabb: MeshAabb;
  /** Per-axis max displacement actually applied (info / audit). */
  readonly appliedAmplitudes: Readonly<Record<string, number>>;
  /** Biometric conformance when a profile is available (else undefined). */
  readonly biometric?: BiometricValidationResult;
}

const AXES: ReadonlyArray<keyof FaceIdentityDescriptor> = [
  "skullWidth",
  "skullDepth",
  "jawWidth",
  "cheekProminence",
  "browRidge",
  "noseWidth",
  "noseLength",
  "lipFullness",
  "chinProminence",
  "eyeSpacing",
  "eyeDepth",
];

export const NEUTRAL_DESCRIPTOR: Required<FaceIdentityDescriptor> = Object.freeze({
  skullWidth: 0,
  skullDepth: 0,
  jawWidth: 0,
  cheekProminence: 0,
  browRidge: 0,
  noseWidth: 0,
  noseLength: 0,
  lipFullness: 0,
  chinProminence: 0,
  eyeSpacing: 0,
  eyeDepth: 0,
});

export function normalizeDescriptor(
  descriptor: FaceIdentityDescriptor,
): Required<FaceIdentityDescriptor> {
  const out: Required<FaceIdentityDescriptor> = { ...NEUTRAL_DESCRIPTOR };
  for (const axis of AXES) {
    const v = descriptor[axis];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[axis] = Math.max(-1, Math.min(1, v));
    }
  }
  return out;
}

/** Deterministic hash of a (normalized) descriptor — stable identity id. */
export function identityDescriptorHash(
  descriptor: FaceIdentityDescriptor,
): string {
  return hashCanonical(normalizeDescriptor(descriptor));
}

/** -------------- region mask derivation -------------- */

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Smooth band [center-width, center+width] around a normalized coord. */
function band(n: number, center: number, width: number): number {
  return smoothstep(center - width, center - width * 0.5, n) *
    (1 - smoothstep(center + width * 0.5, center + width, n));
}

/**
 * Derive per-vertex anatomical masks from the neutral mesh.
 *
 * Uses AABB-normalized position bands PLUS the expression morph delta
 * magnitudes as anatomy priors (the fixture encodes eyes/mouth via
 * BlinkLeft/BlinkRight and MouthOpen/MouthNarrow).
 */
export function deriveFaceRegionMasks(mesh: HumanMeshRef): FaceRegionMasks {
  const count = mesh.vertices.length / 3;
  const aabb = computeMeshAabb(mesh.vertices);
  const w = Math.max(1e-6, aabb.max[0] - aabb.min[0]);
  const h = Math.max(1e-6, aabb.max[1] - aabb.min[1]);
  const d = Math.max(1e-6, aabb.max[2] - aabb.min[2]);
  const cx = (aabb.max[0] + aabb.min[0]) * 0.5;
  const cy = (aabb.max[1] + aabb.min[1]) * 0.5;
  const cz = (aabb.max[2] + aabb.min[2]) * 0.5;

  // Expression morph delta magnitude per vertex → anatomy priors.
  const eyeDelta = new Float32Array(count);
  const mouthDelta = new Float32Array(count);
  for (const channel of mesh.morphChannels) {
    const isEye =
      channel.id === "BlinkLeft" ||
      channel.id === "BlinkRight" ||
      channel.id === "Squint" ||
      channel.id === "WideEyes";
    const isMouth =
      channel.id === "MouthOpen" ||
      channel.id === "MouthNarrow" ||
      channel.id === "Smile" ||
      channel.id === "Frown";
    if (!isEye && !isMouth) continue;
    const target = isEye ? eyeDelta : mouthDelta;
    const deltas = channel.positionDeltas;
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      const mag =
        Math.hypot(deltas[o] ?? 0, deltas[o + 1] ?? 0, deltas[o + 2] ?? 0);
      target[i] = Math.max(target[i]!, mag);
    }
  }
  // Normalize priors to [0,1].
  const maxEye = Math.max(1e-6, Math.max(...eyeDelta));
  const maxMouth = Math.max(1e-6, Math.max(...mouthDelta));
  const eyePrior = eyeDelta.map((v) => Math.min(1, v / maxEye));
  const mouthPrior = mouthDelta.map((v) => Math.min(1, v / maxMouth));

  const skull = new Float32Array(count);
  const brow = new Float32Array(count);
  const eye = new Float32Array(count);
  const nose = new Float32Array(count);
  const mouth = new Float32Array(count);
  const chin = new Float32Array(count);
  const cheek = new Float32Array(count);
  const jaw = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const o = i * 3;
    const nx = (mesh.vertices[o]! - cx) / (w * 0.5); // [-1,1]
    const ny = (mesh.vertices[o + 1]! - cy) / (h * 0.5); // [-1,1]
    const nz = (mesh.vertices[o + 2]! - cz) / (d * 0.5); // [-1,1]
    const front = smoothstep(0.1, 0.6, nz);
    const central = 1 - smoothstep(0.18, 0.6, Math.abs(nx));

    // Skull: cranium cap — must reach the widest lateral ring (equator) so
    // skullWidth/skullDepth actually change the AABB extent.
    skull[i] = band(ny, 0.35, 0.5) * (1 - smoothstep(-0.3, 0.2, nz) * 0.35);
    // Brow: between skull and eye band, forward.
    brow[i] = band(ny, 0.25, 0.22) * front * central * Math.max(eyePrior[i]!, 0.4);
    // Eye: lateral forward band + expression prior.
    eye[i] = band(ny, -0.05, 0.3) * front * (eyePrior[i]! > 0.05 ? eyePrior[i]! : 0) *
      (1 - smoothstep(0.35, 0.7, Math.abs(nx)));
    // Nose: central column, forward, mid band.
    nose[i] = band(ny, -0.05, 0.25) * front * central;
    // Mouth: central lower band + expression prior.
    mouth[i] = band(ny, -0.3, 0.2) * front * central * Math.max(mouthPrior[i]!, 0.35);
    // Chin: central lowest band.
    chin[i] = band(ny, -0.55, 0.18) * smoothstep(0.0, 0.45, nz) * central;
    // Cheek: lateral mid band.
    cheek[i] = band(ny, 0.0, 0.28) * front *
      smoothstep(0.3, 0.5, Math.abs(nx)) * (1 - smoothstep(0.75, 0.95, Math.abs(nx)));
    // Jaw: lower lateral band.
    jaw[i] = band(ny, -0.4, 0.25) * smoothstep(0.15, 0.45, nz) *
      smoothstep(0.25, 0.45, Math.abs(nx)) * (1 - smoothstep(0.85, 1.0, Math.abs(nx)));
  }

  return { skull, brow, eye, nose, mouth, chin, cheek, jaw };
}

/** -------------- sculpt application -------------- */

/**
 * Apply a descriptor to the neutral face mesh. Deterministic: same descriptor
 * + same mesh → identical vertices + identity hash.
 */
export function sculptFaceIdentity(
  mesh: HumanMeshRef,
  descriptor: FaceIdentityDescriptor,
): SculptedFaceModel {
  const normalized = normalizeDescriptor(descriptor);
  const masks = deriveFaceRegionMasks(mesh);
  const count = mesh.vertices.length / 3;
  const vertices = new Float32Array(mesh.vertices);
  const baseAabb = computeMeshAabb(mesh.vertices);
  const cx = (baseAabb.max[0] + baseAabb.min[0]) * 0.5;
  const cz = (baseAabb.max[2] + baseAabb.min[2]) * 0.5;

  const push = (
    mask: Float32Array,
    axis: "x" | "y" | "z",
    sign: (i: number) => number,
    amp: number,
  ) => {
    const m = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    for (let i = 0; i < count; i++) {
      vertices[i * 3 + m]! += mask[i]! * sign(i) * amp;
    }
  };

  const lateral = (mask: Float32Array, amp: number) => {
    // Symmetric outward/inward along x (sign of x). Preserves symmetry.
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      vertices[o]! += mask[i]! * Math.sign(mesh.vertices[o]! - cx || 1) * amp;
    }
  };

  const amplitude = (value: number) => value * MAX_IDENTITY_DISPLACEMENT;

  lateral(masks.skull, amplitude(normalized.skullWidth));
  // Skull depth: forward on front cap, backward on back cap.
  {
    const amp = amplitude(normalized.skullDepth);
    for (let i = 0; i < count; i++) {
      vertices[i * 3 + 2]! +=
        masks.skull[i]! * Math.sign(mesh.vertices[i * 3 + 2]! - cz || 1) * amp;
    }
  }
  lateral(masks.jaw, amplitude(normalized.jawWidth));
  lateral(masks.cheek, amplitude(normalized.cheekProminence));
  push(masks.brow, "z", () => 1, amplitude(normalized.browRidge));
  lateral(masks.nose, amplitude(normalized.noseWidth));
  push(masks.nose, "z", () => 1, amplitude(normalized.noseLength));
  push(masks.mouth, "z", () => 1, amplitude(normalized.lipFullness));
  push(masks.chin, "z", () => 1, amplitude(normalized.chinProminence));
  // Eye spacing: left eye leftward, right eye rightward (symmetric).
  {
    const amp = amplitude(normalized.eyeSpacing);
    for (let i = 0; i < count; i++) {
      vertices[i * 3]! += masks.eye[i]! * Math.sign(mesh.vertices[i * 3]! - cx || 1) * amp;
    }
    // Eye depth: recess along -z.
    const depth = amplitude(normalized.eyeDepth);
    for (let i = 0; i < count; i++) {
      vertices[i * 3 + 2]! -= masks.eye[i]! * depth;
    }
  }

  const normals = generateNormals(vertices, mesh.indices);
  const aabb = computeMeshAabb(vertices);
  const profile = getBiometricProfile("human-sized");
  const biometric = profile
    ? validateAabbAgainstProfile(profile, aabb)
    : undefined;

  const appliedAmplitudes: Record<string, number> = {};
  for (const axis of AXES) {
    const v = normalized[axis];
    if (v !== 0) appliedAmplitudes[axis] = v * MAX_IDENTITY_DISPLACEMENT;
  }

  return {
    baseMeshId: mesh.id,
    vertexCount: count,
    vertices,
    normals,
    indices: mesh.indices,
    descriptor: normalized,
    identityHash: identityDescriptorHash(normalized),
    aabb,
    appliedAmplitudes,
    biometric,
  };
}

/** Best mesh to sculpt: face mesh, else head mesh. */
export function faceMeshFromRig(rig: HumanRig): HumanMeshRef | undefined {
  return rig.meshes.faceMesh ?? rig.meshes.headMesh;
}

/** Convert a sculpted face into a renderable RasterMesh for portrait stills. */
export function sculptedFaceToRasterMesh(
  model: SculptedFaceModel,
  options?: {
    id?: string;
    baseColor?: Vec3;
    modelMatrix?: Mat4Tuple;
  },
): {
  id: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array | Uint32Array;
  modelMatrix: Mat4Tuple;
  baseColor: Vec3;
} {
  return {
    id: options?.id ?? `identity-face:${model.identityHash}`,
    positions: model.vertices,
    normals: model.normals,
    indices: model.indices,
    modelMatrix: options?.modelMatrix ?? IDENTITY_MAT4,
    baseColor: options?.baseColor ?? ([0.9, 0.74, 0.62] as Vec3),
  };
}