/**
 * Compatibility shim — 4D math SoT is `4d-renderer`.
 * Prefer importing from `../mrs/packages/renderer-core/src/index.js` in new code.
 */
import {
  project4Dto3D,
  project3Dto2D,
  project4Dto2D,
  cinematicRotation,
} from "../mrs/packages/renderer-core/src/index.js";

export {
  project4Dto3D,
  project3Dto2D,
  project4Dto2D,
  cinematicRotation,
};

export const D4_DEFAULT = 4.0;
export const D3_DEFAULT = 4.0;

/** @deprecated Use getSurface("tesseract") + sampleSurface from 4d-renderer. */
export function buildTesseractVertices() {
  const verts = [];
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        for (const w of [-1, 1]) {
          verts.push({ x, y, z, w });
        }
      }
    }
  }
  return verts;
}

/** @deprecated Use sampleSurface(getSurface("tesseract")).edges */
export function buildEdges(verts) {
  const edges = [];
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      let diff = 0;
      if (verts[i].x !== verts[j].x) diff++;
      if (verts[i].y !== verts[j].y) diff++;
      if (verts[i].z !== verts[j].z) diff++;
      if (verts[i].w !== verts[j].w) diff++;
      if (diff === 1) edges.push([i, j]);
    }
  }
  return edges;
}

/**
 * Combined 4D rotation matching prior rotate4D(p, theta, weights) API.
 */
export function rotate4D(
  p,
  theta,
  weights = { xw: 0.7, yz: 1.1, zw: 1.5, yw: 2.0 },
) {
  return cinematicRotation(theta, weights)(p);
}

export function wDepth01(w) {
  return Math.min(1, Math.max(0, (w + 1.5) / 3));
}

export function rotateXW(p, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: c * p.x - s * p.w, y: p.y, z: p.z, w: s * p.x + c * p.w };
}
export function rotateYZ(p, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: p.x, y: c * p.y - s * p.z, z: s * p.y + c * p.z, w: p.w };
}
export function rotateZW(p, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: p.x, y: p.y, z: c * p.z - s * p.w, w: s * p.z + c * p.w };
}
export function rotateYW(p, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: p.x, y: c * p.y - s * p.w, z: p.z, w: s * p.y + c * p.w };
}
export function rotateXY(p, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: c * p.x - s * p.y, y: s * p.x + c * p.y, z: p.z, w: p.w };
}
export function rotateXZ(p, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: c * p.x - s * p.z, y: p.y, z: s * p.x + c * p.z, w: p.w };
}
