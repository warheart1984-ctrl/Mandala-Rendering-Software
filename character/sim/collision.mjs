/**
 * Collision volumes for cloth/hair: hips, shoulders, chest.
 * STATUS: enforced (capsule SDF). Production collider meshes: declared.
 */
export function buildCollisionVolumes(species = "human") {
  const chestR = species === "anthro" ? 0.20 : 0.18;
  return [
    { id: "hips", a: [0, 0.90, 0], b: [0, 1.12, 0], radius: 0.16, group: "collide_hips" },
    { id: "chest", a: [0, 1.38, 0], b: [0, 1.58, 0], radius: chestR, group: "collide_chest" },
    { id: "shoulder.L", a: [-0.18, 1.62, 0], b: [-0.26, 1.62, 0], radius: 0.08, group: "collide_shoulders" },
    { id: "shoulder.R", a: [0.18, 1.62, 0], b: [0.26, 1.62, 0], radius: 0.08, group: "collide_shoulders" },
  ];
}

export function capsuleResolve(p, a, b, radius) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const ab2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
  let t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / ab2;
  t = Math.max(0, Math.min(1, t));
  const c = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1e-8;
  if (len >= radius) return p;
  const s = radius / len;
  return [c[0] + d[0] * s, c[1] + d[1] * s, c[2] + d[2] * s];
}

export function resolveCollisions(p, volumes) {
  let q = p;
  for (const v of volumes) q = capsuleResolve(q, v.a, v.b, v.radius);
  return q;
}
