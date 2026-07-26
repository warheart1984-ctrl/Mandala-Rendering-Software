import { Camera4D } from "./Camera4D.js";

export const DEFAULT_CHARACTER_CAMERA = Object.freeze({
  focalLengthMm: 85,
  apertureF: 2.8,
  focusDistance: 3,
  position: [0, 1.55, 3.2],
  target: [0, 1.45, 0],
  sensorWidthMm: 36,
});

export function normalizeCharacterCameraConfig(config = {}) {
  const cfg = { ...DEFAULT_CHARACTER_CAMERA, ...config };
  return {
    focalLengthMm: Number(cfg.focalLengthMm),
    apertureF: Number(cfg.apertureF),
    focusDistance: Number(cfg.focusDistance),
    position: [Number(cfg.position[0]), Number(cfg.position[1]), Number(cfg.position[2])],
    target: [Number(cfg.target[0]), Number(cfg.target[1]), Number(cfg.target[2])],
    sensorWidthMm: Number(cfg.sensorWidthMm ?? DEFAULT_CHARACTER_CAMERA.sensorWidthMm),
  };
}

export class CharacterCamera {
  constructor(config = {}) {
    this.config = normalizeCharacterCameraConfig(config);
  }

  get fovYDegrees() {
    const sensor = this.config.sensorWidthMm;
    return (2 * Math.atan(sensor / (2 * this.config.focalLengthMm)) * 180) / Math.PI;
  }

  get lensRadius() {
    return this.config.focalLengthMm / Math.max(1, this.config.apertureF) / 1000;
  }

  toCamera4D(options = {}) {
    const p = this.config.position;
    const t = this.config.target;
    const fov = this.fovYDegrees;
    return new Camera4D({
      x: p[0], y: p[1], z: p[2], w: options.w ?? 0,
      lx: t[0], ly: t[1], lz: t[2], lw: options.lookAtW ?? 0,
      fovX: options.fovX ?? fov,
      fovY: options.fovY ?? fov,
      fovZ: options.fovZ ?? Math.min(45, fov),
      fovW: options.fovW ?? 12,
      width: options.width,
      height: options.height,
      lensRadius: options.enableDof === false ? 0 : this.lensRadius,
      focalDistance: this.config.focusDistance,
    });
  }

  serialize() {
    return normalizeCharacterCameraConfig(this.config);
  }
}
