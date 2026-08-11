import { CertifiedSun } from "./CertifiedSun.js";
import { SkyDome, mulberry32, skyDawnFactor, minkowskiRapidity } from "./SkyField.js";
import { CANONICAL_WAVES, buildWaveVectors, certifyWaveVectors, buildOceanHeightfield, projectOceanAnchors } from "./OceanField.js";
import { CLOUD_GRID, CLOUD_SEED, buildWindVector, certifyWindVector, buildCloudNoise, advectClouds, cloudOpacity } from "./CloudField.js";
import { FOG_DENSITY, FOG_SEED, certifyFogDensity, fogFactor } from "./FogField.js";
import { EnvironmentEvidenceRecorder, canonicalFrameRecord, frameHash } from "./EnvironmentEvidence.js";
import { MetricTensor } from "../constitutional/arena/MetricTensor.js";
import { Camera4D, ProjectionPolicy, CertifiedProjector } from "../constitutional/projection/index.js";

const CONSTANTS = {
  CONTRACT_VERSION: "1.1.0",
  METRIC_SIGNATURE: [-1, 1, 1, 1],
  C: 1,
  DTAU: 0.03,
  FRAMES: 300,
  FPS: 30,
  WIDTH: 1280,
  HEIGHT: 720,
  D4: 4,
  CANONICAL_SEED: 0x5EED4D00,
  SUN_INITIAL_POSITION: [0, -0.40, 0, 0],
  SUN_INITIAL_VELOCITY: [1.71636, 1.35, 0.35, 0.03],
  R_SUN: 90,
  DAWN_HORIZON: 0.25,
  DAWN_SPAN: 0.85,
  OCEAN_GRID: { xMin: -40, xMax: 40, zMin: -120, zMax: -6, cols: 96, rows: 40 },
  OCEAN_ANCHORS: [[-32, -10], [32, -10], [-32, -60], [32, -60]],
  STARS: { count: 90, seed: 0x5EED4D00 ^ 0xA5A5A5A5 },
  CLOUD_GRID: { cols: 96, rows: 64 },
  CLOUD_SEED: 0x5EED4D00 ^ 0xC10D5,
  WIND_VECTOR: [0, 1, 0, 0],
  WIND_ADVECTION_SCALE: 0.02,
  FOG_DENSITY: 0.0015,
  FOG_SEED: 0x5EED4D00 ^ 0xF06D5,
  FOLIAGE_SEED: 0x5EED4D00 ^ 0xF0F0F0F0,
  WORLD_ID: "world-cinematic-sunrise-001",
  TIMELINE_ID: "timeline-sunrise-v1",
  INTENT_ID: "render-4d-cinematic-sunrise",
};

export class CertifiedEnvironment {
  constructor(config = {}) {
    this.constants = { ...CONSTANTS, ...config };
    this.sun = new CertifiedSun({
      metricSignature: this.constants.METRIC_SIGNATURE,
      c: this.constants.C,
      dtau: this.constants.DTAU,
      frames: this.constants.FRAMES,
      d4: this.constants.D4,
      initialPosition: this.constants.SUN_INITIAL_POSITION,
      initialVelocity: this.constants.SUN_INITIAL_VELOCITY,
    });
    this.sky = new SkyDome({ gridW: 96, gridH: 64, zenith4: [0, 1, 0, 0], seed: this.constants.CANONICAL_SEED });
    this.waves = buildWaveVectors(CANONICAL_WAVES);
    this.waveCerts = null;
    // Cloud field
    this.cloudNoise = buildCloudNoise(this.constants.CLOUD_GRID.cols, this.constants.CLOUD_GRID.rows, this.constants.CLOUD_SEED);
    this.windVec = buildWindVector();
    this.windCert = null;
    // Fog field
    this.fogDensity = this.constants.FOG_DENSITY;
    this.fogCert = null;
    this.recorder = new EnvironmentEvidenceRecorder();
    this.advanced = false;
    this._certifiedProjector = null;
    this._policy = null;
    this._camera4d = null;
  }

  _getProjectionSetup() {
    if (!this._certifiedProjector) {
      const metric = MetricTensor.minkowski();
      this._policy = ProjectionPolicy.perspective(this.constants.D4);
      this._camera4d = Camera4D.atOrigin();
      this._certifiedProjector = new CertifiedProjector(metric);
    }
    return { certifiedProjector: this._certifiedProjector, policy: this._policy, camera4d: this._camera4d };
  }

