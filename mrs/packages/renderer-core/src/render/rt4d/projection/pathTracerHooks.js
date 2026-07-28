/**
 * Path-tracer integration hooks for ProjCC.
 *
 * SoT: Projector4D (`rt4d/output/projector.js`) remains the mathematical /
 * print projection source of truth. ProjectionKernel is a governed continuity
 * layer on top — not a second SoT.
 *
 * Status: partial — bind into PathTracer4D.observationProjection is tested;
 * continuous observation does not replace CPU RT4D print / Digital Printer.
 *
 * Aperture ≠ print: bundles always carry printSoT:false / authority:"observation".
 */

import { createProjectionState } from "./ProjectionState.js";
import { ProjectionKernel } from "./ProjectionKernel.js";
import { createApertureFrame3D } from "./ApertureFrame3D.js";
import { resolveObservationPreset } from "./ObservationModePresets.js";

export const PATH_TRACER_PROJECTION_HOOK_STATUS = /** @type {const} */ ("partial");

export const PATH_TRACER_PROJECTION_SOT_BANNER =
  "Governed observation aperture — assist/preview only; CPU RT4D print remains SoT. Projector4D is math/print SoT.";

/**
 * Build an observation bundle for PathTracer4D.bindObservationProjection.
 * Does not mutate the integrator until bindToPathTracer is called.
 * Never routes aperture into print pipelines.
 *
 * @param {{
 *   modeId?: string,
 *   width?: number,
 *   height?: number,
 *   intentId?: string|null,
 *   theta?: number,
 *   phi?: number,
 *   tau?: number,
 *   kappa?: number,
 * }} [opts]
 */
/**
 * @param {Record<string, unknown>} obj
 * @returns {Record<string, unknown>}
 */
function definedOnly(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  );
}

export function createPathTracerProjectionHooks(opts = {}) {
  const modeId = opts.modeId ?? "perspective_w";
  // Belt-and-suspenders: never forward undefined keys that would clobber presets.
  const presetOverrides = definedOnly({
    width: opts.width,
    height: opts.height,
    intentId: opts.intentId !== undefined ? opts.intentId : null,
    theta: opts.theta,
    phi: opts.phi,
    tau: opts.tau,
    kappa: opts.kappa,
  });
  let resolved;
  try {
    resolved = resolveObservationPreset(modeId, presetOverrides);
  } catch {
    resolved = {
      state: createProjectionState(
        definedOnly({
          modeId,
          width: opts.width,
          height: opts.height,
          intentId: opts.intentId !== undefined ? opts.intentId : null,
          status: "partial",
        }),
      ),
      observationModeId: null,
      projectionPolicyId: null,
      preset: null,
    };
  }

  const kernel = new ProjectionKernel(resolved.state);
  const aperture = createApertureFrame3D(resolved.state, {
    x: 0,
    y: 0,
    width: resolved.state.width,
    height: resolved.state.height,
  });

  return Object.freeze({
    status: PATH_TRACER_PROJECTION_HOOK_STATUS,
    wiredIntoPathTracer4D: false,
    state: resolved.state,
    kernel,
    aperture,
    observationModeId: resolved.observationModeId,
    projectionPolicyId: resolved.projectionPolicyId,
    bindSite: "PathTracer4D.observationProjection",
    printSoT: false,
    authority: "observation",
    banner: PATH_TRACER_PROJECTION_SOT_BANNER,
  });
}

/**
 * Bind hooks onto a PathTracer4D instance (thin adapter).
 * Observation only — does not alter Projector4D print rasterize path.
 *
 * @param {import("../integrator/PathTracer4D.js").PathTracer4D} tracer
 * @param {ReturnType<typeof createPathTracerProjectionHooks>|object} [hooksOrOpts]
 */
export function bindPathTracerProjection(tracer, hooksOrOpts = {}) {
  const hooks =
    hooksOrOpts && hooksOrOpts.kernel
      ? hooksOrOpts
      : createPathTracerProjectionHooks(hooksOrOpts);
  tracer.bindObservationProjection(hooks);
  return Object.freeze({
    ...hooks,
    wiredIntoPathTracer4D: true,
    status: PATH_TRACER_PROJECTION_HOOK_STATUS,
    printSoT: false,
    authority: "observation",
    banner: PATH_TRACER_PROJECTION_SOT_BANNER,
    note:
      "Bound observationProjection on PathTracer4D; print SoT remains Projector4D + CPU RT4D.",
  });
}

/**
 * @returns {{ status: string, wired: boolean, printSoT: false, authority: string, note: string, banner: string }}
 */
export function describePathTracerProjectionIntegration() {
  return {
    status: PATH_TRACER_PROJECTION_HOOK_STATUS,
    wired: true,
    printSoT: false,
    authority: "observation",
    banner: PATH_TRACER_PROJECTION_SOT_BANNER,
    note:
      "PathTracer4D.bindObservationProjection wires ProjectionKernel + ApertureFrame3D for observation; CPU print SoT unchanged (Projector4D).",
  };
}
