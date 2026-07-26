import { applyMat4ToVec4, multiplyMat4, perspectiveMat4 } from "./mat4.js";
import { Ray3D, buildBasis } from "./geometry.js";
import { add3, dot3, normalize3, scale3, vec3 } from "./vec3.js";

export function lookAtMat4(eye, target, worldUp = vec3(0, 1, 0)) {
  const basis = buildBasis({
    x: target.x - eye.x,
    y: target.y - eye.y,
    z: target.z - eye.z,
  }, worldUp);
  return [
    basis.right.x, basis.up.x, -basis.forward.x, 0,
    basis.right.y, basis.up.y, -basis.forward.y, 0,
    basis.right.z, basis.up.z, -basis.forward.z, 0,
    -dot3(basis.right, eye), -dot3(basis.up, eye), dot3(basis.forward, eye), 1,
  ];
}

export class Camera3D {
  constructor(options = {}) {
    this.position = options.position ?? vec3(0, 0, 5);
    this.target = options.target ?? vec3();
    this.up = options.up ?? vec3(0, 1, 0);
    this.fovY = options.fovY ?? Math.PI / 3;
    this.aspect = options.aspect ?? 1;
    this.near = options.near ?? 0.1;
    this.far = options.far ?? 1000;
  }

  getViewMatrix() {
    return lookAtMat4(this.position, this.target, this.up);
  }

  getProjectionMatrix() {
    return perspectiveMat4(this.fovY, this.aspect, this.near, this.far);
  }

  getViewProjectionMatrix() {
    return multiplyMat4(this.getProjectionMatrix(), this.getViewMatrix());
  }
}

export function screenToRay3D(camera, screenX, screenY, viewportWidth, viewportHeight) {
  const ndcX = (screenX / viewportWidth) * 2 - 1;
  const ndcY = 1 - (screenY / viewportHeight) * 2;
  const forward = normalize3({
    x: camera.target.x - camera.position.x,
    y: camera.target.y - camera.position.y,
    z: camera.target.z - camera.position.z,
  });
  const basis = buildBasis(forward, camera.up);
  const halfHeight = Math.tan(camera.fovY / 2);
  const direction = normalize3(add3(
    forward,
    add3(scale3(basis.right, ndcX * halfHeight * camera.aspect), scale3(basis.up, ndcY * halfHeight)),
  ));
  return new Ray3D(camera.position, direction, camera.near, camera.far);
}

export const worldToClip3D = (point, viewProjectionMatrix) => applyMat4ToVec4(
  viewProjectionMatrix,
  { x: point.x, y: point.y, z: point.z, w: 1 },
);

export function clipToNDC3D(clip) {
  if (Math.abs(clip.w) <= 1e-12) return vec3(clip.x, clip.y, clip.z);
  return vec3(clip.x / clip.w, clip.y / clip.w, clip.z / clip.w);
}

export const ndcToScreen3D = (ndc, width, height) => ({
  x: (ndc.x * 0.5 + 0.5) * width,
  y: (1 - (ndc.y * 0.5 + 0.5)) * height,
  depth: ndc.z,
});

export const worldToScreen3D = (point, viewProjectionMatrix, width, height) => (
  ndcToScreen3D(clipToNDC3D(worldToClip3D(point, viewProjectionMatrix)), width, height)
);
