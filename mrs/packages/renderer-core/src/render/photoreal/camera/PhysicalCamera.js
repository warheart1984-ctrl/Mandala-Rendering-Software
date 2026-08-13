import { V3 } from "../material/PhotorealUtils.js";

/**
 * Physical Camera with Depth of Field and Motion Blur
 * Pure 3D - no 4D input
 */
export class PhysicalCamera {
  /**
   * @param {Object} config
   * @param {number} config.fov - vertical field of view in degrees
   * @param {number} config.focalLength - focal length in mm
   * @param {number[]} config.sensorSize - [width, height] in mm
   * @param {number} config.aperture - f-number (f-stop)
   * @param {number} config.focusDistance - focus distance in world units
   * @param {number} config.shutterAngle - shutter angle in degrees (180 = filmic)
   * @param {number} config.shutterOffset - shutter offset (-0.5 to 0.5)
   * @param {number[]} config.eye - camera position
   * @param {number[]} config.target - look-at target
   * @param {number[]} config.up - up vector
   */
  constructor(config = {}) {
    this.fov = config.fov ?? 60;
    this.focalLength = config.focalLength ?? 35; // mm
    this.sensorSize = config.sensorSize ?? [36, 24]; // full frame 35mm
    this.aperture = config.aperture ?? 2.8;
    this.focusDistance = config.focusDistance ?? 10;
    this.shutterAngle = config.shutterAngle ?? 180;
    this.shutterOffset = config.shutterOffset ?? 0;
    
    this.eye = config.eye || [0, 0, 0];
    this.target = config.target || [0, 0, -1];
    this.up = config.up || [0, 1, 0];
    this.imageWidth = config.imageWidth;
    this.imageHeight = config.imageHeight;
    
    this._updateViewMatrix();
    this._computeProjectionParams();
  }

  _updateViewMatrix() {
    const forward = V3.normalize(V3.sub(this.target, this.eye));
    const right = V3.normalize(V3.cross(forward, this.up));
    const up = V3.cross(right, forward);
    
    this.viewMatrix = {
      right, up, forward,
      eye: this.eye
    };
    
    // View matrix (world to camera)
    this.worldToCamera = [
      right[0], up[0], -forward[0], 0,
      right[1], up[1], -forward[1], 0,
      right[2], up[2], -forward[2], 0,
      -V3.dot(right, this.eye), -V3.dot(up, this.eye), V3.dot(forward, this.eye), 1
    ];
    
    // Inverse (camera to world)
    this.cameraToWorld = [
      right[0], right[1], right[2], 0,
      up[0], up[1], up[2], 0,
      -forward[0], -forward[1], -forward[2], 0,
      this.eye[0], this.eye[1], this.eye[2], 1
    ];
  }

  _computeProjectionParams() {
    // Vertical FOV to focal length in pixels
    const sensorH = this.sensorSize[1];
    this.focalPixels = (this.focalLength / sensorH) * this.imageHeight;
    
    // Aperture radius in world units
    this.apertureRadius = this.focusDistance / (2 * this.aperture);
    
    // Circle of confusion
    this.cocScale = this.focalLength / (this.aperture * this.focusDistance);
  }

  setResolution(width, height) {
    this.imageWidth = width;
    this.imageHeight = height;
    this._computeProjectionParams();
  }

  setEye(eye) {
    this.eye = eye;
    this._updateViewMatrix();
  }

  setTarget(target) {
    this.target = target;
    this._updateViewMatrix();
  }

  setFocusDistance(dist) {
    this.focusDistance = dist;
    this._computeProjectionParams();
  }

  setAperture(fStop) {
    this.aperture = fStop;
    this._computeProjectionParams();
  }

