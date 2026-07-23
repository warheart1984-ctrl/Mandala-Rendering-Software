import { createCanvas } from "../lib/node-canvas.js";
import { CanvasRenderer } from "./canvas-renderer.js";
import { getSurface, sampleSurface } from "../surfaces/index.js";
import { createScene } from "../pipeline/scene.js";

export const REFINE_BILINEAR = "bilinear";
export const REFINE_BICUBIC = "bicubic";
export const REFINE_NEW_SAMPLE = "new-sample";

export class ProgressiveRefiner {
  constructor(options = {}) {
    this.passes = options.passes ?? [
      { scale: 0.25, label: "preview" },
      { scale: 0.5, label: "low" },
      { scale: 0.75, label: "medium" },
      { scale: 1.0, label: "final" },
    ];
    this.upscaleMode = options.upscaleMode ?? REFINE_BILINEAR;
    this.renderResolution = options.renderResolution ?? null;
    this.previewCallback = options.onPreview ?? null;
    this.progressCallback = options.onProgress ?? null;
    this.currentPass = 0;
    this.previewCanvas = null;
    this.finalCanvas = null;
    this.mesh = null;
    this.session = null;
  }

  async init(surfaceId, sceneOpts = {}) {
    const scene = createScene({ surface: surfaceId, ...sceneOpts });
    this.scene = scene;
    const surface = getSurface(surfaceId);
    this.mesh = sampleSurface(surface, this.renderResolution ?? scene.resolution);
    this.finalCanvas = createCanvas(scene.width, scene.height);
    return this;
  }

  setMesh(mesh) {
    this.mesh = mesh;
    return this;
  }

  async runFrame(t, options = {}) {
    const results = [];
    this.currentPass = 0;

    for (const pass of this.passes) {
      const scale = pass.scale;
      const passWidth = Math.max(1, Math.floor(this.scene.width * scale));
      const passHeight = Math.max(1, Math.floor(this.scene.height * scale));

      const canvas = createCanvas(passWidth, passHeight);
      const renderer = new CanvasRenderer(canvas, {
        d4: this.scene.d4,
        d3: this.scene.d3,
        scale: this.scene.scale * scale,
        profile: this.scene.profile,
        scaleMode: this.scene.scaleMode,
        padding: this.scene.padding,
        rotationWeights: this.scene.rotationWeights,
        background: this.scene.background,
        renderMode: this.scene.renderMode,
      });

      renderer.renderFrame(this.mesh, t, {
        temporalFraming: this.scene.temporalFraming,
        ...options,
      });

      const result = {
        pass: this.currentPass,
        label: pass.label,
        scale,
        width: passWidth,
        height: passHeight,
        canvas,
        buffer: canvas.toBuffer("image/png"),
      };

      results.push(result);

      if (this.previewCallback && this.currentPass < this.passes.length - 1) {
        const upscaled = this.upscale(result, this.scene.width, this.scene.height);
        this.previewCallback(upscaled, this.currentPass, this.passes.length);
      }

      if (this.progressCallback) {
        this.progressCallback(
          (this.currentPass + 1) / this.passes.length,
          pass.label,
          this.currentPass,
          this.passes.length
        );
      }

      this.currentPass++;
    }

    const finalPass = results[results.length - 1];
    if (finalPass && finalPass.scale < 1) {
      const upscaled = this.upscale(finalPass, this.scene.width, this.scene.height);
      const ctx = this.finalCanvas.getContext("2d");
      ctx.putImageData(upscaled, 0, 0);
    } else if (finalPass) {
      const ctx = this.finalCanvas.getContext("2d");
      ctx.drawImage(finalPass.canvas, 0, 0);
    }

    return {
      passes: results,
      finalBuffer: this.finalCanvas.toBuffer("image/png"),
      passCount: this.passes.length,
    };
  }

  upscale(passResult, targetWidth, targetHeight) {
    const srcCanvas = passResult.canvas;
    const tempCanvas = createCanvas(targetWidth, targetHeight);
    const ctx = tempCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(srcCanvas, 0, 0, targetWidth, targetHeight);
    return ctx.getImageData(0, 0, targetWidth, targetHeight);
  }

  async runSequence(frames, outputDir, options = {}) {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const results = [];

    for (let frame = 0; frame < frames; frame++) {
      const t = (frame / frames) * (this.scene.durationSec ?? frames / this.scene.fps) * 2 * Math.PI;
      const frameResult = await this.runFrame(t, options);
      results.push(frameResult);

      if (frame % 5 === 0 || frame === frames - 1) {
        const pct = ((frame + 1) / frames) * 100;
        process.stdout.write(`\r  Progressive: ${frame + 1}/${frames} (${pct.toFixed(1)}%)`);
      }
    }

    process.stdout.write("\n");
    return { results, frameCount: frames };
  }

  setPasses(passes) {
    this.passes = passes;
    return this;
  }

  getCurrentPassInfo() {
    return {
      currentPass: this.currentPass,
      totalPasses: this.passes.length,
      currentLabel: this.passes[this.currentPass]?.label ?? "unknown",
      progress: this.currentPass / this.passes.length,
    };
  }

  static createPreviewPasses() {
    return [
      { scale: 0.125, label: "thumbnail" },
      { scale: 0.25, label: "preview" },
      { scale: 0.5, label: "low" },
      { scale: 1.0, label: "final" },
    ];
  }

  static createPerformancePasses() {
    return [
      { scale: 0.5, label: "preview" },
      { scale: 1.0, label: "final" },
    ];
  }
}

export function createProgressiveRefiner(options = {}) {
  return new ProgressiveRefiner(options);
}
