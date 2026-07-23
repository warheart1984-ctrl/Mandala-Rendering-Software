/**
 * Camera4D — Constitutional 4D Camera (Charter v1.0).
 *
 * Article II: Camera State
 *   C_p ∈ ℝ⁴        Position
 *   C_R ∈ SO(4)      Orientation
 *   C_n ∈ ℝ⁴         Hyperplane normal (||C_n|| = 1)
 *   C_d ∈ ℝ          Hyperplane offset
 *   C_mode           Projection mode (orthographic | perspective | hybrid)
 *   C_t ∈ ℝ          Temporal parameter
 *
 * Article III: Hyperplane Definition
 *   H = { x ∈ ℝ⁴ | C_n · x = C_d }
 *
 * Article VI: Frame Validity
 *   A frame is valid only if all invariants pass.
 */

import { dot, normalize, add as v4add, scale as v4scale, sub as v4sub, length as v4length } from "../math/vec4.js";
import {
  IDENTITY4,
  buildSO4,
  mat4apply,
  mat4mul,
  mat4transpose,
  mat4det,
  validateSO4,
  rotationMatrix,
  slerpSO4,
} from "../math/so4.js";
import {
  createHyperplane,
  signedDistance,
  hyperplaneFromPointAndNormal,
  animateHyperplane,
} from "../math/hyperplane.js";

/**
 * Frame evidence record — Article V, Invariant 7.
 * Every frame MUST record:
 *   - projection mode
 *   - projection basis
 *   - projection matrix
 *   - hyperplane parameters
 *   - camera rotation
 */
export function createFrameEvidence(camera, frameIndex) {
  return {
    frameIndex,
    timestamp: Date.now(),
    camera: {
      position: { ...camera.position },
      orientation: Array.from(camera.orientation),
      hyperplane: {
        normal: { ...camera.hyperplane.n },
        d: camera.hyperplane.d,
      },
      projectionMode: camera.projectionMode,
      temporalParam: camera.temporalParam,
    },
    projection: {
      mode: camera.projectionMode,
      basis: camera.projectionBasis(),
      matrix: camera.projectionMatrix(),
    },
    invariants: camera.validate(),
  };
}

/**
 * Camera4D — the constitutional authority over 4D slicing and projection.
 */
export class Camera4D {
  /**
   * @param {object} options
   * @param {{x,y,z,w}} [options.position] - Camera position in 4D
   * @param {Float64Array} [options.orientation] - SO(4) rotation matrix
   * @param {{x,y,z,w}} [options.normal] - Hyperplane normal
   * @param {number} [options.d] - Hyperplane offset
   * @param {"orthographic"|"perspective"|"hybrid"} [options.projectionMode]
   * @param {number} [options.temporalParam] - Time parameter for 4D time
   * @param {number} [options.d4] - 4D projection distance
   * @param {number} [options.d3] - 3D projection distance
   * @param {number} [options.width] - Output width
   * @param {number} [options.height] - Output height
   * @param {number} [options.scale] - Pixel scale
   */
  constructor(options = {}) {
    // Article II — Camera State

    // Section 1 — Position
    this.position = options.position ?? { x: 0, y: 0, z: 0, w: 0 };

    // Section 2 — Orientation (SO(4))
    this.orientation = options.orientation ?? new Float64Array(IDENTITY4);

    // Section 3 — Hyperplane Normal (normalized)
    this.hyperplane = createHyperplane(
      options.normal ?? { x: 0, y: 0, z: 0, w: 1 },
      options.d ?? 0
    );

    // Section 4 — Projection Mode
    this.projectionMode = options.projectionMode ?? "perspective";

    // Section 5 — Temporal Parameter
    this.temporalParam = options.temporalParam ?? 0;

    // Projection parameters
    this.d4 = options.d4 ?? 4.0;
    this.d3 = options.d3 ?? 4.0;
    this.width = options.width ?? 1920;
    this.height = options.height ?? 1080;
    this.scale = options.scale ?? 80;

    // Frame evidence log
    this._evidenceLog = [];
    this._frameCount = 0;
  }

  // ── Article III: Hyperplane ─────────────────────────────────────

  /**
   * Set the hyperplane normal (must be normalized).
   * Article III, Invariant 1: Normalized, non-degenerate.
   */
  setHyperplaneNormal(normal) {
    const n = normalize(normal);
    if (v4length(n) < 1e-10) {
      throw new Error("Hyperplane normal must be non-degenerate");
    }
    this.hyperplane = { n, d: this.hyperplane.d };
    return this;
  }

  /**
   * Set the hyperplane offset.
   */
  setHyperplaneOffset(d) {
    this.hyperplane = { n: this.hyperplane.n, d };
    return this;
  }

