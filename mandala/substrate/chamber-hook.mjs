/**
 * Simulation Chamber RHFD hook — actors/props are lattice defects; motion is ∇V *in law*.
 *
 * Status: **partial**
 *   - Framing + report are real.
 *   - Chamber still interpolates beats (lerp + poseForBeat). That is not ∇V.
 *   - Capsules vs char_rigged.glb: mesh consume is still partial.
 *   - Beats that do not move report surrogate |F|≈0 (honest idle vacuum).
 *   - character/sim cloth/hair is a CPU stand-in, not RHFD.
 *
 * Organ Map: Mandala (pixels) + Simulation Chamber (motion). No new organ.
 */

export const CHAMBER_GRAD_V_STATUS = "partial";
export const MOTION_DRIVER_ACTUAL = "pose_interpolation";

export function describeChamberSubstrate({
  actors = [],
  characterGlb = false,
} = {}) {
  return {
    organ: "Simulation Chamber",
    pixelsOrgan: "Mandala",
    mapping: "actor/prop = petal rupture (defect); intended motion driver = ∇V",
    motionDriverActual: MOTION_DRIVER_ACTUAL,
    gradVStatus: CHAMBER_GRAD_V_STATUS,
    defects: actors.map((a) => ({
      kind: "defect",
      id: a.id,
      name: a.name || a.id,
      position: a.position ? [...a.position] : null,
      source: characterGlb ? "character_glb_contract" : "capsule_humanoid",
    })),
    characterMesh: characterGlb
      ? "char_rigged.glb plug-in; RT4D still traces capsules until a mesh adapter lands"
      : "scripts/humanoid-avatar.mjs capsules",
    clothHair: "character/sim is CPU stand-in, not RHFD ∇V / cloth",
    idleBeatsKeepGradVNearZero: true,
    moebius: "defects = inconsistent hex loops / potential wells; Chamber does not integrate them",
    note: "Beats that do not change position report surrogate |F|≈0. Chamber does not integrate an energy gradient.",
  };
}

/**
 * Pose-delta surrogate. Tagged notGradV — do not treat as physics.
 */
export function surrogateForce(prevPos, pos, dt) {
  const prev = prevPos || pos || [0, 0, 0, 0];
  const cur = pos || prev;
  const force = [0, 0, 0, 0];
  if (dt > 0) {
    for (let i = 0; i < 4; i++) force[i] = ((cur[i] || 0) - (prev[i] || 0)) / dt;
  }
  const mag = Math.hypot(force[0], force[1], force[2], force[3]);
  return {
    kind: "pose_delta_surrogate",
    notGradV: true,
    force,
    mag,
  };
}

export function attachDefectTick(actor, dt) {
  if (!actor._prevPosition) actor._prevPosition = [...(actor.position || [0, 0, 0, 0])];
  const report = surrogateForce(actor._prevPosition, actor.position, dt);
  actor.kind = "defect";
  actor._rhfd = {
    kind: "defect",
    petalRupture: true,
    surrogateForce: report,
    gradVStatus: CHAMBER_GRAD_V_STATUS,
  };
  actor._prevPosition = [...(actor.position || actor._prevPosition)];
  return report;
}

export function meanSurrogateMag(actors) {
  if (!actors.length) return 0;
  let s = 0;
  for (const a of actors) s += a._rhfd?.surrogateForce?.mag ?? 0;
  return s / actors.length;
}

export function writeChamberReport(actors, extra = {}) {
  return {
    ...describeChamberSubstrate({ actors, characterGlb: extra.characterGlb }),
    meanSurrogateMag: meanSurrogateMag(actors),
    ticks: extra.ticks ?? null,
    ...extra,
  };
}
