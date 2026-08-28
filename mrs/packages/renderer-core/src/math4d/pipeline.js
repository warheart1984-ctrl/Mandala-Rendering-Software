/**
 * 4D → 3D → 2D projection pipeline (infographic stages).
 *
 * This is a **projection** chain, not the holographic ρ / h_ij / COMPOSITE recorder.
 *
 * Math-first contract (docs/math4d/CONTRACT.md):
 *   transformPipeline ≡ Π_{3→2} ∘ Π_{4→3} ∘ R_4
 *   I = ℛ( Π_{3→2}[ Π_{4→3}( R_4 X ) ] )
 *   ℛ (raster/shade/post) is **declared** — hosts own it; not decided here.
 *
 * Stages:
 *   1. 4D World Space          x ∈ R⁴
 *   2. 4D Camera Space         x_c = R(x − C),  R ∈ SO(4)     ← R_4 (X − C)
 *   3. Hyperplane Slice        H: n·x = d; onto (e1,e2,e3)    ← Π_{4→3}
 *   4. 3D Clip Space           p = P_3D · x_3D  (homogeneous)
 *   5. NDC Space               divide by w; map to [-1,1]     ← Π_{3→2} (4–6)
 *   6. Screen Space            viewport → pixels; raster/shading/post **declared**
 *
 * Temporal extrusion (orthogonal): V = {(x,w) | x ∈ M(t), w = t}
 *
 * Camera4D.orientation is a **world pose**. The diagram's R is the **view**
 * rotation (camera-from-world), so Camera4D adapters use R_view = R_pose^T.
 * SoT matrices: SO(4) is row-major (`mat4apply`); P_3D is column-major math3d.
 */

import { Camera4D } from "../camera/Camera4D.js";
import { projectToSlice3D } from "./projection.js";
import { sub } from "../math/vec4.js";
import { IDENTITY4, mat4apply, mat4transpose } from "../math/so4.js";
import { createHyperplane } from "../math/hyperplane.js";
import { applyMat4ToVec4, perspectiveMat4 } from "../math3d/mat4.js";

/** Infographic stage titles (source of truth for naming). */
export const PIPELINE_STAGES = Object.freeze({
  world: "4D World Space",
  camera: "4D Camera Space",
  slice: "Hyperplane Slice (4D → 3D)",
  clip: "3D Clip Space",
  ndc: "NDC Space",
  screen: "Screen Space",
  temporal: "Temporal Extrusion",
});

/**
 * Honest tags from tests in this package (not GPU holography).
 * screen: viewport math is tested; rasterization / shading / post are declared.
 */
export const PIPELINE_STAGE_STATUS = Object.freeze({
  world: "enforced",
  camera: "enforced",
  slice: "enforced",
  clip: "enforced",
  ndc: "enforced",
  screen: "partial",
  screenViewport: "enforced",
  screenRaster: "declared",
  temporal: "partial",
  holographicRecorder: "declared",
});

const DEFAULT_FOV_Y = Math.PI / 3;
const DEFAULT_NEAR = 0.1;
const DEFAULT_FAR = 100;

function vec4(p, fallback = { x: 0, y: 0, z: 0, w: 0 }) {
  if (!p) return { ...fallback };
  return {
    x: p.x ?? 0,
    y: p.y ?? 0,
    z: p.z ?? 0,
    w: p.w ?? 0,
  };
}

function identityRotation(R) {
  if (R == null) return new Float64Array(IDENTITY4);
  return R;
}

/**
 * Stage 2 — 4D camera space.
 * Diagram: x_c = R(x − C) with R ∈ SO(4), C ∈ R⁴.
 * @param {{x,y,z,w}} x
 * @param {Float64Array|number[]} R view rotation (camera-from-world)
 * @param {{x,y,z,w}} C camera position in R⁴
 */
export function toCameraSpace(x, R, C) {
  const rel = sub(vec4(x), vec4(C));
  return mat4apply(identityRotation(R), rel);
}

/**
 * View rotation from a Camera4D world pose: R_view = R_pose^T.
 * @param {Camera4D} camera
 */
export function viewRotationFromCamera(camera) {
  return mat4transpose(camera.orientation ?? IDENTITY4);
}

/**
 * Camera4D adapter: world point → camera space using R_view = R_pose^T.
 */
export function worldToCamera(camera, point) {
  return toCameraSpace(point, viewRotationFromCamera(camera), camera.position);
}

/**
 * Stage 3 — hyperplane slice (4D → 3D).
 * H: n · x = d; project onto orthonormal basis (e1, e2, e3) → x_3D.
 * Mesh clipping lives in slice.js (`sliceTriangle` / `sliceMesh`).
 */
export function sliceTo3D(hyperplane, point) {
  return projectToSlice3D(hyperplane, point);
}

/**
 * 3D perspective matrix P_3D (column-major, math3d SoT).
 * @param {{ fovY?: number, aspect?: number, near?: number, far?: number }} [opts]
 *   fovY in **radians** (math3d convention).
 */
export function perspectiveP3D(opts = {}) {
  return perspectiveMat4(
    opts.fovY ?? DEFAULT_FOV_Y,
    opts.aspect ?? 1,
    opts.near ?? DEFAULT_NEAR,
    opts.far ?? DEFAULT_FAR
  );
}

/**
 * Stage 4 — 3D clip space. p = P_3D · x_3D (homogeneous; x_3D.w = 1).
 * @param {{x,y,z}} x3d
 * @param {number[]} P3D column-major 4×4
 * @returns {{x,y,z,w}} clip coordinates
 */
export function toClipSpace(x3d, P3D) {
  return applyMat4ToVec4(P3D, {
    x: x3d.x ?? 0,
    y: x3d.y ?? 0,
    z: x3d.z ?? 0,
    w: 1,
  });
}

