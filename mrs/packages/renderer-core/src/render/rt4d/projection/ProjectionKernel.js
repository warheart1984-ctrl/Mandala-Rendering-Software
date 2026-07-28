/**
 * ProjectionKernel — ProjCC evaluation surface over Projector4D SoT.
 *
 * SoT: `rt4d/output/projector.js` (Projector4D) remains the mathematical /
 * print projection source of truth. This kernel is a governed continuity layer
 * on top — not a second SoT and not a beauty / Digital Printer path.
 *
 * Aperture ≠ print: observation params (θ,φ,τ,κ) do not replace CPU RT4D print.
 *
 * Status: enforced where continuity / fidelity / round-trip / extreme-param
 * suites prove; runtime CKL gate is separate (partial).
 */

import { Projector4D } from "../output/projector.js";
import { createProjectionState, toProjectorOptions } from "./ProjectionState.js";
import {
  evaluateContinuousP,
  projectPointContinuous,
  projectPointContinuousSafe,
  classic4Dto3D,
} from "./continuityMath.js";

export const PROJECTION_KERNEL_SOT_BANNER =
  "ProjectionKernel is a governed continuity layer; Projector4D (rt4d/output/projector.js) is math/print SoT. Aperture ≠ print.";

export class ProjectionKernel {
  /**
   * @param {import("./ProjectionState.js").ProjectionStateInit} [initial]
   */
  constructor(initial = {}) {
    this._state = createProjectionState(initial);
    this.printSoT = false;
    this.authority = "observation";
    this.sotBanner = PROJECTION_KERNEL_SOT_BANNER;
  }

  /** @returns {ReturnType<typeof createProjectionState>} */
  get state() {
    return this._state;
  }

  /**
   * @param {import("./ProjectionState.js").ProjectionStateInit} patch
   */
  setState(patch) {
    this._state = createProjectionState({ ...this._state, ...patch });
    return this._state;
  }

  /**
   * Frozen snapshot for reversible round-trip.
   * @returns {ReturnType<typeof createProjectionState>}
   */
  snapshotState() {
    return this._state;
  }

  /**
   * Restore a prior snapshot (reversible state).
   * @param {ReturnType<typeof createProjectionState>|import("./ProjectionState.js").ProjectionStateInit} snap
   */
  restoreState(snap) {
    this._state = createProjectionState({ ...snap });
    return this._state;
  }

  /**
   * @param {number} theta
   * @param {number} phi
   * @param {number} tau
   * @param {number} kappa
   * @param {import("./ProjectionState.js").ProjectionStateInit} [base]
   */
  evaluateP(theta, phi, tau, kappa, base = {}) {
    this._state = evaluateContinuousP(theta, phi, tau, kappa, {
      ...toProjectorOptions(this._state),
      modeId: this._state.modeId,
      intentId: this._state.intentId,
      ...base,
    });
    return this._state;
  }

  /**
   * @param {{x:number,y:number,z:number,w:number}} point
   */
  project(point) {
    return projectPointContinuous(point, this._state);
  }

  /**
   * Graceful projection under extreme θ,φ,τ,κ — always finite; may clamp.
   * @param {{x:number,y:number,z:number,w:number}} point
   */
  projectSafe(point) {
    return projectPointContinuousSafe(point, this._state);
  }

  /** Backing classic projector for fidelity comparisons (math SoT). */
  createProjector4D() {
    return new Projector4D(toProjectorOptions(this._state));
  }

  /**
   * Identity-check helper: classic closed form at zero continuous params.
   * @param {{x:number,y:number,z:number,w:number}} point
   */
  classicProject3D(point) {
    return classic4Dto3D(point, this._state.d4);
  }
}

export { createProjectionState, toProjectorOptions, evaluateContinuousP, projectPointContinuous };
