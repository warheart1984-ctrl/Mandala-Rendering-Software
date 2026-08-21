/**
 * Animation-ready armature.
 *
 * Bones: root, hips, spine, chest, neck, head, shoulders, arms, hands,
 * fingers, legs, tail. Matches the user Stage-2 contract.
 *
 * STATUS: enforced (bind pose + hierarchy). Production weight-paint polish: partial.
 */
export const BONE_ORDER = Object.freeze([
  "root",
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "shoulder.L", "upperArm.L", "lowerArm.L", "hand.L",
  "thumb.L.1", "thumb.L.2",
  "index.L.1", "index.L.2", "index.L.3",
  "middle.L.1", "middle.L.2", "middle.L.3",
  "ring.L.1", "ring.L.2", "ring.L.3",
  "pinky.L.1", "pinky.L.2", "pinky.L.3",
  "shoulder.R", "upperArm.R", "lowerArm.R", "hand.R",
  "thumb.R.1", "thumb.R.2",
  "index.R.1", "index.R.2", "index.R.3",
  "middle.R.1", "middle.R.2", "middle.R.3",
  "ring.R.1", "ring.R.2", "ring.R.3",
  "pinky.R.1", "pinky.R.2", "pinky.R.3",
  "upperLeg.L", "lowerLeg.L", "foot.L",
  "upperLeg.R", "lowerLeg.R", "foot.R",
  "tail.1", "tail.2", "tail.3", "tail.4",
]);

function bone(id, parent, head, tail) {
  return { id, parent, head, tail };
}

/**
 * Bind-pose armature in the same space as `buildQuadHumanoid`.
 * @param {"human"|"anthro"} species
 */
