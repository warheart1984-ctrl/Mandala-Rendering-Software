/**
 * HumanoidAvatar — builds a 3D humanoid figure from 4D primitives.
 *
 * Composition:
 *   Head:      Hypersphere (small, top)
 *   Neck:      OrientedCapsule (short connector)
 *   Torso:     OrientedCapsule (vertical, main body)
 *   Upper arms: OrientedCapsule (angled from shoulders)
 *   Lower arms: OrientedCapsule (extending from elbows)
 *   Upper legs: OrientedCapsule (extending down from hips)
 *   Lower legs: OrientedCapsule (extending from knees)
 *   Hands:     Hypersphere (small spheres at wrist)
 *   Feet:      Hypersphere (small spheres at ankle)
 *
 * Each part is a separate primitive that can be repositioned per tick.
 * The avatar is a "ragdoll" — pose drives joint positions.
 */
import { Hypersphere, OrientedCapsule } from "../mrs/packages/renderer-core/src/render/rt4d/geometry/hypersurface.js";
import { vec4 } from "../mrs/packages/renderer-core/src/render/rt4d/math/vec4.js";

// Default proportions (relative to height)
export const PROPORTIONS = {
  headRadius: 0.15,
  neckLength: 0.08,
  torsoTop: 0.35,      // y offset from base
  torsoBottom: 0.0,
  shoulderWidth: 0.22,
  upperArmLength: 0.2,
  lowerArmLength: 0.18,
  handRadius: 0.06,
  hipWidth: 0.12,
  upperLegLength: 0.22,
  lowerLegLength: 0.2,
  footRadius: 0.07,
  limbRadius: 0.04,
};

/**
 * Compute joint positions from a pose.
 * @param {Object} pose - joint angles and offsets
 * @param {number} baseY - vertical base position
 * @returns {Object} joint positions as vec4-compatible {x,y,z,w}
 */
export function computeJoints(pose, baseY = 0, origin = [0, 0, 0, 0]) {
  const p = PROPORTIONS;
  const armAngle = pose.armAngle || 0;       // radians from body
  const armSwing = pose.armSwing || 0;        // forward/back swing
  const legSpread = pose.legSpread || 0;      // radians outward
  const legSwing = pose.legSwing || 0;        // forward/back swing
  const headTilt = pose.headTilt || 0;        // radians tilt forward
  const bodyLean = pose.bodyLean || 0;        // lean forward
  const ox = origin[0] || 0;
  const oz = origin[2] || 0;
  const w = (origin[3] ?? pose.w) || 0;       // 4th dimension offset

  // Torso (origin.x/z place the actor in the world)
  const torsoTop = { x: ox + Math.sin(bodyLean) * 0.05, y: baseY + p.torsoTop, z: oz, w };
  const torsoBottom = { x: ox, y: baseY + p.torsoBottom, z: oz, w };

  // Neck and head
  const neckTop = { x: torsoTop.x, y: torsoTop.y + p.neckLength, z: oz, w };
  const head = { x: neckTop.x + Math.sin(headTilt) * 0.05, y: neckTop.y + p.headRadius * 1.2, z: oz, w };

  // Shoulders
  const lShoulder = { x: torsoTop.x - p.shoulderWidth, y: torsoTop.y - 0.02, z: oz, w };
  const rShoulder = { x: torsoTop.x + p.shoulderWidth, y: torsoTop.y - 0.02, z: oz, w };

  // Upper arms
  const lElbow = {
    x: lShoulder.x - Math.sin(armAngle) * p.upperArmLength,
    y: lShoulder.y - Math.cos(armAngle) * p.upperArmLength * 0.3 + armSwing * 0.1,
    z: oz + armSwing * p.upperArmLength * 0.5,
    w,
  };
  const rElbow = {
    x: rShoulder.x + Math.sin(armAngle) * p.upperArmLength,
    y: rShoulder.y - Math.cos(armAngle) * p.upperArmLength * 0.3 - armSwing * 0.1,
    z: oz - armSwing * p.upperArmLength * 0.5,
    w,
  };

  // Lower arms (hands hang down slightly)
  const lHand = {
    x: lElbow.x - Math.sin(armAngle * 0.5) * p.lowerArmLength * 0.5,
    y: lElbow.y - p.lowerArmLength * 0.8,
    z: lElbow.z + armSwing * 0.05,
    w,
  };
  const rHand = {
    x: rElbow.x + Math.sin(armAngle * 0.5) * p.lowerArmLength * 0.5,
    y: rElbow.y - p.lowerArmLength * 0.8,
    z: rElbow.z - armSwing * 0.05,
    w,
  };

  // Hips
  const lHip = { x: torsoBottom.x - p.hipWidth, y: torsoBottom.y, z: oz, w };
  const rHip = { x: torsoBottom.x + p.hipWidth, y: torsoBottom.y, z: oz, w };

  // Upper legs
  const lKnee = {
    x: lHip.x - Math.sin(legSpread) * p.upperLegLength * 0.3,
    y: lHip.y - p.upperLegLength * 0.9,
    z: oz + legSwing * p.upperLegLength * 0.3,
    w,
  };
  const rKnee = {
    x: rHip.x + Math.sin(legSpread) * p.upperLegLength * 0.3,
    y: rHip.y - p.upperLegLength * 0.9,
    z: oz - legSwing * p.upperLegLength * 0.3,
    w,
  };

  // Lower legs (feet)
  const lFoot = {
    x: lKnee.x,
    y: lKnee.y - p.lowerLegLength,
    z: lKnee.z + 0.03,
    w,
  };
  const rFoot = {
    x: rKnee.x,
    y: rKnee.y - p.lowerLegLength,
    z: rKnee.z - 0.03,
    w,
  };

  return {
    head, neckTop, torsoTop, torsoBottom,
    lShoulder, rShoulder, lElbow, rElbow, lHand, rHand,
    lHip, rHip, lKnee, rKnee, lFoot, rFoot,
  };
}