  /**
   * Generate primary ray for pixel (x, y) with DoF and motion blur
   * @param {number} x - pixel x (0 to width)
   * @param {number} y - pixel y (0 to height)
   * @param {number} time - normalized time in [0, 1] for motion blur
   * @param {PhotorealRNG} rng
   * @returns {Object} { origin, direction, weight }
   */
  generateRay(x, y, time, rng) {
    // Normalized device coordinates (y-inverted for camera space convention)
    const ndcX = (x + 0.5) / this.imageWidth * 2 - 1;
    const ndcY = 1 - (y + 0.5) / this.imageHeight * 2;
    
    // Aspect ratio correction
    const aspect = this.imageWidth / this.imageHeight;
    const fovRad = this.fov * Math.PI / 180;
    const scale = Math.tan(fovRad * 0.5);
    
    // Ray direction in camera space
    let camDir = V3.normalize([
      ndcX * scale * (this.imageWidth / this.imageHeight),
      ndcY * scale,
      -1
    ]);
    
    // Transform to world space
    const { right, up, forward } = this.viewMatrix;
    const worldDir = V3.addVec(
      V3.addVec(V3.mul(this.viewMatrix.right, camDir[0]),
                V3.mul(this.viewMatrix.up, camDir[1])),
      V3.mul(this.viewMatrix.forward, camDir[2])
    );
    
    // Depth of Field - sample aperture
    let origin = this.eye;
    if (this.aperture > 0 && this.apertureRadius > 0) {
      const u1 = Math.random();
      const u2 = Math.random();
      const r = this.apertureRadius * Math.sqrt(u1);
      const theta = 2 * Math.PI * u2;
      const dx = r * Math.cos(theta);
      const dy = r * Math.sin(theta);
      
      // Focus plane intersection
      const focusPoint = V3.add(this.eye, V3.mul(camDir, this.focusDistance));
      const apertureOffset = V3.add(V3.mul(this.viewMatrix.right, dx), V3.mul(this.viewMatrix.up, dy));
      origin = V3.add(this.eye, apertureOffset);
      camDir = V3.normalize(V3.sub(focusPoint, origin));
    }
    
    // Motion blur - time offset
    const shutterTime = (this.shutterAngle / 360) * (1 / 30); // assuming 30 fps
    const timeOffset = (time - 0.5) * shutterTime * this.shutterOffset;
    // In a real implementation, this would transform the ray based on camera velocity
    // For now, just return the ray
    
    return {
      origin,
      direction: V3.normalize(camDir),
      weight: 1.0,
      time: timeOffset
    };
  }

  /**
   * Generate ray for pixel (simpler version for path tracing)
   */
  generateRaySimple(x, y, rng) {
    const ndcX = (x + 0.5) / this.imageWidth * 2 - 1;
    const ndcY = (y + 0.5) / this.imageHeight * 2 - 1;
    
    const aspect = this.imageWidth / this.imageHeight;
    const fovRad = this.fov * Math.PI / 180;
    const scale = Math.tan(fovRad * 0.5);
    
    const camDir = V3.normalize([
      ndcX * scale * aspect,
      ndcY * scale,
      -1
    ]);
    
    const { right, up, forward } = this.viewMatrix;
    const worldDir = V3.addVec(
      V3.addVec(V3.mul(this.viewMatrix.right, camDir[0]),
                V3.mul(this.viewMatrix.up, camDir[1])),
      V3.mul(this.viewMatrix.forward, camDir[2])
    );
    
    // Depth of Field
    let origin = this.eye;
    let direction = worldDir;
    
    if (this.aperture > 0 && this.apertureRadius > 0) {
      // Sample aperture
      const u1 = Math.random();
      const u2 = Math.random();
      const r = this.apertureRadius * Math.sqrt(Math.random());
      const theta = 2 * Math.PI * Math.random();
      const dx = r * Math.cos(theta);
      const dy = r * Math.sin(theta);
      
      // Focus plane intersection
      const focusPoint = V3.add(this.eye, V3.mul(V3.normalize(camDir), this.focusDistance));
      const apertureOffset = V3.add(V3.mul(this.viewMatrix.right, dx), V3.mul(this.viewMatrix.up, dy));
      origin = V3.add(this.eye, apertureOffset);
      direction = V3.normalize(V3.sub(focusPoint, origin));
    }
    
    return { origin, direction, weight: 1.0 };
  }

  /**
   * Static factory for cinematic camera
   */
  static cinematic(N, FRAMES, W, H) {
    const t = N / FRAMES;
    const twoPi = 2 * Math.PI;
    const eye = [
      0.40 * Math.sin(twoPi * 0.11 * t),
      1.30 + 0.06 * Math.sin(twoPi * 0.07 * t),
      2.60
    ];
    const target = [
      1.80 * Math.sin(twoPi * 0.05 * t),
      0.55,
      -8.00
    ];
    
    
    return new PhysicalCamera({
      eye,
      target,
      focalLength: 35,
      sensorSize: [36, 24],
      aperture: 2.8,
      focusDistance: 10,
      shutterAngle: 180,
      fov: 60,
      imageWidth: W,
      imageHeight: H
    });
  }

  // Helper for depth of field
  depthOfField(depth) {
    const coc = Math.abs(depth - this.focusDistance) * this.cocScale;
    return { cocRadius: coc, focusDistance: this.focusDistance };
  }
}

export { V3 } from "../material/PhotorealUtils.js";