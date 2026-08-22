/**
 * BoundaryProjection — n_μ, h_μν, project 4D→3D / fields→boundary (Claim A).
 * Wraps projector.mjs SoT. Status: **partial**
 */

import {
  c,
  g_munu,
  staticObserverNormal,
  lowerIndex,
  projectionTensorH,
  projectionTensorHmixed,
  projectWithNormal,
  projectStaticObserver,
  projectNaive,
  inducedMetricHij,
  assertNormalUnit,
  projectorDescriptor,
} from "./projector.mjs";
import { encodeBoundary } from "./boundary.mjs";

export const BOUNDARY_PROJECTION_STATUS = "partial";

export class BoundaryProjection {
  /**
   * @param {{ c?: number }} [opts]
   */
  constructor(opts = {}) {
    this.status = BOUNDARY_PROJECTION_STATUS;
    this.c = opts.c ?? c;
    this.g4 = g_munu;
    this.n_up = staticObserverNormal(this.c);
    this.n_mu = lowerIndex(this.n_up, this.g4);
    this.h_mu_nu = projectionTensorH(this.g4, this.n_up);
    this.h_mixed = projectionTensorHmixed(this.g4, this.n_up);
    this.h_ij = inducedMetricHij(this.g4);
    assertNormalUnit(this.n_up, this.g4);
  }

  /** projectPoint4DTo3D(x_μ) → {x,y,z} via unit-timelike-normal projector */
  projectPoint4DTo3D(x_mu) {
    const p = projectWithNormal(x_mu, this.n_up, this.g4);
    return { x: p.x, y: p.y, z: p.z, asArray: p.asArray };
  }

  projectNaive(x_mu) {
    return projectNaive(x_mu);
  }

  /**
   * Project bulk scalar field onto cube-face BoundaryField3D.
   * @returns {object} encodeBoundary result + projector stamp
   */
  projectField4DToBoundary(f, shape, opts = {}) {
    const scalar = f?.scalar ?? f;
    const boundary = encodeBoundary(scalar, shape, {
      t: opts.t ?? f?.t ?? 0,
      c: this.c,
    });
    return {
      kind: "BoundaryField3D",
      status: BOUNDARY_PROJECTION_STATUS,
      faces: boundary.faces,
      shape: boundary.shape,
      hash: boundary.hash,
      h_ij: this.h_ij,
      n_mu: this.n_mu,
      h_mu_nu: this.h_mu_nu,
      projector: projectorDescriptor(this.c),
      note: "Spatial components via P; time→relationships handled by EGT",
    };
  }
}

export function createBoundaryProjection(opts) {
  return new BoundaryProjection(opts);
}

void projectStaticObserver;
