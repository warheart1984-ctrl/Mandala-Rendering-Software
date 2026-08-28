/**
 * Math-first projection contract.
 *
 * transformPipeline ≡ Π_{3→2} ∘ Π_{4→3} ∘ R_4
 * (implementation translates first: X ↦ R_4 (X − C))
 *
 *   I = ℛ( Π_{3→2}[ Π_{4→3}( R_4 X ) ] )
 *
 * ℛ (raster / shade / post) is NOT in this module — hosts own it.
 * This is projection, not holographic ρ / h_ij / COMPOSITE.
 *
 * Canonical: docs/math4d/CONTRACT.md
 *
 * Hardware is an executor. Do not stub fake CUDA / OpenCL / WebGPU / Vulkan
 * backends here. A backend lands by preserving this contract.
 */

import { validateSO4, IDENTITY4 } from "../math/so4.js";
import { createHyperplane } from "../math/hyperplane.js";
import {
  transformPipeline,
  toCameraSpace,
  sliceTo3D,
  toClipSpace,
  clipToNdc,
  ndcToScreen,
} from "./pipeline.js";

export const MATH_FIRST_CONTRACT_ID = "math4d.projection.v1";

export const MATH_FIRST_AXIOM_CHAIN = Object.freeze([
  "Axioms",
  "State space",
  "Transforms",
  "Invariants",
  "Projection",
  "Implementation",
  "Tests",
]);

export const MATH_FIRST_EQUATION =
  "I = ℛ( Π_{3→2}[ Π_{4→3}( R_4 X ) ] )";

export const MATH_FIRST_COMPOSITION =
  "transformPipeline ≡ Π_{3→2} ∘ Π_{4→3} ∘ R_4";

export const MATH_FIRST_BACKEND_QUESTION =
  "Does implementation B preserve the mathematical contract?";

/** Layer 1 / 2 / 3 — do not collapse. Passing 1 and 2 does not prove 3. */
export const MATH_FIRST_LAYERS = Object.freeze({
  mathematical: "enforced",
  numerical: "partial",
  physical: "declared",
});

export const MATH_FIRST_MAP = Object.freeze({
  R4: {
    symbol: "R_4 X",
    facade: "toCameraSpace / rot4Apply / viewRotationFromCamera",
    note: "Camera4D stores pose; R_view = R_pose^T. Map is R_4(X − C).",
    status: "enforced",
  },
  Pi43: {
    symbol: "Π_{4→3}",
    facade: "sliceTo3D / projectToSlice3D",
    note: "H: n·x = d onto (e1,e2,e3)",
    status: "enforced",
  },
  Pi32: {
    symbol: "Π_{3→2}",
    facade: "toClipSpace + clipToNdc + ndcToScreen",
    note: "Infographic stages 4–6 (P_3D, ÷w, viewport)",
    status: "enforced",
  },
  scriptR: {
    symbol: "ℛ",
    facade: "hosts (canvas / RT4D / chamber)",
    note: "Raster / shade / post — not in transformPipeline",
    status: "declared",
  },
});

/** Honest: only JS/CPU is implemented in this package. Do not stub the rest. */
export const MATH_FIRST_BACKENDS = Object.freeze({
  jsCpu: "enforced",
  opencl: "declared",
  cuda: "declared",
  webgpu: "declared",
  vulkan: "declared",
});

export const MATH_FIRST_CONTRACT = Object.freeze({
  id: MATH_FIRST_CONTRACT_ID,
  axiomChain: MATH_FIRST_AXIOM_CHAIN,
  equation: MATH_FIRST_EQUATION,
  composition: MATH_FIRST_COMPOSITION,
  backendQuestion: MATH_FIRST_BACKEND_QUESTION,
  layers: MATH_FIRST_LAYERS,
  map: MATH_FIRST_MAP,
  backends: MATH_FIRST_BACKENDS,
  holographic: false,
});

function near(a, b, eps) {
  return Math.abs(a - b) <= eps;
}

/**
 * JS/CPU check: does transformPipeline preserve the mathematical contract?
 *
 * Answers the backend question for this path only. Does not claim OpenCL,
 * CUDA, WebGPU, or Vulkan, and does not implement ℛ.
 *
 * @param {{x:number,y:number,z:number,w:number}} worldPoint
 * @param {object} [opts] same shape as transformPipeline opts, plus { eps?: number }
 * @returns {{
 *   id: string,
 *   backend: "jsCpu",
 *   preservesMathematicalContract: boolean,
 *   layers: typeof MATH_FIRST_LAYERS,
 *   checks: object,
 * }}
 */
export function evaluateMathContract(worldPoint, opts = {}) {
  const eps = opts.eps ?? 1e-12;
  const C = opts.C ?? { x: 0, y: 0, z: 0, w: 0 };
  const R = opts.R ?? IDENTITY4;
  const hyperplane =
    opts.hyperplane ?? createHyperplane({ x: 0, y: 0, z: 0, w: 1 }, 0);
  const width = opts.width ?? 640;
  const height = opts.height ?? 480;

  const composed = transformPipeline(worldPoint, {
    ...opts,
    C,
    R,
    hyperplane,
    width,
    height,
  });

  const so4 = validateSO4(R);
  const camera = toCameraSpace(worldPoint, R, C);
  const sliced = sliceTo3D(hyperplane, camera);
  const clip = toClipSpace(sliced.p3, composed.P3D);
  const ndc = clipToNdc(clip);
  const screen = ndcToScreen(ndc, width, height);

  const compositionIdentity =
    near(composed.camera.x, camera.x, eps) &&
    near(composed.camera.y, camera.y, eps) &&
    near(composed.camera.z, camera.z, eps) &&
    near(composed.camera.w, camera.w, eps) &&
    near(composed.slice3.x, sliced.p3.x, eps) &&
    near(composed.slice3.y, sliced.p3.y, eps) &&
    near(composed.slice3.z, sliced.p3.z, eps) &&
    near(composed.clip.x, clip.x, eps) &&
    near(composed.clip.y, clip.y, eps) &&
    near(composed.clip.z, clip.z, eps) &&
    near(composed.clip.w, clip.w, eps) &&
    near(composed.ndc.x, ndc.x, eps) &&
    near(composed.ndc.y, ndc.y, eps) &&
    near(composed.ndc.z, ndc.z, eps) &&
    near(composed.screen.X, screen.X, eps) &&
    near(composed.screen.Y, screen.Y, eps);

  const sliceIsR3 =
    Number.isFinite(composed.slice3.x) &&
    Number.isFinite(composed.slice3.y) &&
    Number.isFinite(composed.slice3.z) &&
    composed.slice3.w === undefined;

  const pi32IsViewport =
    Number.isFinite(composed.screen.X) && Number.isFinite(composed.screen.Y);

  const scriptRNotInPipeline =
    composed.raster == null && composed.shade == null && composed.image == null;

  const preservesMathematicalContract =
    so4.valid === true &&
    compositionIdentity &&
    sliceIsR3 &&
    pi32IsViewport &&
    scriptRNotInPipeline;

  return {
    id: MATH_FIRST_CONTRACT_ID,
    backend: "jsCpu",
    equation: MATH_FIRST_EQUATION,
    composition: MATH_FIRST_COMPOSITION,
    backendQuestion: MATH_FIRST_BACKEND_QUESTION,
    preservesMathematicalContract,
    layers: MATH_FIRST_LAYERS,
    holographic: false,
    checks: {
      so4: so4.valid === true,
      compositionIdentity,
      sliceIsR3,
      pi32IsViewport,
      scriptRNotInPipeline,
    },
  };
}
