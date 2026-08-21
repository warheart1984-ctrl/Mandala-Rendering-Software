/**
 * Simulation Chamber RHFD hook — actors/props are lattice defects; motion is ∇V *in law*.
 *
 * Status: **partial**
 *   - Framing + report are real.
 *   - Default cinematic solver is mandala-proto (certified −∇φ on actors). `--solver pose` is beat lerp.
 *   - Capsules vs char_rigged.glb: mesh consume is still partial.
 *   - Beats that do not move report surrogate |F|≈0 (honest idle vacuum).
 *   - character/sim cloth/hair is a CPU stand-in, not RHFD.
 *
 * Organ Map: Mandala (pixels) + Simulation Chamber (motion). No new organ.
 */

export const CHAMBER_GRAD_V_STATUS = "partial";
/** Explicit cinematic fallback (`--solver pose`). Proto default is `cpu_reference_transport`. */
export const MOTION_DRIVER_ACTUAL = "pose_interpolation";
export const MOTION_DRIVER_POSE = MOTION_DRIVER_ACTUAL;
export const MOTION_DRIVER_PROTO = "cpu_reference_transport";

export function describeChamberSubstrate({
  actors = [],
  characterGlb = false,
  motionDriver = MOTION_DRIVER_ACTUAL,
} = {}) {
  const proto = motionDriver === MOTION_DRIVER_PROTO;
  return {
    organ: "Simulation Chamber",
    pixelsOrgan: "Mandala",
    mapping: "actor/prop = petal rupture (defect); intended motion driver = ∇V",
    motionDriverActual: motionDriver,
    solverHook: proto
      ? "default --solver mandala-proto maps certified −∇φ defect walk onto actor world positions; --solver pose restores beat lerp"
      : "cinematic fallback --solver pose (pose_interpolation / notGradV); pass --solver mandala-proto for certified defect transport",
    gradVStatus: proto ? "partial" : CHAMBER_GRAD_V_STATUS,
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
    moebius: proto
      ? "defects = inconsistent hex loops / potential wells; proto integrator walks −∇φ"
      : "defects = inconsistent hex loops / potential wells; pose path does not integrate them",
    note: proto
      ? "Actor world translation comes from certified defect delta. Limb pose / emissive may still follow beats."
      : "Beats that do not change position report surrogate |F|≈0. Pose path does not integrate an energy gradient.",
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

export function attachDefectTick(actor, dt, { fromGradV = false } = {}) {
  if (!actor._prevPosition) actor._prevPosition = [...(actor.position || [0, 0, 0, 0])];
  const report = surrogateForce(actor._prevPosition, actor.position, dt);
  if (fromGradV) {
    report.notGradV = false;
    report.kind = "certified_defect_transport";
    report.driver = MOTION_DRIVER_PROTO;
  }
  actor.kind = "defect";
  actor._rhfd = {
    kind: "defect",
    petalRupture: true,
    surrogateForce: report,
    gradVStatus: fromGradV ? "partial" : CHAMBER_GRAD_V_STATUS,
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
    ...describeChamberSubstrate({
      actors,
      characterGlb: extra.characterGlb,
      motionDriver: extra.motionDriverActual || extra.motionDriver,
    }),
    meanSurrogateMag: meanSurrogateMag(actors),
    ticks: extra.ticks ?? null,
    ...extra,
  };
}