function v4(j) { return vec4(j.x, j.y, j.z, j.w); }

/**
 * Build all primitives for a humanoid at a given pose.
 * Returns { primitives: [{primitive, materialId}], joints: {...} }
 */
export function buildHumanoidPrimitives(pose, materialId, baseY = 0, origin = [0, 0, 0, 0]) {
  const j = computeJoints(pose, baseY, origin);
  const r = PROPORTIONS.limbRadius;
  const primitives = [];

  // Head
  primitives.push({ primitive: new Hypersphere(v4(j.head), PROPORTIONS.headRadius), materialId });

  // Neck
  primitives.push({ primitive: new OrientedCapsule(v4(j.neckTop), v4(j.torsoTop), r * 0.8), materialId });

  // Torso
  primitives.push({ primitive: new OrientedCapsule(v4(j.torsoTop), v4(j.torsoBottom), r * 2.5), materialId });

  // Upper arms
  primitives.push({ primitive: new OrientedCapsule(v4(j.lShoulder), v4(j.lElbow), r), materialId });
  primitives.push({ primitive: new OrientedCapsule(v4(j.rShoulder), v4(j.rElbow), r), materialId });

  // Lower arms
  primitives.push({ primitive: new OrientedCapsule(v4(j.lElbow), v4(j.lHand), r * 0.8), materialId });
  primitives.push({ primitive: new OrientedCapsule(v4(j.rElbow), v4(j.rHand), r * 0.8), materialId });

  // Hands
  primitives.push({ primitive: new Hypersphere(v4(j.lHand), PROPORTIONS.handRadius), materialId });
  primitives.push({ primitive: new Hypersphere(v4(j.rHand), PROPORTIONS.handRadius), materialId });

  // Upper legs
  primitives.push({ primitive: new OrientedCapsule(v4(j.lHip), v4(j.lKnee), r * 1.1), materialId });
  primitives.push({ primitive: new OrientedCapsule(v4(j.rHip), v4(j.rKnee), r * 1.1), materialId });

  // Lower legs
  primitives.push({ primitive: new OrientedCapsule(v4(j.lKnee), v4(j.lFoot), r * 0.9), materialId });
  primitives.push({ primitive: new OrientedCapsule(v4(j.rKnee), v4(j.rFoot), r * 0.9), materialId });

  // Feet
  primitives.push({ primitive: new Hypersphere(v4(j.lFoot), PROPORTIONS.footRadius), materialId });
  primitives.push({ primitive: new Hypersphere(v4(j.rFoot), PROPORTIONS.footRadius), materialId });

  return { primitives, joints: j };
}

