import { CertifiedEnvironment } from "../rt4d/environment/CertifiedEnvironment.js";
import { EnvironmentLighting } from "../lighting/EnvironmentLighting.js";
import { PhysicalCamera } from "../camera/PhysicalCamera.js";
import { PathIntegrator, BDPTIntegrator, VolumetricIntegrator } from "../integrator/PathIntegrator.js";
import { TemporalDenoiser, OIDNDenoiser } from "../denoiser/index.js";
import { PhotorealCompositor } from "../compositor/PhotorealCompositor.js";
import { PhotorealEvidenceRecorder } from "../evidence/PhotorealEvidenceRecorder.js";
import { materialRegistry, createMaterial, getMaterial } from "../material/index.js";
import { PhotorealRNG, V3 } from "../material/PhotorealUtils.js";
import { createCanvas } from "canvas";

/**
 * PhotorealEnvironment
 * Orchestrates all photoreal components into a unified render pipeline
 */
export class PhotorealEnvironment {
  constructor(config = {}) {
    this.constants = {
      CONTRACT_VERSION: "1.0.0",
      CANONICAL_SEED: 0x5EED4D00,
      WIDTH: config.width || 1920,
      HEIGHT: config.height || 1080,
      FRAMES: config.frames || 300,
      FPS: config.fps || 30,
      DTAU: 0.03,
      SP_P: config.spp || 64,
      MAX_DEPTH: config.maxDepth || 16,
      RR_DEPTH: config.rrDepth || 4,
      D4: 4,
      CAMERA_APERTURE: config.aperture || 2.8,
      CAMERA_FOCAL: config.focal || 35,
      CAMERA_SENSOR: [36, 24],
      CAMERA_FOCUS: config.focus || 10,
      CAMERA_SHUTTER: 180,
      SUN_WORLDLINE: null, // from 4D runtime
      SKY_MODEL: "hosek_wilkie",
      ENV_MAP: config.envMap || null,
      ENV_MAP_INTENSITY: 1.0,
      INTEGRATOR_STRATEGY: config.strategy || "path",
      DENOISER: config.denoiser || "temporal",
      DENOISER_HISTORY: 8,
      BLOOM: true,
      FILM_GRAIN: false,
      TONEMAP: "aces",
      EXPOSURE: 1.0,
      GAMMA: 2.2,
      COLOR_SPACE: "sRGB",
      ...config
    };

    this.rng = new PhotorealRNG(this.constants.CANONICAL_SEED);
    this.certifiedEnv = null;
    this.lighting = null;
    this.camera = null;
    this.integrator = null;
    this.denoiser = null;
    this.compositor = null;
    this.recorder = null;
    this.canvas = null;
    this.ctx = null;
    this.advanced = false;
    this.frameCount = 0;
    this.history = [];
  }

  async initialize() {
    // Initialize 4D certified environment (for sun worldline)
    this.certifiedEnv = new CertifiedEnvironment({
      CANONICAL_SEED: this.constants.CANONICAL_SEED,
      FRAMES: this.constants.FRAMES
    });
    await this.certifiedEnv.advance();
    
    // Lighting
    this.lighting = new EnvironmentLighting({
      skyModel: "hosek",
      skyParams: { turbidity: 2.0 },
      sunWorldline: this.certifiedEnv.sun,
      envMap: this.constants.ENV_MAP,
      envMapIntensity: this.constants.ENV_MAP_INTENSITY
    });
    
    // Camera
    this.camera = new PhysicalCamera({
      fov: 60,
      focalLength: this.constants.CAMERA_FOCAL,
      sensorSize: this.constants.CAMERA_SENSOR,
      aperture: this.constants.CAMERA_APERTURE,
      focusDistance: this.constants.CAMERA_FOCUS,
      shutterAngle: this.constants.CAMERA_SHUTTER,
      imageWidth: this.constants.WIDTH,
      imageHeight: this.constants.HEIGHT
    });
    
    // Integrator
    const IntegratorClass = this.constants.INTEGRATOR_STRATEGY === "bdpt" ? BDPTIntegrator :
                           this.constants.INTEGRATOR_STRATEGY === "volumetric" ? VolumetricIntegrator :
                           PathIntegrator;
    this.integrator = new (await import("../integrator/index.js"))[this.constants.INTEGRATOR_STRATEGY === "bdpt" ? "BDPTIntegrator" : 
                          this.constants.INTEGRATOR_STRATEGY === "volumetric" ? "VolumetricIntegrator" : "PathIntegrator"]({
      maxDepth: this.constants.MAX_DEPTH,
      rrDepth: this.constants.RR_DEPTH,
      spp: this.constants.SP_P,
      strategy: this.constants.INTEGRATOR_STRATEGY,
      seed: this.constants.CANONICAL_SEED
    });
    
    // Denoiser
    if (this.constants.DENOISER === "oidn") {
      this.denoiser = new OIDNDenoiser({ quality: "high" });
    } else {
      this.denoiser = new TemporalDenoiser({ historyLength: this.constants.DENOISER_HISTORY });
    }
    
    // Compositor
    this.compositor = new PhotorealCompositor({
      width: this.constants.WIDTH,
      height: this.constants.HEIGHT,
      tonemap: this.constants.TONEMAP,
      exposure: this.constants.EXPOSURE,
      gamma: this.constants.GAMMA,
      colorSpace: this.constants.COLOR_SPACE,
      bloom: this.constants.BLOOM,
      filmGrain: this.constants.FILM_GRAIN
    });
    
    // Evidence recorder
    this.recorder = new PhotorealEvidenceRecorder({
      worldId: "world-photoreal-golden-hour-001",
      timelineId: "timeline-photoreal-golden-hour-v1",
      intentId: "render-4d-photoreal-golden-hour"
    });
    
    // Canvas
    this.canvas = createCanvas(this.constants.WIDTH, this.constants.HEIGHT);
    this.ctx = this.canvas.getContext("2d");
    
    this.advanced = true;
  }

