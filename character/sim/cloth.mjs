/**
 * Cloth sim — cloak grid hung from the shoulders.
 * STATUS: partial (Verlet + capsule collision). Production cloth solver: declared.
 */
import { resolveCollisions } from "./collision.mjs";

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * @param {object} asset  character asset
 * @param {object[]} volumes
 */
export function initCloak(asset, volumes, cols = 7, rows = 8) {
  const particles = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const u = x / (cols - 1);
      const v = y / (rows - 1);
      const px = (u - 0.5) * 0.42;
      const py = 1.62 - v * 0.55;
      const pz = -0.14 - v * 0.08;
      const pinned = y === 0 && (x === 0 || x === cols - 1 || x === Math.floor(cols / 2));
      particles.push({
        p: [px, py, pz],
        prev: [px, py, pz],
        pinned,
      });
    }
  }
  const constraints = [];
  const idx = (x, y) => y * cols + x;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x + 1 < cols) {
        const a = idx(x, y), b = idx(x + 1, y);
        constraints.push({ a, b, rest: dist(particles[a].p, particles[b].p) });
      }
      if (y + 1 < rows) {
        const a = idx(x, y), b = idx(x, y + 1);
        constraints.push({ a, b, rest: dist(particles[a].p, particles[b].p) });
      }
    }
  }
  return { cols, rows, particles, constraints, volumes, steps: 0 };
}

export function stepCloth(state, dt = 1 / 24) {
  const g = -3.2 * dt * dt;
  const wind = Math.sin(state.steps * 0.13) * 0.004;
  for (const pt of state.particles) {
    if (pt.pinned) continue;
    const vx = pt.p[0] - pt.prev[0];
    const vy = pt.p[1] - pt.prev[1];
    const vz = pt.p[2] - pt.prev[2];
    pt.prev = [...pt.p];
    pt.p[0] += vx * 0.96 + wind;
    pt.p[1] += vy * 0.96 + g;
    pt.p[2] += vz * 0.96;
    pt.p = resolveCollisions(pt.p, state.volumes);
    if (pt.p[1] < 0.05) pt.p[1] = 0.05;
  }
  for (let k = 0; k < 6; k++) {
    for (const c of state.constraints) {
      const a = state.particles[c.a];
      const b = state.particles[c.b];
      const dx = b.p[0] - a.p[0], dy = b.p[1] - a.p[1], dz = b.p[2] - a.p[2];
      const len = Math.hypot(dx, dy, dz) || 1e-8;
      const diff = (len - c.rest) / len * 0.5;
      if (!a.pinned) {
        a.p[0] += dx * diff; a.p[1] += dy * diff; a.p[2] += dz * diff;
      }
      if (!b.pinned) {
        b.p[0] -= dx * diff; b.p[1] -= dy * diff; b.p[2] -= dz * diff;
      }
    }
  }
  state.steps += 1;
  return state;
}

export function cloakEdges(state) {
  const edges = [];
  for (const c of state.constraints) {
    edges.push([state.particles[c.a].p, state.particles[c.b].p]);
  }
  return edges;
}