  /**
   * Get the active hyperplane: H = { x ∈ ℝ⁴ | C_n · x = C_d }
   */
  getHyperplane() {
    return this.hyperplane;
  }

  /**
   * Animate the hyperplane over time.
   * Article III, Invariant 2: Differentiable, continuous.
   */
  animateHyperplane(speed, t) {
    this.hyperplane = animateHyperplane(this.hyperplane, speed, t);
    return this;
  }

  // ── Article IV: SO(4) Rotation ──────────────────────────────────

  /**
   * Set orientation from a sequence of plane rotations.
   * Article IV, Invariant 3: R^T R = I₄, det(R) = 1
   */
  setRotation(rotations) {
    this.orientation = buildSO4(rotations);
    return this;
  }

  /**
   * Set orientation from a raw 4x4 matrix (with validation).
   */
  setOrientationMatrix(m) {
    const validation = validateSO4(m);
    if (!validation.valid) {
      throw new Error(`Invalid SO(4) rotation: ${validation.reason}`);
    }
    this.orientation = new Float64Array(m);
    return this;
  }

  /**
   * Rotate the camera orientation by composing with a plane rotation.
   */
  rotateBy(plane, angle) {
    const R = rotationMatrix(plane, angle);
    this.orientation = mat4mul(this.orientation, R);
    return this;
  }

  /**
   * Rotate the hyperplane normal using the camera orientation.
   * Article IV, Invariant 5: Only Camera may apply SO(4) rotation.
   */
  rotateHyperplane() {
    this.hyperplane.n = mat4apply(this.orientation, this.hyperplane.n);
    this.hyperplane.n = normalize(this.hyperplane.n);
    return this;
  }

  /**
   * Interpolate orientation between two states.
   * Article IV, Invariant 4: Smooth, continuous.
   */
  interpolateOrientation(target, t) {
    this.orientation = slerpSO4(this.orientation, target, t);
    return this;
  }

  // ── Article V: Projection ───────────────────────────────────────

  /**
   * Get the projection basis vectors in the hyperplane.
   * These define the 3D coordinate system within the slicing hyperplane.
   */
  projectionBasis() {
    const n = this.hyperplane.n;

    // Find three orthonormal vectors perpendicular to n
    // Use Gram-Schmidt starting from basis vectors
    const candidates = [
      { x: 1, y: 0, z: 0, w: 0 },
      { x: 0, y: 1, z: 0, w: 0 },
      { x: 0, y: 0, z: 1, w: 0 },
      { x: 0, y: 0, z: 0, w: 1 },
    ];

    // Pick the candidate least aligned with n
    let bestIdx = 0;
    let bestDot = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const d = Math.abs(dot(n, candidates[i]));
      if (d < bestDot) {
        bestDot = d;
        bestIdx = i;
      }
    }

    // Start with that candidate
    const u1 = v4sub(candidates[bestIdx], v4scale(n, dot(n, candidates[bestIdx])));
    const u1n = normalize(u1);

    // Gram-Schmidt for remaining two
    const remaining = candidates.filter((_, i) => i !== bestIdx);
    const basis = [u1n];
    for (const c of remaining) {
      let v = c;
      for (const b of basis) {
        v = v4sub(v, v4scale(b, dot(b, v)));
      }
      const len = v4length(v);
      if (len > 1e-6) {
        basis.push(v4scale(v, 1 / len));
        if (basis.length === 3) break;
      }
    }

