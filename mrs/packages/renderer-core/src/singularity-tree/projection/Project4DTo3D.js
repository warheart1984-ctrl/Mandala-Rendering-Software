/**
 * Project4DTo3D — the 4D → 3D projection step (§15).
 *
 * Projection occurs after the generative/manifold layers and never modifies
 * the underlying 4D state. Reuses the governed MRS projection math:
 *   classic4Dto3D (closed-form P(θ=φ=τ=κ=0) — matches Projector4D)
 * and the Projector4D 3D→2D closed form for screen coordinates.
 *
 * Coordinate pipeline (explicit, never collapsed):
 *   Generative Space → Node Space → Local Chart Space → Manifold Space
 *   → 3D Projection Space → Render Space
 *
 * Status: enforced (verified by projection tests).
 */

import { classic4Dto3D } from "../../render/rt4d/projection/continuityMath.js";
import { Projector4D } from "../../render/rt4d/output/projector.js";
import { vec4 } from "../../render/rt4d/math/vec4.js";

/**
 * Project manifold mesh vertices (R4) into 3D projection space.
 * @param {object} manifold
 * @param {{d4?:number, width?:number, height?:number, scale?:number}} [camera4D]
 * @returns {{p3: {x,y,z}[], wFactors: number[]}}
 */
export function projectManifoldTo3D(manifold, camera4D = {}) {
  const d4 = camera4D.d4 ?? 4.0;
  const vertices = manifold.mesh ? manifold.mesh.vertices : [];
  const p3 = [];
  const wFactors = [];
  for (const v of vertices) {
    const p = classic4Dto3D(v, d4);
    p3.push(p);
    wFactors.push(d4 / (d4 + v.w));
  }
  return { p3, wFactors };
}

/**
 * Project manifold mesh vertices all the way to render-space screen points.
 * @returns {{screen: {sx:number,sy:number}[], p3: {x,y,z}[], wFactors: number[]}}
 */
export function projectManifoldToScreen(manifold, camera4D = {}) {
  const { d4, width, height, scale, bgColor } = {
    d4: 4.0,
    width: 1920,
    height: 1080,
    scale: 320,
    bgColor: null,
    ...camera4D,
  };
  const { p3, wFactors } = projectManifoldTo3D(manifold, { d4 });
  const projector = new Projector4D({ d4, width, height, scale, bgColor: bgColor || vec4(0, 0, 0, 1) });
  const screen = p3.map((p) => projector.project3Dto2D(vec4(p.x, p.y, p.z, 0)));
  return { screen, p3, wFactors };
}

/**
 * Project a single 4D state (e.g. a hierarchy node state) to 3D.
 */
export function project4DTo3D(point, camera4D = {}) {
  return classic4Dto3D(point, camera4D.d4 ?? 4.0);
}

export const PROJECTION_LAYER_ID = "projection.classic-4dto3d.v1";