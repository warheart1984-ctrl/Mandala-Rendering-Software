/**
 * Hyperplane Slicer Renderer — uses Camera4D to slice 4D meshes and render cross-sections.
 *
 * Pipeline:
 *   1. Take a 4D mesh (vertices + faces)
 *   2. Rotate all vertices by camera orientation (SO(4))
 *   3. Clip the mesh against the camera's hyperplane
 *   4. Project the clipped 3D cross-section to 2D
 *   5. Render with wireframe and/or solid modes
 */

import { clipMeshWithEdges } from "../math/clip.js";
import { signedDistance } from "../math/hyperplane.js";
import { mat4apply, mat4transpose } from "../math/so4.js";
import { dot, normalize, sub as v4sub, scale as v4scale, length as v4length } from "../math/vec4.js";
import { drawWireframe, drawVertices } from "./wireframe.js";
import { drawSolid } from "./solid.js";

export class HyperplaneSlicer {
  /**
   * @param {import('../camera/Camera4D.js').Camera4D} camera
   * @param {object} options
   */
  constructor(camera, options = {}) {
    this.camera = camera;
    this.renderMode = options.renderMode ?? "both"; // "wireframe" | "solid" | "both"
    this.background = options.background ?? "#0e1216";
    this.lineWidth = options.lineWidth ?? 1.2;
    this.strokeEdges = options.strokeEdges ?? true;
    this.showSlicePlane = options.showSlicePlane ?? false;
    this.slicePlaneAlpha = options.slicePlaneAlpha ?? 0.08;
  }

  /**
   * Slice a 4D mesh against the camera's hyperplane and render to canvas.
   *
   * @param {import('canvas').CanvasRenderingContext2D} ctx
   * @param {object} mesh - { vertices, faces, edges }
   * @param {object} renderOptions
   */
  render(ctx, mesh, renderOptions = {}) {
    const camera = this.camera;
    const hp = camera.getHyperplane();

    // Article VI: Validate camera state before rendering
    const validation = camera.validate();
    if (!validation.valid) {
      throw new Error(
        `Camera4D invalid — frame rejected: ${validation.errors.join("; ")}`
      );
    }

    // Step 1: Rotate all 4D vertices by camera orientation (SO(4))
    const Rt = mat4transpose(camera.orientation);
    const rotatedVertices = mesh.vertices.map((v) => {
      const rel = v4sub(v, camera.position);
      return mat4apply(Rt, rel);
    });

    // Step 2: Clip mesh against hyperplane
    // Article III: H = { x ∈ ℝ⁴ | C_n · x = C_d }
    // We clip to the half-space C_n · x ≤ C_d (inside the slice)
    const clipped = clipMeshWithEdges(hp, rotatedVertices, mesh.faces);

    if (clipped.vertices.length === 0) {
      // Nothing visible — clear and return
      this._clear(ctx);
      return {
        visible: false,
        clippedVertices: 0,
        clippedFaces: 0,
        evidence: camera.recordFrame(),
      };
    }

    // Step 3: Project clipped vertices to 2D
    // The clipped vertices are already in the hyperplane's 3D subspace
    // We need to express them in the hyperplane's basis vectors
    const basis = camera.projectionBasis();
    const projected = clipped.vertices.map((v) => {
      // Express in hyperplane basis
      const p3d = {
        x: dot(basis[0], v),
        y: dot(basis[1], v),
        z: dot(basis[2], v),
      };

      // 3D → 2D projection
      let X, Y;
      if (camera.projectionMode === "orthographic") {
        X = camera.width / 2 + p3d.x * camera.scale;
        Y = camera.height / 2 - p3d.y * camera.scale;
      } else {
        const denom = camera.d3 - p3d.z;
        const k =
          camera.d3 /
          (Math.abs(denom) < 1e-6 ? Math.sign(denom || 1) * 1e-6 : denom);
        X = camera.width / 2 + k * p3d.x * camera.scale;
        Y = camera.height / 2 - k * p3d.y * camera.scale;
      }

      return { X, Y, z: p3d.z, w: v.w };
    });

    // Step 4: Render
    this._clear(ctx);

    const mode = renderOptions.renderMode ?? this.renderMode;

    if (mode === "solid" || mode === "both") {
      drawSolid(ctx, projected, clipped.faces, clipped.vertices, {
        strokeEdges: this.strokeEdges,
        ...(renderOptions.solidOptions ?? {}),
      });
    }

    if (mode === "wireframe" || mode === "both") {
      drawWireframe(ctx, projected, clipped.edges, {
        lineWidth: this.lineWidth,
        ...(renderOptions.wireframeOptions ?? {}),
      });
      drawVertices(ctx, projected, renderOptions.vertexOptions ?? {});
    }

    // Step 5: Record frame evidence (Article V)
    const evidence = camera.recordFrame();

    return {
      visible: true,
      clippedVertices: clipped.vertices.length,
      clippedFaces: clipped.faces.length,
      clippedEdges: clipped.edges.length,
      evidence,
    };
  }

  /**
   * Render a full frame: clear, slice, project, draw.
   */
  renderFrame(ctx, mesh, renderOptions = {}) {
    // Clear
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.camera.width, this.camera.height);

    // Slice and render
    return this.render(ctx, mesh, renderOptions);
  }

  /**
   * Animate: update camera for time t, then render.
   */
  animate(ctx, mesh, t, animationOptions = {}) {
    const camera = this.camera;

    // Update camera orientation
    if (animationOptions.orbit !== false) {
      camera.orbit(t, animationOptions.orbitSpeed ?? 1.0);
    }

    // Update hyperplane offset
    if (animationOptions.slideSpeed) {
      camera.slide(animationOptions.slideSpeed, t);
    }

    // Update temporal parameter
    if (animationOptions.temporalParam !== undefined) {
      camera.temporalParam = animationOptions.temporalParam;
    }

    return this.renderFrame(ctx, mesh, animationOptions);
  }

  _clear(ctx) {
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.camera.width, this.camera.height);
  }
}
