/**
 * Canvas renderer — orchestrates 4D rotation, projection, and drawing.
 */
import { project4Dto2D, projectEdge4Dto2D } from "../math/project.js";
import { cinematicRotation } from "../math/mat4.js";
import { drawWireframeSegments, drawVertices } from "./wireframe.js";
import { drawSolid } from "./solid.js";
import { applyFit, fitTransform, FramingController } from "./framing.js";
import { resolveRenderOptions } from "./profiles.js";

export class CanvasRenderer {
  /**
   * @param {HTMLCanvasElement|import('canvas').Canvas} canvas - browser or node-canvas
   * @param {object} options
   */
  constructor(canvas, options = {}) {
    options = resolveRenderOptions(options.profile ?? "technical", options);
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = canvas.width;
    this.height = canvas.height;

    this.d4 = options.d4 ?? 4.0;
    this.d3 = options.d3 ?? 4.0;
    this.scale = options.scale ?? 80;
    this.rotationWeights = options.rotationWeights ?? {
      xw: 0.7,
      yz: 1.1,
      zw: 1.5,
      yw: 2.0,
    };
    this.background = options.background ?? "#0e1216";
    this.renderMode = options.renderMode ?? "wireframe"; // "wireframe" | "solid"
    this.scaleMode = options.scaleMode ?? "fixed";
    this.padding = options.padding ?? 0.12;
    this.frameSmoothing = options.frameSmoothing ?? 0.16;
    this.framing = new FramingController({ smoothing: this.frameSmoothing });
    this.style = options;
    /** Vertical camera offset in screen pixels (governed timeline set_param). */
    this.cameraY = options.cameraY ?? 0;
  }

  /**
   * Clear the canvas with the background color.
   * Uses cssWidth/cssHeight when set (browser DPR path); else canvas buffer size.
   */
  clear() {
    const w = this.cssWidth ?? this.width;
    const h = this.cssHeight ?? this.height;
    this.ctx.fillStyle = this.background;
    this.ctx.fillRect(0, 0, w, h);
  }

  /**
   * Sync projection size (call after canvas resize).
   * @param {number} width - logical (CSS) width used for projection
   * @param {number} height - logical (CSS) height used for projection
   */
  setViewSize(width, height) {
    this.width = width;
    this.height = height;
    this.cssWidth = width;
    this.cssHeight = height;
  }

  /**
   * Render one frame of a 4D surface at time t.
   * @param {object} mesh - { vertices, faces, edges } from sampleSurface
   * @param {number} t - rotation parameter (same units as cinematicRotation)
   * @param {object} renderOptions - override renderer options
   */
  renderFrame(mesh, t, renderOptions = {}) {
    const rotate = cinematicRotation(t, this.rotationWeights);
    const width = this.cssWidth ?? this.width;
    const height = this.cssHeight ?? this.height;
    const cameraY = renderOptions.cameraY ?? this.cameraY;

    // Transform all 4D vertices: rotate then project to 2D
    const rotated4d = mesh.vertices.map((v) => rotate(v));
    const projected = rotated4d.map((rotated) => {
      const p2 = project4Dto2D(
        rotated,
        width,
        height,
        this.d4,
        this.d3,
        this.scale
      );
      if (cameraY) p2.Y -= cameraY * 0.35;
      return p2;
    });

    let frameTransform = null;
    if ((renderOptions.scaleMode ?? this.scaleMode) === "fit") {
      const target = fitTransform(projected, width, height, {
        padding: renderOptions.padding ?? this.padding,
        trim: renderOptions.boundsTrim ?? 0.01,
      });
      frameTransform = renderOptions.temporalFraming === false ? target : this.framing.update(target);
      applyFit(projected, frameTransform);
    }

    this.clear();

    const mode = renderOptions.renderMode ?? this.renderMode;

    if ((mode === "solid" || mode === "both") && mesh.faces?.length) {
      drawSolid(this.ctx, projected, mesh.faces, rotated4d, {
        ...this.style,
        strokeEdges: renderOptions.strokeEdges ?? false,
        ...renderOptions,
      });
    }

    // Wireframe (exclusive) or stroke on solid
    if (mode === "wireframe" || mode === "both" || (mode === "solid" && (renderOptions.strokeEdges ?? false))) {
      const clippedSegments = mesh.edges
        .map(([i, j]) => projectEdge4Dto2D(rotated4d[i], rotated4d[j], width, height, this.d4, this.d3, this.scale))
        .filter(Boolean);
      if (cameraY) for (const segment of clippedSegments) for (const p of segment) p.Y -= cameraY * 0.35;
      if (frameTransform) {
        for (const segment of clippedSegments) applyFit(segment, frameTransform);
      }
      drawWireframeSegments(this.ctx, clippedSegments, {
        ...this.style,
        lineWidth: renderOptions.lineWidth ?? 1.2,
        ...renderOptions,
      });
      if ((renderOptions.showVertices ?? this.style.showVertices) !== false) drawVertices(this.ctx, projected, { ...this.style, ...renderOptions });
    }

    if ((mode === "solid" || mode === "both") && !(renderOptions.strokeEdges ?? false) && (renderOptions.showVertices ?? this.style.showVertices) !== false) {
      drawVertices(this.ctx, projected, { ...this.style, ...renderOptions });
    }

    return { projected, rotated4d };
  }
}
