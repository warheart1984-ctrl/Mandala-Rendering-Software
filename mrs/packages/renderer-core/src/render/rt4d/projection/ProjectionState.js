/**
 * ProjectionState — frozen observation + projector parameters for ProjCC.
 *
 * SoT: Projector4D (`rt4d/output/projector.js`) remains math/print SoT.
 * This state drives the governed continuity / observation aperture layer only.
 * Aperture ≠ print.
 *
 * Status: partial (object contract + tests); charter CKL gate not claimed.
 */

/** @typedef {"declared"|"partial"|"enforced"|"skeleton"} CapabilityStatus */

/**
 * @typedef {object} ProjectionStateInit
 * @property {number} [d4]
 * @property {number} [d3]
 * @property {number} [scale]
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [theta]
 * @property {number} [phi]
 * @property {number} [tau]
 * @property {number} [kappa]
 * @property {string} [modeId]
 * @property {string|null} [intentId]
 * @property {CapabilityStatus} [status]
 */

/**
 * @param {ProjectionStateInit} [init]
 * @returns {Readonly<Required<ProjectionStateInit>>}
 */
export function createProjectionState(init = {}) {
  const kappa = init.kappa ?? 0;
  if (!(kappa >= 0) || !Number.isFinite(kappa)) {
    throw new RangeError("ProjectionState.kappa must be a finite number >= 0");
  }
  const d4 = init.d4 ?? 4;
  const d3 = init.d3 ?? 4;
  if (!(d4 > 0) || !(d3 > 0)) {
    throw new RangeError("ProjectionState.d4 and d3 must be > 0");
  }

  return Object.freeze({
    d4,
    d3,
    scale: init.scale ?? 80,
    width: init.width ?? 1920,
    height: init.height ?? 1080,
    theta: init.theta ?? 0,
    phi: init.phi ?? 0,
    tau: init.tau ?? 0,
    kappa,
    modeId: init.modeId ?? "perspective_w",
    intentId: init.intentId ?? null,
    // Never self-assert enforced — callers/tests promote status.
    status: init.status ?? "partial",
  });
}

/**
 * @param {ReturnType<typeof createProjectionState>} state
 * @returns {{ d4:number, d3:number, scale:number, width:number, height:number }}
 */
export function toProjectorOptions(state) {
  return {
    d4: state.d4,
    d3: state.d3,
    scale: state.scale,
    width: state.width,
    height: state.height,
  };
}