  /**
   * Advance the 4D worldline and certify all environment elements
   */
  async advance() {
    if (!this.advanced) await this.initialize();
    
    // Advance 4D certified environment
    await this.certifiedEnv.advance();
    
    // Update sun from 4D worldline
    this.lighting.updateSunFromWorldline(this.certifiedEnv.sun);
    
    // Certify lights, materials, etc.
    // this._certifyAll();
    
    this.advanced = true;
  }

  /**
   * Render a single frame
   */
  async renderFrame(frameIndex, options = {}) {
    if (!this.advanced) await this.advance();
    
    const time = frameIndex / this.constants.FPS;
    const tau = frameIndex * this.constants.DTAU;
    
    // Update sun for this frame
    this.lighting.updateSunFromWorldline(tau);
    
    // Update camera for this frame (if animated)
    this._updateCamera(frameIndex);
    
    // Render
    const frameStart = performance.now();
    const renderResult = this.integrator.integrate(this._buildScene(), this.camera, this.rng);
    const renderTime = performance.now() - frameStart;
    
    // Denoise
    const denoiseStart = performance.now();
    const denoisedRadiance = await this.denoiser.denoise({
      radiance: renderResult.radiance,
      albedo: renderResult.aovs.albedo,
      normal: renderResult.aovs.normal,
      depth: renderResult.aovs.depth,
      motion: renderResult.aovs.motion,
      camera: this.camera
    });
    const denoiseTime = performance.now() - denoiseStart;
    
    // Composite
    const compositeStart = performance.now();
    const finalColor = this.compositor.composite({
      radiance: denoisedRadiance,
      aovs: renderResult.aovs,
      camera: this.camera,
      exposure: this.constants.EXPOSURE,
      frame: frameIndex
    });
    const compositeTime = performance.now() - compositeStart;
    
    // Build frame record
    const frameRecord = {
      frame: frameIndex,
      timeSeconds: frameIndex / this.constants.FPS,
      t: tau,
      replayToken: this._generateReplayToken(frameIndex),
      radiance: renderResult.radiance,
      denoisedRadiance: denoisedRadiance,
      aovs: renderResult.aovs,
      camera: this._getCameraRecord(),
      integrator: {
        spp: this.constants.SP_P,
        maxDepth: this.constants.MAX_DEPTH,
        strategy: this.constants.INTEGRATOR_STRATEGY
      },
      denoiser: {
        method: this.constants.DENOISER,
        historyLength: this.constants.DENOISER_HISTORY
      },
      renderer: {
        backend: "cpu.reference",
        seed: this.constants.CANONICAL_SEED
      },
      parameters: {
        exposure: this.constants.EXPOSURE,
        gamma: this.constants.GAMMA,
        tonemap: this.constants.TONEMAP
      },
      // Evidence hashes
      radianceHash: this._hashArray(renderResult.radiance),
      aovsHash: this._hashAOVs(renderResult.aovs)
    };
    
    // Record evidence
    this.recorder.record(frameRecord);
    
    // Store in history for temporal denoising
    this.history.push({ ...renderResult, denoisedRadiance });
    if (this.history.length > 8) this.history.shift();
    
    return {
      color: finalColor,
      aovs: renderResult.aovs,
      renderTime,
      denoiseTime,
      compositeTime
    };
  }

  _updateCamera(frameIndex) {
    // Update camera for multi-shot or animation
    // For now, static camera
  }

  _buildScene() {
    return {
      // Geometry from certified environment
      geometry: this.certifiedEnv.getGeometry(),
      materials: materialRegistry,
      lights: this.lighting.lights,
      environment: this.lighting,
      camera: this.camera
    };
  }

  _getCameraRecord() {
    return {
      eye: this.camera.eye,
      target: this.camera.target,
      focal: this.camera.focalPixels,
      aperture: this.camera.aperture,
      focusDistance: this.camera.focusDistance,
      shutterAngle: this.constants.CAMERA_SHUTTER
    };
  }

  _generateReplayToken(frameIndex) {
    const crypto = require("crypto");
    return crypto.createHash("sha256")
      .update(`${frameIndex}-${this.constants.CANONICAL_SEED}-${this.constants.WORLD_ID}`)
      .digest("hex").slice(0, 32);
  }

  _hashArray(arr) {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(Buffer.from(new Float32Array(arr).buffer)).digest("hex").slice(0, 32);
  }

  _hashAOVs(aovs) {
    const crypto = require("crypto");
    const data = Buffer.concat([
      Buffer.from(new Float32Array(aovs.albedo).buffer),
      Buffer.from(new Float32Array(aovs.normal).buffer),
      Buffer.from(new Float32Array(aovs.depth).buffer),
      Buffer.from(new Float32Array(aovs.direct).buffer),
      Buffer.from(new Float32Array(aovs.indirect).buffer)
    ]);
    return crypto.createHash("sha256").update(data).digest("hex").slice(0, 32);
  }

  fingerprint() {
    return this.recorder.runtimeFingerprint();
  }
}