    return basis;
  }

  /**
   * Get the projection matrix (4D → 3D within the hyperplane).
   * Article V, Invariant 6: Deterministic.
   */
  projectionMatrix() {
    const basis = this.projectionBasis();
    // 3×4 matrix: each row is a basis vector
    return basis;
  }

  /**
   * Project a 4D point through the hyperplane slice.
   * Steps:
   *   1. Translate relative to camera position
   *   2. Apply inverse SO(4) rotation
   *   3. Express in hyperplane basis (3D coordinates)
   *   4. Apply 3D perspective or orthographic projection
   *
   * @param {{x,y,z,w}} point - 4D point
   * @returns {{x:number, y:number, z:number, X:number, Y:number, w:number}} 3D + screen coords
   */
  project(point) {
    // Step 1: Translate relative to camera position
    const rel = v4sub(point, this.position);

    // Step 2: Apply inverse SO(4) rotation (R^T)
    const Rt = mat4transpose(this.orientation);
    const rotated = mat4apply(Rt, rel);

    // Step 3: Express in hyperplane basis
    const basis = this.projectionBasis();
    const p3d = {
      x: dot(basis[0], rotated),
      y: dot(basis[1], rotated),
      z: dot(basis[2], rotated),
    };

    // Step 4: 3D projection
    let X, Y;
    if (this.projectionMode === "orthographic") {
      X = this.width / 2 + p3d.x * this.scale;
      Y = this.height / 2 - p3d.y * this.scale;
    } else {
      // Perspective
      const denom = this.d3 - p3d.z;
      const k = this.d3 / (Math.abs(denom) < 1e-6 ? Math.sign(denom || 1) * 1e-6 : denom);
      X = this.width / 2 + k * p3d.x * this.scale;
      Y = this.height / 2 - k * p3d.y * this.scale;
    }

    return {
      x: p3d.x,
      y: p3d.y,
      z: p3d.z,
      X,
      Y,
      w: rotated.w,
    };
  }

  /**
   * Project a 4D point using the camera's hyperplane slicing.
   * The point is projected onto the hyperplane, then to 3D, then to 2D.
   */
  projectWithSlice(point) {
    // Compute distance to hyperplane
    const dist = signedDistance(this.hyperplane, point);

    // If point is on the outside of the hyperplane, project it onto the hyperplane
    let p4d = point;
    if (dist > 0) {
      // Project onto hyperplane: move along normal by distance
      p4d = v4sub(point, v4scale(this.hyperplane.n, dist));
    }

    return this.project(p4d);
  }

  // ── Article VI: Frame Validity ──────────────────────────────────

  /**
   * Validate all camera invariants.
   * Article VI: Frame is valid only if all invariants pass.
   */
  validate() {
    const errors = [];

    // Invariant 1: Hyperplane validity
    const nLen = v4length(this.hyperplane.n);
    if (Math.abs(nLen - 1) > 1e-6) {
      errors.push(`Hyperplane normal not normalized: ||n|| = ${nLen.toFixed(8)}`);
    }
    if (nLen < 1e-10) {
      errors.push("Hyperplane normal is degenerate (zero vector)");
    }

    // Invariant 3: SO(4) validity
    const so4Check = validateSO4(this.orientation);
    if (!so4Check.valid) {
      errors.push(`SO(4) invalid: ${so4Check.reason}`);
    }

    // Invariant 6: Projection validity
    if (!["orthographic", "perspective", "hybrid"].includes(this.projectionMode)) {
      errors.push(`Invalid projection mode: ${this.projectionMode}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ── Article V: Evidence Recording ───────────────────────────────

  /**
   * Record a frame evidence entry.
   * Article V, Invariant 7: Every frame MUST record evidence.
   */
  recordFrame() {
    const evidence = createFrameEvidence(this, this._frameCount);
    this._evidenceLog.push(evidence);
    this._frameCount++;
    return evidence;
  }

  /**
   * Get the evidence log.
   */
  getEvidenceLog() {
    return this._evidenceLog;
  }

  /**
   * Export evidence for CI verification.
   */
  exportEvidence() {
    return {
      camera: {
        position: { ...this.position },
        orientation: Array.from(this.orientation),
        hyperplane: { normal: { ...this.hyperplane.n }, d: this.hyperplane.d },
        projectionMode: this.projectionMode,
      },
      frames: this._evidenceLog,
      frameCount: this._frameCount,
    };
  }

  // ── Convenience Methods ─────────────────────────────────────────

  /**
   * Set up a cinematic camera orbit.
   * Rotates the hyperplane normal around the origin.
   */
  orbit(t, speed = 1.0) {
    this.setRotation([
      { plane: "xw", angle: t * speed * 0.7 },
      { plane: "yz", angle: t * speed * 1.1 },
      { plane: "zw", angle: t * speed * 1.5 },
      { plane: "yw", angle: t * speed * 2.0 },
    ]);
    return this;
  }

  /**
   * Slide the hyperplane through 4D space.
   */
  slide(speed, t) {
    this.hyperplane.d = speed * t;
    return this;
  }

  /**
   * Clone the camera state.
   */
  clone() {
    return new Camera4D({
      position: { ...this.position },
      orientation: new Float64Array(this.orientation),
      normal: { ...this.hyperplane.n },
      d: this.hyperplane.d,
      projectionMode: this.projectionMode,
      temporalParam: this.temporalParam,
      d4: this.d4,
      d3: this.d3,
      width: this.width,
      height: this.height,
      scale: this.scale,
    });
  }
}

/**
 * ISL Engine placeholder for CLI compatibility
 */
export function createIslEngine() {
  return {
    CompileAndEvaluate(islSource, contextJson = "{}") {
      const context = typeof contextJson === "string" ? JSON.parse(contextJson) : contextJson;
      return {
        id: `intent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        actor: context.actor ?? "4dce.renderer",
        type: "render_scene",
        kind: "render_scene",
        goal: `ISL ${islSource}`,
        payload: {},
        constraints: { worldId: context.worldId },
        timestamp: new Date().toISOString(),
      };
    }
  };
}
