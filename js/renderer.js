/**
 * Browser host adapter for package `4d-renderer`.
 *
 * SoT for math / projection / surfaces / draw: `mrs/packages/renderer-core/src/*`
 * This module preserves the TesseractRenderer API expected by CSE, TimelinePlayer,
 * EvidenceService, SceneGraph, and export provenance.
 */
import {
  CanvasRenderer,
  getRenderProfile,
  getSurface,
  sampleSurface,
} from "../mrs/packages/renderer-core/src/index.js";

const DEFAULT_WEIGHTS = { xw: 0.7, yz: 1.1, zw: 1.5, yw: 2.0 };

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} options
 */
export class TesseractRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.surfaceId = options.surfaceId ?? "tesseract";
    this.resolution = options.resolution ?? null;
    this.renderMode = options.renderMode ?? "wireframe";
    this.profile = options.profile ?? "technical";
    this.quality = options.quality ?? "high";
    this.adaptiveQuality = options.adaptiveQuality ?? true;

    this.theta = 0;
    this.d4 = options.d4 ?? 4.0;
    this.d3 = options.d3 ?? 4.0;
    this.scale = options.scale ?? 90;
    this.speed = options.speed ?? 0.6;
    if (options.respectReducedMotion !== false && globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) this.speed = 0;
    this.cameraY = options.cameraY ?? 0;
    this.weights = options.weights ?? { ...DEFAULT_WEIGHTS };

    this._core = new CanvasRenderer(canvas, {
      d4: this.d4,
      d3: this.d3,
      scale: this.scale,
      rotationWeights: this.weights,
      background: options.background ?? "#0e1216",
      renderMode: this.renderMode,
      profile: this.profile,
      cameraY: this.cameraY,
    });

    this._mesh = null;
    this._loadSurface(this.surfaceId);

    this.running = false;
    this._raf = 0;
    this._last = 0;
    this._cssW = 1;
    this._cssH = 1;
    this.onFrame = options.onFrame ?? null;
    this.fps = 60;
    this._fpsSamples = [];
    this._slowFrames = 0;
    this._bindNavigation();
  }

  /** @private */
  _loadSurface(surfaceId) {
    const surface = getSurface(surfaceId);
    this._mesh = sampleSurface(surface, this.resolution);
    this.surfaceId = surfaceId;
    this.vertices4D = this._mesh.vertices;
    this.edges = this._mesh.edges;
  }

  /**
   * Switch parametric / discrete surface (browser).
   * @param {string} surfaceId - e.g. tesseract | clifford-torus | hopf-surface
   * @param {number|null} resolution - mesh resolution for parametric surfaces
   */
  setSurface(surfaceId, resolution = null) {
    if (resolution != null) this.resolution = resolution;
    this._loadSurface(surfaceId);
  }

  setProfile(profile) {
    const style = getRenderProfile(profile);
    this.profile = profile;
    this.renderMode = style.renderMode;
    Object.assign(this._core, { background: style.background, renderMode: style.renderMode, scaleMode: style.scaleMode, padding: style.padding });
    this._core.style = { ...this._core.style, ...style };
    this._core.framing.reset();
  }

  setQuality(quality) {
    const resolutions = { performance: 18, balanced: 32, high: 48, ultra: 72 };
    if (!(quality in resolutions)) throw new Error(`Unknown quality preset: ${quality}`);
    this.quality = quality;
    if (this.surfaceId !== "tesseract") this.setSurface(this.surfaceId, resolutions[quality]);
  }

  resetView() {
    this.theta = 0; this.d4 = 4; this.d3 = 4; this.scale = 90; this.cameraY = 0;
    this._core.framing.reset();
  }

  toggle() { this.running ? this.stop() : this.start(); }

  _bindNavigation() {
    let pointer = null;
    this.canvas.addEventListener?.("pointerdown", (event) => { pointer = { x:event.clientX, y:event.clientY }; this.canvas.setPointerCapture?.(event.pointerId); });
    this.canvas.addEventListener?.("pointermove", (event) => { if(!pointer)return; const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;this.theta+=dx*0.008;this.cameraY=Math.max(-500,Math.min(500,this.cameraY-dy*1.5));pointer={x:event.clientX,y:event.clientY}; });
    const release=()=>{pointer=null;}; this.canvas.addEventListener?.("pointerup",release);this.canvas.addEventListener?.("pointercancel",release);
    this.canvas.addEventListener?.("wheel",(event)=>{event.preventDefault();const factor=Math.exp(-event.deltaY*0.001);this.scale=Math.max(20,Math.min(260,this.scale*factor));},{passive:false});
  }

  /** Sync adapter params onto the package CanvasRenderer. */
  _syncCore() {
    this._core.d4 = this.d4;
    this._core.d3 = this.d3;
    this._core.scale = this.scale;
    this._core.rotationWeights = this.weights;
    this._core.cameraY = this.cameraY;
    this._core.renderMode = this.renderMode;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._cssW = rect.width;
    this._cssH = rect.height;
    this._core.setViewSize(this._cssW, this._cssH);
  }

  /**
   * One frame: advance θ, draw via 4d-renderer CanvasRenderer.
   * @param {number} dt - seconds
   */
  renderFrame(dt) {
    if (dt > 0) {
      this._fpsSamples.push(1 / dt); if (this._fpsSamples.length > 45) this._fpsSamples.shift();
      this.fps = this._fpsSamples.reduce((sum,value)=>sum+value,0)/this._fpsSamples.length;
      this._slowFrames = this.fps < 28 ? this._slowFrames + 1 : 0;
      if (this.adaptiveQuality && this._slowFrames > 90 && this.quality !== "performance") { this.setQuality(this.quality === "ultra" ? "high" : this.quality === "high" ? "balanced" : "performance"); this._slowFrames = 0; }
    }
    this.theta += this.speed * dt;
    this._syncCore();
    this._core.renderFrame(this._mesh, this.theta);

    if (this.onFrame) {
      this.onFrame({
        theta: this.theta,
        vertexCount: this.vertices4D.length,
        edgeCount: this.edges.length,
        d4: this.d4,
        d3: this.d3,
        speed: this.speed,
        surfaceId: this.surfaceId,
        dt,
        fps: this.fps,
        quality: this.quality,
        profile: this.profile,
      });
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    this._last = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      this.renderFrame(dt);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }
}