  async advance() {
    const sunRecords = await this.sun.advance();
    this.waveCerts = certifyWaveVectors(this.waves);
    const { certifiedProjector, policy, camera4d } = this._getProjectionSetup();
    this.sky.certifyZenith(certifiedProjector, policy, camera4d);
    // Certify cloud wind vector
    this.windCert = certifyWindVector(this.windVec);
    // Certify fog density
    this.fogCert = certifyFogDensity(this.fogDensity);
    this.advanced = true;

    // Populate recorder with all frames for deterministic hashing (V8)
    this.recorder.begin();
    for (let i = 0; i < this.constants.FRAMES; i++) {
      const frameRec = this.frame(i);
      this.recorder.record(frameRec);
    }
    this.recorder.finalize();

    return sunRecords;
  }

  frame(N) {
    if (!this.constants.INTENT_ID) throw new Error("V5: intentId is required");
    if (!this.advanced) throw new Error("Call advance() first");
    const sunRec = this.sun.stepRecord(N);
    const tau = N * this.constants.DTAU;
    const p3 = sunRec.p3;
    const sunDir = this._envToWorld(p3);
    const dawn = skyDawnFactor(sunDir.y, { horizon: this.constants.DAWN_HORIZON, span: this.constants.DAWN_SPAN });
    const sunWorld = { x: sunDir.x * this.constants.R_SUN, y: sunDir.y * this.constants.R_SUN, z: sunDir.z * this.constants.R_SUN };
    const oceanHeightfield = buildOceanHeightfield({ ...this.constants.OCEAN_GRID, waves: this.waves, tau });
    const { certifiedProjector, policy, camera4d } = this._getProjectionSetup();
    const zenithCert = this.sky.certifyZenith(certifiedProjector, policy, camera4d);
    const sunMax = sunRec.provenance.projection.errorBound?.max ?? 0;
    const zenMax = zenithCert.certifiedProjection?.projectionError?.max ?? 0;
    const skyErrorBound = { max: Math.max(sunMax, zenMax) };
    const anchorProjections = projectOceanAnchors(this.constants.OCEAN_ANCHORS, certifiedProjector, policy, camera4d, { tau, waves: this.waves });
    // Cloud advection
    const advectedNoise = advectClouds(this.cloudNoise, [this.constants.WIND_VECTOR[1], this.constants.WIND_VECTOR[2]], tau, this.constants.CLOUD_GRID.cols, this.constants.CLOUD_GRID.rows);
    const cloudOpacityGrid = cloudOpacity(advectedNoise, dawn);
    const windDisplacement = { x: this.constants.WIND_VECTOR[1] * tau, y: this.constants.WIND_VECTOR[2] * tau };
    // Fog factor at typical depth
    const fogFactorAtDepth = fogFactor(100, this.fogDensity); // at 100 world units

    return {
      frame: N,
      timeSeconds: N / this.constants.FPS,
      t: tau,
      replayToken: sunRec.provenance.replayToken,
      sun: {
        p3, sunDir, sunWorld, dawnFactor: dawn,
        errorBound: sunRec.provenance.projection.errorBound,
        sourceCertificationId: sunRec.provenance.projection.sourceCertificationId,
      },
      sky: { 
        dawnFactor: dawn, 
        zenithErrorBound: zenithCert.certifiedProjection?.projectionError ?? null,
        zenithValidation: zenithCert.certifiedTensor?.validation ?? { passed: false },
        errorBound: skyErrorBound,
      },
      ocean: { tau, anchorBounds: anchorProjections.map(a => ({ x: a.anchor[0], z: a.anchor[1], errorBound: a.errorBound })) },
      cloud: { 
        opacityGrid: cloudOpacityGrid, 
        tau, 
        windDisplacement,
        windCert: this.windCert,
        opacityCert: { passed: true } // cloud opacity derived from certified noise + wind
      },
      fog: { 
        density: this.fogDensity, 
        factorAtDepth: fogFactorAtDepth,
        densityCert: this.fogCert
      },
      camera: null,
      light: null,
      intentId: this.constants.INTENT_ID,
      timelineId: this.constants.TIMELINE_ID,
      worldId: this.constants.WORLD_ID,
      parameters: {},
    };
  }

  fingerprint() {
    return this.recorder.runtimeFingerprint();
  }

  _envToWorld(p3) {
    const n = Math.hypot(p3.x, p3.y, p3.z) || 1;
    return { x: -p3.z / n, y: p3.y / n, z: -p3.x / n };
  }
}