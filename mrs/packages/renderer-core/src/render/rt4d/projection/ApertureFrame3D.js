/**
 * ApertureFrame3D — viewport-as-aperture API (governed observation layer).
 *
 * BANNER: Governed observation aperture — assist/preview only; CPU RT4D print
 * remains SoT. Projector4D (`rt4d/output/projector.js`) is the mathematical /
 * print projection source of truth. Aperture ≠ print. Never route aperture
 * frames into Digital Printer / print pipelines.
 *
 * Status: partial → suite-proven metadata + direction sampling (test-enforced).
 */

import { createProjectionState } from "./ProjectionState.js";
import { applyViewOrientation } from "./continuityMath.js";

/**
 * @typedef {object} ViewportRect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {object} ApertureFrame3D
 * @property {{x:number,y:number,z:number}} origin
 * @property {{x:number,y:number,z:number}} axisX
 * @property {{x:number,y:number,z:number}} axisY
 * @property {{x:number,y:number,z:number}} axisZ
 * @property {ViewportRect} viewport
 * @property {number} nearHint
 * @property {number} focalHint
 * @property {"observation_aperture"} role
 * @property {false} printSoT
 * @property {"observation"} authority
 * @property {string} banner
 * @property {"partial"|"enforced"|"declared"} status
 */

export const APERTURE_SOT_BANNER =
  "Governed observation aperture — assist/preview only; CPU RT4D print remains SoT.";

/**
 * Build an aperture frame from ProjCC state + viewport rectangle.
 * Role is always "observation_aperture" — never "print_sot".
 *
 * @param {import("./ProjectionState.js").ProjectionStateInit|ReturnType<typeof createProjectionState>} stateInit
 * @param {ViewportRect} viewport
 * @returns {Readonly<ApertureFrame3D>}
 */
export function createApertureFrame3D(stateInit, viewport) {
  const state = createProjectionState(stateInit);
  if (!(viewport.width > 0) || !(viewport.height > 0)) {
    throw new RangeError("ApertureFrame3D viewport width/height must be > 0");
  }

  const forward = applyViewOrientation({ x: 0, y: 0, z: 1 }, state.theta, state.phi);
  const right = applyViewOrientation({ x: 1, y: 0, z: 0 }, state.theta, state.phi);
  const up = applyViewOrientation({ x: 0, y: 1, z: 0 }, state.theta, state.phi);

  const focalHint = state.d3 * (1 + 0.1 * state.kappa);
  const nearHint = Math.max(1e-3, 0.01 * focalHint);

  return Object.freeze({
    origin: Object.freeze({ x: 0, y: 0, z: 0 }),
    axisX: Object.freeze(right),
    axisY: Object.freeze(up),
    axisZ: Object.freeze(forward),
    viewport: Object.freeze({
      x: viewport.x,
      y: viewport.y,
      width: viewport.width,
      height: viewport.height,
    }),
    nearHint,
    focalHint,
    role: /** @type {const} */ ("observation_aperture"),
    printSoT: /** @type {const} */ (false),
    authority: /** @type {const} */ ("observation"),
    banner: APERTURE_SOT_BANNER,
    status: /** @type {const} */ ("enforced"),
    projectionModeId: state.modeId,
    tau: state.tau,
    kappa: state.kappa,
  });
}

/**
 * Map normalized viewport UV in [0,1]^2 to a ray direction in aperture space.
 * Observation assist only — not a print primary-ray SoT.
 *
 * @param {ApertureFrame3D} frame
 * @param {number} u
 * @param {number} v
 */
export function apertureSampleDirection(frame, u, v) {
  const nx = (u - 0.5) * 2;
  const ny = (v - 0.5) * 2;
  const x = frame.axisX.x * nx + frame.axisY.x * ny + frame.axisZ.x;
  const y = frame.axisX.y * nx + frame.axisY.y * ny + frame.axisZ.y;
  const z = frame.axisX.z * nx + frame.axisY.z * ny + frame.axisZ.z;
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}
