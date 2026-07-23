/**
 * 4D → 3D → 2D perspective projection.
 */

/**
 * Project a 4D point to 3D using perspective division.
 * @param {{x,y,z,w}} p - 4D point
 * @param {number} d4 - 4D camera distance
 * @returns {{x,y,z}} 3D point
 */
export function project4Dto3D(p, d4 = 4.0, nearClip = Math.abs(d4) * 0.05) {
  const denom = d4 - p.w;
  const visible = Number.isFinite(denom) && denom > nearClip;
  if (!visible) return { x: 0, y: 0, z: 0, visible: false };
  const k = d4 / denom;
  return { x: k * p.x, y: k * p.y, z: k * p.z, visible: true };
}

/**
 * Project a 3D point to 2D screen coordinates.
 * @param {{x,y,z}} p - 3D point
 * @param {number} width - screen width
 * @param {number} height - screen height
 * @param {number} d3 - 3D camera distance
 * @param {number} scale - pixel scale factor
 * @returns {{X: number, Y: number, z: number}} 2D screen coords + depth
 */
export function project3Dto2D(p, width, height, d3 = 4.0, scale = 80, nearClip = Math.abs(d3) * 0.05) {
  const denom = d3 - p.z;
  const visible = p.visible !== false && Number.isFinite(denom) && denom > nearClip;
  if (!visible) return { X: 0, Y: 0, z: p.z, visible: false };
  const k = d3 / denom;
  return {
    X: width / 2 + k * p.x * scale,
    Y: height / 2 - k * p.y * scale,
    z: p.z,
    visible: true,
  };
}

/**
 * Full pipeline: 4D → 3D → 2D.
 */
export function project4Dto2D(p, width, height, d4 = 4.0, d3 = 4.0, scale = 80) {
  const p3 = project4Dto3D(p, d4);
  const p2 = project3Dto2D(p3, width, height, d3, scale);
  return { ...p2, w: p.w };
}

function clipSegment(points, signedDistance) {
  const [a, b] = points;
  const da = signedDistance(a), db = signedDistance(b);
  if (da < 0 && db < 0) return null;
  if (da >= 0 && db >= 0) return [a, b];
  const t = da / (da - db);
  const hit = Object.fromEntries(Object.keys(a).filter((k) => typeof a[k] === "number").map((k) => [k, a[k] + (b[k] - a[k]) * t]));
  return da >= 0 ? [a, hit] : [hit, b];
}

export function projectEdge4Dto2D(a, b, width, height, d4 = 4, d3 = 4, scale = 80) {
  const near4 = Math.abs(d4) * 0.05, near3 = Math.abs(d3) * 0.05;
  const clipped4 = clipSegment([a, b], (p) => d4 - p.w - near4);
  if (!clipped4) return null;
  const points3 = clipped4.map((p) => project4Dto3D(p, d4, 0));
  const clipped3 = clipSegment(points3, (p) => d3 - p.z - near3);
  if (!clipped3) return null;
  const points2 = clipped3.map((p) => project3Dto2D(p, width, height, d3, scale, 0));
  points2[0].w = clipped4[0].w;
  points2[1].w = clipped4[1].w;
  return points2;
}
