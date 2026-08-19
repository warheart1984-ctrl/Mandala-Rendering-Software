/**
 * RT4D Pose Animation — converts 4D rotation planes (XW/YW/ZW) into
 * bone TRS keyframes for skeletal animation.
 *
 * The 4D rotation angles drive the skeleton's pose over time:
 * - XW plane → spine/chest rotation (forward/back)
 * - YW plane → head/neck rotation (look up/down)
 * - ZW plane → tail/shoulder rotation (lateral)
 * - Secondary channels: ears, jaw, limbs
 */

import type { CharacterRigSchema, BoneSpec, Mat4Tuple } from "../sovereign-sculptor/src/types.js";

export interface RotationPlane {
  plane: "XW" | "YW" | "ZW";
  speed: number;
}

export interface BoneKeyframe {
  time: number;
  translation: [number, number, number];
  rotation: [number, number, number, number]; // quaternion [x,y,z,w]
  scale: [number, number, number];
}

export interface BoneAnimationTrack {
  boneId: string;
  keyframes: BoneKeyframe[];
}

/** Quaternion from Euler angles (XYZ order) */
function eulerToQuat(rx: number, ry: number, rz: number): [number, number, number, number] {
  const cx = Math.cos(rx / 2), sx = Math.sin(rx / 2);
  const cy = Math.cos(ry / 2), sy = Math.sin(ry / 2);
  const cz = Math.cos(rz / 2), sz = Math.sin(rz / 2);
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ];
}

/** Normalize quaternion */
function normalizeQuat(q: [number, number, number, number]): [number, number, number, number] {
  const len = Math.sqrt(q[0]*q[0] + q[1]*q[1] + q[2]*q[2] + q[3]*q[3]);
  if (len < 1e-10) return [0, 0, 0, 1];
  return [q[0]/len, q[1]/len, q[2]/len, q[3]/len];
}

/** Slerp between two quaternions */
function slerp(
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number
): [number, number, number, number] {
  let dot = a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3];
  if (dot < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; dot = -dot; }
  if (dot > 0.9995) {
    return normalizeQuat([
      a[0] + t*(b[0]-a[0]),
      a[1] + t*(b[1]-a[1]),
      a[2] + t*(b[2]-a[2]),
      a[3] + t*(b[3]-a[3]),
    ]);
  }
  const theta = Math.acos(Math.min(dot, 1));
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1-t)*theta) / sinTheta;
  const wb = Math.sin(t*theta) / sinTheta;
  return [
    wa*a[0] + wb*b[0],
    wa*a[1] + wb*b[1],
    wa*a[2] + wb*b[2],
    wa*a[3] + wb*b[3],
  ];
}

/**
 * Map a bone to its rotation plane influence.
 * Returns a function that generates Euler angles from rotation plane values.
 */
function boneToPlaneMapping(boneId: string): {
  xwInfluence: [number, number, number];
  ywInfluence: [number, number, number];
  zwInfluence: [number, number, number];
} {
  // Spine/chest respond to XW (forward/back tilt)
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

  // Head/neck respond to YW (look up/down)
  const ywMap: Record<string, [number, number, number]> = {
    neck: [0, 0.4, 0],
    head: [0, 0.5, 0],
    jaw: [0, 0.15, 0],
    eye_L: [0, 0.1, 0.05],
    eye_R: [0, 0.1, -0.05],
    ear_L: [0, 0.3, 0.15],
    ear_R: [0, 0.3, -0.15],
  };

  // Tail/shoulders respond to ZW (lateral sway)
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

/**
 * Generate pose animation from 4D rotation planes.
 *
 * @param rig - The character rig schema
 * @param rotationPlanes - Array of { plane, speed } from the RT4D scene
 * @param duration - Animation duration in seconds
 * @param fps - Frames per second for keyframe sampling
 * @returns Array of bone animation tracks (one per bone)
 */
export function generatePoseFromRotationPlanes(
  rig: CharacterRigSchema,
  rotationPlanes: RotationPlane[],
  duration: number = 2.0,
  fps: number = 24
): BoneAnimationTrack[] {
  const frameCount = Math.ceil(duration * fps);
  const dt = 1 / fps;

  // Extract rotation speeds per plane
  const speeds: Record<string, number> = { XW: 0, YW: 0, ZW: 0 };
  for (const rp of rotationPlanes) {
    speeds[rp.plane] = rp.speed;
  }

  const tracks: BoneAnimationTrack[] = [];

  for (const bone of rig.bones) {
    const mapping = boneToPlaneMapping(bone.id);
    const keyframes: BoneKeyframe[] = [];

    for (let frame = 0; frame <= frameCount; frame++) {
      const t = frame * dt;
      const phase = t * Math.PI * 2;

      // Compute rotation from each plane
      const xwAngle = Math.sin(phase * speeds.XW) * 0.3;
      const ywAngle = Math.sin(phase * speeds.YW) * 0.3;
      const zwAngle = Math.sin(phase * speeds.ZW) * 0.3;

      // Combine influences
      const rx = xwAngle * mapping.xwInfluence[0] + ywAngle * mapping.ywInfluence[0] + zwAngle * mapping.zwInfluence[0];
      const ry = xwAngle * mapping.xwInfluence[1] + ywAngle * mapping.ywInfluence[1] + zwAngle * mapping.zwInfluence[1];
      const rz = xwAngle * mapping.xwInfluence[2] + ywAngle * mapping.ywInfluence[2] + zwAngle * mapping.zwInfluence[2];

      const rotation = normalizeQuat(eulerToQuat(rx, ry, rz));

      // Small translation offset for secondary motion
      const tx = Math.sin(phase * speeds.XW * 0.7) * 0.02 * Math.abs(mapping.xwInfluence[0]);
      const ty = Math.sin(phase * speeds.YW * 0.5) * 0.01 * Math.abs(mapping.ywInfluence[1]);
      const tz = Math.sin(phase * speeds.ZW * 0.6) * 0.015 * Math.abs(mapping.zwInfluence[2]);

      keyframes.push({
        time: t,
        translation: [tx, ty, tz],
        rotation,
        scale: [1, 1, 1],
      });
    }

    tracks.push({ boneId: bone.id, keyframes });
  }

  return tracks;
}

/**
 * Convert bone animation tracks to a THREE.AnimationClip for the viewer.
 */
export function tracksToAnimationClip(
  tracks: BoneAnimationTrack[],
  name: string = "rt4d-pose"
): any {
  // Build THREE.KeyframeTrack-compatible arrays
  const threeTracks: any[] = [];

  for (const track of tracks) {
    const times = track.keyframes.map((kf) => kf.time);

    // Position track
    const positions = track.keyframes.flatMap((kf) => kf.translation);
    threeTracks.push(
      new (require("three").VectorKeyframeTrack)(
        `${track.boneId}.position`,
        times,
        positions
      )
    );

    // Quaternion track
    const quaternions = track.keyframes.flatMap((kf) => kf.rotation);
    threeTracks.push(
      new (require("three").QuaternionKeyframeTrack)(
        `${track.boneId}.quaternion`,
        times,
        quaternions
      )
    );

    // Scale track
    const scales = track.keyframes.flatMap((kf) => kf.scale);
    threeTracks.push(
      new (require("three").VectorKeyframeTrack)(
        `${track.boneId}.scale`,
        times,
        scales
      )
    );
  }

  const duration = tracks[0]?.keyframes[tracks[0].keyframes.length - 1]?.time ?? 2;
  return new (require("three").AnimationClip)(name, duration, threeTracks);
}
