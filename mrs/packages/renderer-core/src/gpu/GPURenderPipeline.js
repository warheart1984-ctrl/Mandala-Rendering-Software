import { getSurface, sampleSurface } from "../surfaces/index.js";
import { createScene } from "../pipeline/scene.js";
import { createGPUMeshRenderer, isMeshRendererSupported } from "./GPUMeshRenderer.js";
import { createPostProcessor } from "./PostProcessor.js";
import { TimelinePlayer } from "../timeline/TimelinePlayer.js";
import { Timeline } from "../timeline/Timeline.js";

export const PipelineState = Object.freeze({
  UNINITIALIZED: "uninitialized",
  READY: "ready",
  RENDERING: "rendering",
  ERROR: "error",
});

export class GPURenderPipeline {
  constructor(device, options = {}) {
    this.device = device;
    this.meshRenderer = null;
    this.postProcessor = null;
    this.canvas = options.canvas ?? null;
    this.context = null;
    this.width = options.width ?? 1920;
    this.height = options.height ?? 1080;
    this.sampleCount = options.sampleCount ?? 4;
    this.format = options.format ?? navigator.gpu?.getPreferredCanvasFormat?.() ?? "bgra8unorm";
    this.mesh = null;
    this.state = PipelineState.UNINITIALIZED;
    this.lastResult = null;
    this.timelinePlayer = null;
  }

  async init() {
    this.meshRenderer = await createGPUMeshRenderer(this.device, {
      width: this.width,
      height: this.height,
      sampleCount: this.sampleCount,
      format: this.format,
    });

    this.state = PipelineState.READY;
    return this;
  }

  async loadSurface(surfaceId, resolution = 64) {
    const surface = getSurface(surfaceId);
    this.mesh = sampleSurface(surface, resolution);
    this.meshRenderer.uploadMesh(this.mesh);
    this.currentSurface = surfaceId;
    this.currentResolution = resolution;
    return this;
  }

  uploadMesh(mesh) {
    this.mesh = mesh;
    this.meshRenderer.uploadMesh(mesh);
    return this;
  }

  async renderFrame(t, options = {}, outputTextureView = null) {
    this.state = PipelineState.RENDERING;

    const renderState = {
      width: options.width ?? this.width,
      height: options.height ?? this.height,
      d4: options.d4 ?? 4.0,
      d3: options.d3 ?? 4.0,
      scale: options.scale ?? 80,
      rotationWeights: options.rotationWeights ?? {
        xw: 0.7, yz: 1.1, zw: 1.5, yw: 2.0,
      },
      renderMode: options.renderMode ?? "solid",
      ambient: options.ambient ?? 0.35,
      diffuse: options.diffuse ?? 0.75,
      specular: options.specular ?? 0.18,
      shininess: options.shininess ?? 24,
      lightDir: options.lightDir ?? { x: -0.35, y: -0.55, z: 0.76 },
    };
    this.applyTimelineState(renderState, t);

    let result;
    if (outputTextureView) {
      result = await this.meshRenderer.renderFrame(t, renderState, outputTextureView);
    } else {
      result = await this.meshRenderer.renderFrame(t, renderState, null);
    }

    if (this.postProcessor && options.postProcess !== false) {
      const encoder = this.device.createCommandEncoder();
      const sourceTexture = this.meshRenderer.resolveTexture ?? this.meshRenderer.texture;
      this.postProcessor.process(encoder, sourceTexture);
      this.device.queue.submit([encoder.finish()]);
    }

    this.lastResult = result;
    this.state = PipelineState.READY;
    return result;
  }

  async renderScene(sceneConfig, outputTextureView = null) {
    const scene = typeof sceneConfig === "string"
      ? createScene({ surface: sceneConfig })
      : createScene(sceneConfig);

    if (scene.surface !== this.currentSurface || scene.resolution !== this.currentResolution) {
      await this.loadSurface(scene.surface, scene.resolution);
    }

    return this.renderFrame(0, {
      width: scene.width,
      height: scene.height,
      d4: scene.d4,
      d3: scene.d3,
      scale: scene.scale,
      rotationWeights: scene.rotationWeights,
      renderMode: scene.renderMode,
    }, outputTextureView);
  }

  async renderMovie(sceneConfig, onProgress = null) {
    const scene = createScene(sceneConfig);
    await this.loadSurface(scene.surface, scene.resolution);
    const totalFrames = this.timelinePlayer
      ? Math.floor((this.timelinePlayer.timeline.duration) * scene.fps)
      : scene.frames;
    const results = [];

    const fs = await import("node:fs");
    const path = await import("node:path");
    const { createCanvas } = await import("../lib/node-canvas.js");

    const outputDir = path.resolve(scene.outputDir);
    fs.mkdirSync(outputDir, { recursive: true });

    for (let frame = 0; frame < totalFrames; frame++) {
      const t = this.timelinePlayer
        ? (frame / totalFrames) * this.timelinePlayer.timeline.duration
        : (frame / totalFrames) * (scene.durationSec ?? totalFrames / scene.fps) * 2 * Math.PI;
      const canvas = createCanvas(scene.width, scene.height);
      const ctx = canvas.getContext("2d");

      // Render to an offscreen texture and read back
      const result = await this.renderFrame(t, {
        width: scene.width, height: scene.height,
        d4: scene.d4, d3: scene.d3, scale: scene.scale,
        rotationWeights: scene.rotationWeights,
        renderMode: scene.renderMode,
      });
      results.push(result);

      const frameNum = String(frame).padStart(6, "0");
      const filename = `${scene.outputPrefix}-${frameNum}.png`;

      if (onProgress && frame % 10 === 0) {
        onProgress(frame + 1, totalFrames, filename);
      }
    }

    return { results, frameCount: totalFrames, outputDir };
  }

  attachTimeline(timeline) {
    if (!timeline) {
      this.timelinePlayer = null;
      return this;
    }
    this._timelineState = {};
    for (const track of timeline.tracks) {
      track.target = this._timelineState;
    }
    const player = new TimelinePlayer(timeline);
    player.loop = true;
    player.play();
    this.timelinePlayer = player;
    return this;
  }

  applyTimelineState(state, time) {
    if (!this.timelinePlayer) return;
    this.timelinePlayer.seek(time);
    this.timelinePlayer.update(0);
    if (this._timelineState) Object.assign(state, this._timelineState);
  }

  attachPostProcessor(postProcessor) {
    this.postProcessor = postProcessor;
    return this;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    if (this.meshRenderer) this.meshRenderer.resize(width, height);
    if (this.postProcessor) this.postProcessor.resize(width, height);
  }

  setRenderMode(mode) {
    if (this.meshRenderer) this.meshRenderer.setRenderMode(mode);
  }

  release() {
    if (this.meshRenderer) { this.meshRenderer.release(); this.meshRenderer = null; }
    this.postProcessor = null;
    this.mesh = null;
    this.state = PipelineState.UNINITIALIZED;
  }

  getStats() {
    return {
      state: this.state,
      width: this.width,
      height: this.height,
      sampleCount: this.sampleCount,
      surface: this.currentSurface,
      resolution: this.currentResolution,
      vertexCount: this.mesh?.vertices?.length ?? 0,
      triangleCount: this.mesh?.faces?.length ?? 0,
      gpuRasterized: true,
    };
  }
}

export async function createGPURenderPipeline(device, options = {}) {
  const pipeline = new GPURenderPipeline(device, options);
  await pipeline.init();
  return pipeline;
}