/**
 * Generate a walking pose at time t.
 */
export function walkPose(t, speed = 1) {
  const cycle = t * speed * 2;
  return {
    armAngle: 0.3,
    armSwing: Math.sin(cycle) * 0.5,
    legSpread: 0.15,
    legSwing: Math.sin(cycle) * 0.4,
    headTilt: Math.sin(cycle * 0.5) * 0.08,
    bodyLean: 0.08,
  };
}

/**
 * Generate a standing pose with breathing motion.
 */
export function standPose(t) {
  return {
    armAngle: 0.1,
    armSwing: Math.sin(t * 1.5) * 0.05,
    legSpread: 0.05,
    legSwing: 0,
    headTilt: Math.sin(t * 0.8) * 0.03,
    bodyLean: Math.sin(t * 1.2) * 0.02,
  };
}

/**
 * Generate a gesturing pose (arm raised).
 */
export function gesturePose(t, arm = "right") {
  const raise = Math.min(1, Math.max(0, (t % 3) / 0.5));
  return {
    armAngle: arm === "right" ? 1.4 * raise : 0.1,
    armSwing: arm === "left" ? Math.sin(t * 2) * 0.3 : 0,
    legSpread: 0.08,
    legSwing: 0,
    headTilt: 0.15 * raise,
    bodyLean: 0.08 * raise,
  };
}

/**
 * Generate a listening pose (head tilted, still).
 */
export function listenPose(t) {
  return {
    armAngle: 0.05,
    armSwing: 0,
    legSpread: 0.08,
    legSwing: 0,
    headTilt: 0.25,
    bodyLean: -0.05,
  };
}

/**
 * Generate a speaking pose (animated gestures).
 */
export function speakPose(t) {
  const wave = Math.sin(t * 3) * 0.3;
  return {
    armAngle: 0.6,
    armSwing: wave,
    legSpread: 0.1,
    legSwing: 0,
    headTilt: Math.sin(t * 2) * 0.1,
    bodyLean: 0.05,
  };
}

/**
 * Generate a reaching pose (toward a target).
 */
export function reachPose(t, targetX = 0) {
  const reach = Math.min(1, Math.max(0, (t % 4) / 0.8));
  return {
    armAngle: 1.0 * reach,
    armSwing: Math.sin(t * 2) * 0.2,
    legSpread: 0.12,
    legSwing: 0,
    headTilt: 0.1 * reach,
    bodyLean: 0.1 * reach * Math.sign(targetX),
  };
}

/**
 * Generate a dramatic pose (arms wide, body back).
 */
export function dramaticPose(t) {
  const pulse = Math.sin(t * 1.5) * 0.1;
  return {
    armAngle: 1.5,
    armSwing: pulse,
    legSpread: 0.2,
    legSwing: 0,
    headTilt: -0.1,
    bodyLean: -0.1,
  };
}

/**
 * Generate a curious pose (leaning forward, arms out).
 */
export function curiousPose(t) {
  return {
    armAngle: 0.4,
    armSwing: Math.sin(t * 2) * 0.15,
    legSpread: 0.08,
    legSwing: 0,
    headTilt: 0.2,
    bodyLean: 0.15,
  };
}

/**
 * Map beat action to a pose.
 */
export function poseForBeat(action, time) {
  switch (action) {
    case "appear": return standPose(time);
    case "glow": return standPose(time);
    case "speak": return speakPose(time);
    case "walk": return walkPose(time);
    case "move": return walkPose(time);
    case "listen": return listenPose(time);
    case "gesture": return gesturePose(time, "right");
    case "reach": return reachPose(time);
    case "draw": return reachPose(time, 1);
    case "mix": return gesturePose(time, "right");
    case "dramatic": return dramaticPose(time);
    case "curious": return curiousPose(time);
    case "exit": return standPose(time);
    default: return standPose(time);
  }
}
