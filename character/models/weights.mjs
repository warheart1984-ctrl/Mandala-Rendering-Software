/**
 * Heat-style skin weights (4 influences / vertex).
 *
 * Vertex groups for sim hooks:
 *   cloth_cloak, hair_scalp, collide_hips, collide_shoulders, collide_chest
 *
 * STATUS: enforced (deterministic nearest-bone). Hand-painted production weights: partial.
 */
function dist2(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function closestOnSegment(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const ab2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1e-8;
  let t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / ab2;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
}

/**
 * @param {number[][]} positions
 * @param {{ bones: {id:string,head:number[],tail:number[]}[] }} armature
 * @param {string[]} [regions]
 */
export function paintWeights(positions, armature, regions = []) {
  const bones = armature.bones;
  const joints = [];
  const weights = [];

  for (let vi = 0; vi < positions.length; vi++) {
    const p = positions[vi];
    const scored = bones.map((b, i) => {
      const c = closestOnSegment(p, b.head, b.tail);
      const d = Math.sqrt(dist2(p, c)) + 1e-4;
      return { i, w: 1 / (d * d) };
    });
    scored.sort((a, b) => b.w - a.w);
    const top = scored.slice(0, 4);
    const sum = top.reduce((s, x) => s + x.w, 0) || 1;
    const j = [0, 0, 0, 0];
    const w = [0, 0, 0, 0];
    top.forEach((x, k) => {
      j[k] = x.i;
      w[k] = x.w / sum;
    });
    joints.push(j);
    weights.push(w);
  }

  const groups = {
    cloth_cloak: [],
    hair_scalp: [],
    collide_hips: [],
    collide_shoulders: [],
    collide_chest: [],
  };

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const region = regions[i] || "";
    if (p[1] > 1.5 && p[1] < 1.75 && Math.abs(p[2]) > 0.02) groups.cloth_cloak.push(i);
    if (p[1] > 1.95) groups.hair_scalp.push(i);
    if (p[1] > 0.85 && p[1] < 1.15 && Math.abs(p[0]) < 0.22) groups.collide_hips.push(i);
    if (p[1] > 1.55 && p[1] < 1.72) groups.collide_shoulders.push(i);
    if (p[1] > 1.35 && p[1] < 1.58) groups.collide_chest.push(i);
    if (region.startsWith("head") && p[1] > 2.0) {
      if (!groups.hair_scalp.includes(i)) groups.hair_scalp.push(i);
    }
  }

  return { joints, weights, groups };
}