export function buildArmature(species = "human") {
  const anthro = species === "anthro";
  const bones = [
    bone("root", null, [0, 0, 0], [0, 0.02, 0]),
    bone("hips", "root", [0, 0.95, 0], [0, 1.10, 0]),
    bone("spine", "hips", [0, 1.10, 0], [0, 1.38, 0]),
    bone("chest", "spine", [0, 1.38, 0], [0, 1.62, 0]),
    bone("neck", "chest", [0, 1.68, 0], [0, 1.86, 0]),
    bone("head", "neck", [0, 1.86, 0], [0, 2.10, 0.02]),
    bone("shoulder.L", "chest", [-0.18, 1.64, 0], [-0.22, 1.64, 0]),
    bone("upperArm.L", "shoulder.L", [-0.22, 1.64, 0], [-0.24, 1.28, 0.02]),
    bone("lowerArm.L", "upperArm.L", [-0.24, 1.28, 0.02], [-0.26, 0.98, 0.04]),
    bone("hand.L", "lowerArm.L", [-0.26, 0.98, 0.04], [-0.27, 0.84, 0.06]),
    bone("thumb.L.1", "hand.L", [-0.24, 0.90, 0.09], [-0.22, 0.86, 0.11]),
    bone("thumb.L.2", "thumb.L.1", [-0.22, 0.86, 0.11], [-0.21, 0.82, 0.13]),
    bone("index.L.1", "hand.L", [-0.27, 0.84, 0.03], [-0.27, 0.80, 0.04]),
    bone("index.L.2", "index.L.1", [-0.27, 0.80, 0.04], [-0.27, 0.76, 0.05]),
    bone("index.L.3", "index.L.2", [-0.27, 0.76, 0.05], [-0.27, 0.72, 0.05]),
    bone("middle.L.1", "hand.L", [-0.27, 0.84, 0.05], [-0.27, 0.79, 0.06]),
    bone("middle.L.2", "middle.L.1", [-0.27, 0.79, 0.06], [-0.27, 0.75, 0.07]),
    bone("middle.L.3", "middle.L.2", [-0.27, 0.75, 0.07], [-0.27, 0.71, 0.07]),
    bone("ring.L.1", "hand.L", [-0.27, 0.84, 0.07], [-0.27, 0.80, 0.08]),
    bone("ring.L.2", "ring.L.1", [-0.27, 0.80, 0.08], [-0.27, 0.76, 0.08]),
    bone("ring.L.3", "ring.L.2", [-0.27, 0.76, 0.08], [-0.27, 0.73, 0.09]),
    bone("pinky.L.1", "hand.L", [-0.27, 0.84, 0.09], [-0.27, 0.80, 0.09]),
    bone("pinky.L.2", "pinky.L.1", [-0.27, 0.80, 0.09], [-0.27, 0.77, 0.10]),
    bone("pinky.L.3", "pinky.L.2", [-0.27, 0.77, 0.10], [-0.27, 0.74, 0.10]),
    bone("shoulder.R", "chest", [0.18, 1.64, 0], [0.22, 1.64, 0]),
    bone("upperArm.R", "shoulder.R", [0.22, 1.64, 0], [0.24, 1.28, 0.02]),
    bone("lowerArm.R", "upperArm.R", [0.24, 1.28, 0.02], [0.26, 0.98, 0.04]),
    bone("hand.R", "lowerArm.R", [0.26, 0.98, 0.04], [0.27, 0.84, 0.06]),
    bone("thumb.R.1", "hand.R", [0.24, 0.90, 0.09], [0.22, 0.86, 0.11]),
    bone("thumb.R.2", "thumb.R.1", [0.22, 0.86, 0.11], [0.21, 0.82, 0.13]),
    bone("index.R.1", "hand.R", [0.27, 0.84, 0.03], [0.27, 0.80, 0.04]),
    bone("index.R.2", "index.R.1", [0.27, 0.80, 0.04], [0.27, 0.76, 0.05]),
    bone("index.R.3", "index.R.2", [0.27, 0.76, 0.05], [0.27, 0.72, 0.05]),
    bone("middle.R.1", "hand.R", [0.27, 0.84, 0.05], [0.27, 0.79, 0.06]),
    bone("middle.R.2", "middle.R.1", [0.27, 0.79, 0.06], [0.27, 0.75, 0.07]),
    bone("middle.R.3", "middle.R.2", [0.27, 0.75, 0.07], [0.27, 0.71, 0.07]),
    bone("ring.R.1", "hand.R", [0.27, 0.84, 0.07], [0.27, 0.80, 0.08]),
    bone("ring.R.2", "ring.R.1", [0.27, 0.80, 0.08], [0.27, 0.76, 0.08]),
    bone("ring.R.3", "ring.R.2", [0.27, 0.76, 0.08], [0.27, 0.73, 0.09]),
    bone("pinky.R.1", "hand.R", [0.27, 0.84, 0.09], [0.27, 0.80, 0.09]),
    bone("pinky.R.2", "pinky.R.1", [0.27, 0.80, 0.09], [0.27, 0.77, 0.10]),
    bone("pinky.R.3", "pinky.R.2", [0.27, 0.77, 0.10], [0.27, 0.74, 0.10]),
    bone("upperLeg.L", "hips", [-0.09, 0.92, 0], [-0.09, 0.50, 0.02]),
    bone("lowerLeg.L", "upperLeg.L", [-0.09, 0.50, 0.02], [-0.09, 0.12, 0]),
    bone("foot.L", "lowerLeg.L", [-0.09, 0.12, 0], [-0.09, 0.04, 0.10]),
    bone("upperLeg.R", "hips", [0.09, 0.92, 0], [0.09, 0.50, 0.02]),
    bone("lowerLeg.R", "upperLeg.R", [0.09, 0.50, 0.02], [0.09, 0.12, 0]),
    bone("foot.R", "lowerLeg.R", [0.09, 0.12, 0], [0.09, 0.04, 0.10]),
    bone("tail.1", "hips", [0, 0.98, -0.12], [0, anthro ? 0.94 : 0.97, anthro ? -0.26 : -0.16]),
    bone("tail.2", "tail.1", [0, anthro ? 0.94 : 0.97, anthro ? -0.26 : -0.16], [0, anthro ? 0.88 : 0.96, anthro ? -0.40 : -0.18]),
    bone("tail.3", "tail.2", [0, anthro ? 0.88 : 0.96, anthro ? -0.40 : -0.18], [0, anthro ? 0.82 : 0.95, anthro ? -0.54 : -0.19]),
    bone("tail.4", "tail.3", [0, anthro ? 0.82 : 0.95, anthro ? -0.54 : -0.19], [0, anthro ? 0.78 : 0.94, anthro ? -0.68 : -0.20]),
  ];

  const byId = Object.fromEntries(bones.map((b) => [b.id, b]));
  return {
    species,
    bones,
    byId,
    boneIds: bones.map((b) => b.id),
    polylines: bones.map((b) => [b.head, b.tail]),
  };
}

export function requiredBoneGroups(armature) {
  const ids = new Set(armature.boneIds);
  return {
    spine: ["spine", "chest", "neck"].every((id) => ids.has(id)),
    shoulders: ids.has("shoulder.L") && ids.has("shoulder.R"),
    hips: ids.has("hips"),
    tail: ["tail.1", "tail.2", "tail.3", "tail.4"].every((id) => ids.has(id)),
    fingers: ids.has("index.L.1") && ids.has("index.R.1") && ids.has("thumb.L.1"),
  };
}

/** Identity inverse-bind (column-major 4x4) translating bind head to origin. */
export function inverseBindMatrices(armature) {
  return armature.bones.map((b) => {
    const [x, y, z] = b.head;
    return [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      -x, -y, -z, 1,
    ];
  });
}
