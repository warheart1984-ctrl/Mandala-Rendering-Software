/**
 * Hair curves / cards from the scalp vertex group.
 * STATUS: partial (Verlet strands). Groom production: declared.
 */
import { resolveCollisions } from "./collision.mjs";

export function initHair(asset, volumes, strandCount = 8, segments = 6) {
  const scalp = asset.skin.groups.hair_scalp;
  const sources = scalp.length ? scalp : asset.mesh.positions
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p[1] > 2.0)
    .map((x) => x.i);
  const strands = [];
  const n = Math.min(strandCount, Math.max(1, sources.length));
  for (let s = 0; s < n; s++) {
    const vi = sources[Math.floor(s * sources.length / n)];
    const root = [...asset.mesh.positions[vi]];
    const particles = [];
    for (let k = 0; k < segments; k++) {
      const p = [root[0] + (s - n / 2) * 0.01, root[1] - k * 0.04, root[2] + 0.02 - k * 0.01];
      particles.push({ p, prev: [...p], pinned: k === 0 });
    }
    strands.push({ particles });
  }
  return { strands, volumes, steps: 0 };
}

export function stepHair(state, dt = 1 / 24) {
  const g = -4.0 * dt * dt;
  for (const strand of state.strands) {
    for (const pt of strand.particles) {
      if (pt.pinned) continue;
      const vx = pt.p[0] - pt.prev[0];
      const vy = pt.p[1] - pt.prev[1];
      const vz = pt.p[2] - pt.prev[2];
      pt.prev = [...pt.p];
      pt.p[0] += vx * 0.9;
      pt.p[1] += vy * 0.9 + g;
      pt.p[2] += vz * 0.9;
      pt.p = resolveCollisions(pt.p, state.volumes);
    }
    for (let i = 1; i < strand.particles.length; i++) {
      const a = strand.particles[i - 1];
      const b = strand.particles[i];
      const rest = 0.04;
      const dx = b.p[0] - a.p[0], dy = b.p[1] - a.p[1], dz = b.p[2] - a.p[2];
      const len = Math.hypot(dx, dy, dz) || 1e-8;
      const diff = (len - rest) / len;
      if (!b.pinned) {
        b.p[0] -= dx * diff;
        b.p[1] -= dy * diff;
        b.p[2] -= dz * diff;
      }
    }
  }
  state.steps += 1;
  return state;
}

export function hairPolylines(state) {
  return state.strands.map((s) => s.particles.map((p) => p.p));
}