/**
 * Stage 5 — NDC: divide clip by w.
 * Infographic labels clip as x_c,y_c,z_c here (not 4D camera space).
 * @param {{x,y,z,w}} clip
 */
export function clipToNdc(clip) {
  const w = clip.w;
  if (!Number.isFinite(w) || Math.abs(w) <= 1e-12) {
    return { x: clip.x, y: clip.y, z: clip.z, w };
  }
  return {
    x: clip.x / w,
    y: clip.y / w,
    z: clip.z / w,
    w: 1,
  };
}

/**
 * Stage 6 — viewport transform only (pixel coordinates).
 * Rasterization, shading, anti-aliasing, and post-processing are **declared**.
 * @param {{x,y,z}} ndc
 * @param {number} width
 * @param {number} height
 */
export function ndcToScreen(ndc, width, height) {
  return {
    X: (ndc.x * 0.5 + 0.5) * width,
    Y: (1 - (ndc.y * 0.5 + 0.5)) * height,
    z: ndc.z,
  };
}

/**
 * Compose infographic stages 1–6 for one world point (deterministic).
 *
 * This **is** Π_{3→2} ∘ Π_{4→3} ∘ R_4 (with camera origin: R_4(X − C)).
 * It does not implement ℛ. See `evaluateMathContract` / docs/math4d/CONTRACT.md.
 *
 * @param {{x,y,z,w}} worldPoint
 * @param {{
 *   C?: {x,y,z,w},
 *   R?: Float64Array|number[],
 *   hyperplane?: { n: {x,y,z,w}, d: number },
 *   P3D?: number[],
 *   fovY?: number,
 *   aspect?: number,
 *   near?: number,
 *   far?: number,
 *   width?: number,
 *   height?: number,
 * }} [opts]
 */
export function transformPipeline(worldPoint, opts = {}) {
  const C = vec4(opts.C);
  const R = identityRotation(opts.R);
  const hyperplane =
    opts.hyperplane ?? createHyperplane({ x: 0, y: 0, z: 0, w: 1 }, 0);
  const width = opts.width ?? 640;
  const height = opts.height ?? 480;
  const aspect = opts.aspect ?? width / height;
  const P3D =
    opts.P3D ??
    perspectiveP3D({
      fovY: opts.fovY ?? DEFAULT_FOV_Y,
      aspect,
      near: opts.near ?? DEFAULT_NEAR,
      far: opts.far ?? DEFAULT_FAR,
    });

  const camera = toCameraSpace(worldPoint, R, C);
  const sliced = sliceTo3D(hyperplane, camera);
  const clip = toClipSpace(sliced.p3, P3D);
  const ndc = clipToNdc(clip);
  const screen = ndcToScreen(ndc, width, height);

  return {
    world: vec4(worldPoint),
    camera,
    slice3: sliced.p3,
    signedDistance: sliced.signedDistance,
    clip,
    ndc,
    screen,
    P3D,
  };
}

/**
 * Diagram pipeline driven by a Camera4D pose (R_view = R_pose^T).
 * Slice uses the camera hyperplane in **camera space** (diagram order).
 */
export function transformPipelineFromCamera4D(camera, worldPoint, opts = {}) {
  const width = opts.width ?? camera.width ?? 640;
  const height = opts.height ?? camera.height ?? 480;
  return transformPipeline(worldPoint, {
    C: camera.position,
    R: viewRotationFromCamera(camera),
    hyperplane: opts.hyperplane ?? camera.getHyperplane(),
    fovY: opts.fovY,
    aspect: opts.aspect ?? camera._aspect ?? width / height,
    near: opts.near ?? camera._near ?? DEFAULT_NEAR,
    far: opts.far ?? camera._far ?? DEFAULT_FAR,
    P3D: opts.P3D,
    width,
    height,
  });
}

/**
 * Map optional FOV/near/far onto Camera4D d3/scale (honest approximation).
 * `fovY` here is **degrees** (legacy Camera4D soft-raster).
 * @param {Camera4D} camera
 * @param {{ fovY?: number, near?: number, far?: number, aspect?: number }} opts
 */
export function applyPerspectiveParams(camera, opts = {}) {
  if (opts.fovY != null && Number.isFinite(opts.fovY)) {
    const half = (opts.fovY * Math.PI) / 360;
    camera.d3 = 1 / Math.max(1e-6, Math.tan(half));
  }
  camera._near = opts.near ?? camera._near ?? DEFAULT_NEAR;
  camera._far = opts.far ?? camera._far ?? DEFAULT_FAR;
  if (opts.aspect != null) {
    camera._aspect = opts.aspect;
  }
  return camera;
}

/**
 * Camera4D fused smoke path (soft-raster project), not the P_3D clip factorization.
 * Prefer {@link transformPipeline} to match the infographic.
 * @returns {{ camera: object, slice3: object, screen: object, ndc: {x,y,z} }}
 */
export function transformChainSmoke(camera, worldPoint) {
  const cam = worldToCamera(camera, worldPoint);
  const slice3 = projectToSlice3D(camera.getHyperplane(), cam);
  const screen = camera.project(worldPoint);
  const ndc = {
    x: (2 * screen.X) / camera.width - 1,
    y: 1 - (2 * screen.Y) / camera.height,
    z: screen.z,
  };
  return {
    camera: cam,
    slice3: slice3.p3,
    screen: { X: screen.X, Y: screen.Y, z: screen.z },
    ndc,
  };
}

/**
 * Create a default pipeline camera (Camera4D host for the fused path).
 */
export function createPipelineCamera(options = {}) {
  const cam = new Camera4D(options);
  applyPerspectiveParams(cam, options);
  return cam;
}

export { Camera4D, perspectiveMat4 };
