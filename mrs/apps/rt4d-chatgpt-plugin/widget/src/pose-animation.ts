/**
 * RT4D pose animation — 4D rotation planes (XW/YW/ZW) → bone TRS keyframes.
 * Status: partial. Targets POSE_BONE_IDS (same names as the fixture GLB).
 * Does not skin-deform anatomy; empty bone nodes + mesh parented under spine.
 */

import {
  AnimationClip,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from "three";
import { POSE_BONE_IDS, type PoseBoneId } from "../../shared/encode-glb";

/** Optional rig from sovereign-sculptor / GLB nodes. */
export interface MiniRig {
  bones: { id: string; parentId: string | null }[];
}

export interface RotationPlane {
  plane: "XW" | "YW" | "ZW";
  speed: number;
}

export interface BoneKeyframe {
  time: number;
  translation: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
}

export interface BoneAnimationTrack {
  boneId: string;
  keyframes: BoneKeyframe[];
}

function eulerToQuat(rx: number, ry: number, rz: number): [number, number, number, number] {
  const cx = Math.cos(rx / 2),
    sx = Math.sin(rx / 2);
  const cy = Math.cos(ry / 2),
    sy = Math.sin(ry / 2);
  const cz = Math.cos(rz / 2),
    sz = Math.sin(rz / 2);
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ];
}

function normalizeQuat(q: [number, number, number, number]): [number, number, number, number] {
  const len = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  if (len < 1e-10) return [0, 0, 0, 1];
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

function boneToPlaneMapping(boneId: string): {
  xwInfluence: [number, number, number];
  ywInfluence: [number, number, number];
  zwInfluence: [number, number, number];
} {
  const xwMap: Record<string, [number, number, number]> = {
    root: [0, 0, 0],
    pelvis: [0.15, 0, 0],
    spine: [0.3, 0, 0],
    chest: [0.4, 0, 0],
    shoulder_L: [0.2, 0, 0.1],
    shoulder_R: [0.2, 0, -0.1],
    arm_L: [0.15, 0, 0.05],
    arm_R: [0.15, 0, -0.05],
    leg_L: [-0.1, 0, 0],
    leg_R: [-0.1, 0, 0],
  };
  const ywMap: Record<string, [number, number, number]> = {
    neck: [0, 0.4, 0],
    head: [0, 0.5, 0],
    jaw: [0, 0.15, 0],
    ear_L: [0, 0.3, 0.15],
    ear_R: [0, 0.3, -0.15],
  };
  const zwMap: Record<string, [number, number, number]> = {
    tail: [0, 0, 0.5],
    shoulder_L: [0, 0, 0.2],
    shoulder_R: [0, 0, -0.2],
    paw_L: [0, 0, 0.1],
    paw_R: [0, 0, -0.1],
    foot_L: [0, 0, 0.08],
    foot_R: [0, 0, -0.08],
  };
  return {
    xwInfluence: xwMap[boneId] ?? [0, 0, 0],
    ywInfluence: ywMap[boneId] ?? [0, 0, 0],
    zwInfluence: zwMap[boneId] ?? [0, 0, 0],
  };
}

export function generatePoseFromRotationPlanes(
  rotationPlanes: RotationPlane[],
  duration = 2.0,
  fps = 24,
  boneIds: readonly string[] = POSE_BONE_IDS
): BoneAnimationTrack[] {
  const frameCount = Math.ceil(duration * fps);
  const dt = 1 / fps;
  const speeds: Record<string, number> = { XW: 0, YW: 0, ZW: 0 };
  for (const rp of rotationPlanes) speeds[rp.plane] = rp.speed;

  const tracks: BoneAnimationTrack[] = [];
  for (const boneId of boneIds) {
    const mapping = boneToPlaneMapping(boneId);
    const keyframes: BoneKeyframe[] = [];
    for (let frame = 0; frame <= frameCount; frame++) {
      const t = frame * dt;
      const phase = t * Math.PI * 2;
      const xwAngle = Math.sin(phase * speeds.XW) * 0.3;
      const ywAngle = Math.sin(phase * speeds.YW) * 0.3;
      const zwAngle = Math.sin(phase * speeds.ZW) * 0.3;
      const rx =
        xwAngle * mapping.xwInfluence[0] +
        ywAngle * mapping.ywInfluence[0] +
        zwAngle * mapping.zwInfluence[0];
      const ry =
        xwAngle * mapping.xwInfluence[1] +
        ywAngle * mapping.ywInfluence[1] +
        zwAngle * mapping.zwInfluence[1];
      const rz =
        xwAngle * mapping.xwInfluence[2] +
        ywAngle * mapping.ywInfluence[2] +
        zwAngle * mapping.zwInfluence[2];
      keyframes.push({
        time: t,
        translation: [0, 0, 0],
        rotation: normalizeQuat(eulerToQuat(rx, ry, rz)),
        scale: [1, 1, 1],
      });
    }
    tracks.push({ boneId, keyframes });
  }
  return tracks;
}

/** Three.js clip. Track names match glTF node names from encode-glb.ts. */
export function tracksToAnimationClip(
  tracks: BoneAnimationTrack[],
  name = "rt4d-pose"
): AnimationClip {
  const threeTracks = [];
  for (const track of tracks) {
    const times = track.keyframes.map((kf) => kf.time);
    threeTracks.push(
      new VectorKeyframeTrack(
        `${track.boneId}.position`,
        times,
        track.keyframes.flatMap((kf) => kf.translation)
      )
    );
    threeTracks.push(
      new QuaternionKeyframeTrack(
        `${track.boneId}.quaternion`,
        times,
        track.keyframes.flatMap((kf) => kf.rotation)
      )
    );
    threeTracks.push(
      new VectorKeyframeTrack(
        `${track.boneId}.scale`,
        times,
        track.keyframes.flatMap((kf) => kf.scale)
      )
    );
  }
  const duration = tracks[0]?.keyframes.at(-1)?.time ?? 2;
  return new AnimationClip(name, duration, threeTracks);
}

export function poseClipFromPlanes(
  rotationPlanes: RotationPlane[],
  duration = 2,
  fps = 24
): AnimationClip {
  return tracksToAnimationClip(
    generatePoseFromRotationPlanes(rotationPlanes, duration, fps)
  );
}

/** Same as poseClipFromPlanes, using bone ids from a MiniRig when present. */
export function generatePoseFromRig(
  rig: MiniRig,
  rotationPlanes: RotationPlane[],
  duration = 2,
  fps = 24
): BoneAnimationTrack[] {
  const ids = rig.bones.map((b) => b.id);
  return generatePoseFromRotationPlanes(
    rotationPlanes,
    duration,
    fps,
    ids.length > 0 ? ids : POSE_BONE_IDS
  );
}

export type { PoseBoneId };
