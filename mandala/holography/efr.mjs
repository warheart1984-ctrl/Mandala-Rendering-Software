/**
 * EFR — Entanglement Field Rendering (Claim A).
 * CPU PNG path is **partial** / working. GLSL shaders are templates (see shaders/).
 *
 * Modes: HEATMAP | CAUSAL | EMERGENT_GEOMETRY | COMBINED
 * ρ → brightness, w_ij → edge strokes, K → color warp, CausalLinks → arrows.
 */

export const EFR_STATUS = "partial";
export const EFR_MODES = Object.freeze({
  HEATMAP: "HEATMAP",
  CAUSAL: "CAUSAL",
  EMERGENT_GEOMETRY: "EMERGENT_GEOMETRY",
  COMBINED: "COMBINED",
  /** Boundary information density — not photoreal mesh beauty. */
  COMPOSITE: "COMPOSITE",
});
export const COMPOSITE_STATUS = "partial";
export const REALISTIC_MESH_STATUS = "declared";

function clampByte(x) {
  return Math.max(0, Math.min(255, Math.round(x)));
}

function boundsOf(egt) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of egt.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 1;
    minY = 0;
    maxY = 1;
  }
  return { minX, maxX, minY, maxY };
}

function toPixel(n, bounds, width, height, pad = 8) {
  const sx = (bounds.maxX - bounds.minX) || 1;
  const sy = (bounds.maxY - bounds.minY) || 1;
  const px = pad + ((n.x - bounds.minX) / sx) * (width - 2 * pad);
  // World Y-up → image Y-down so humanoid head stays at top of frame.
  const py = pad + ((bounds.maxY - n.y) / sy) * (height - 2 * pad);
  return { px: Math.round(px), py: Math.round(py) };
}

function setPx(rgb, width, height, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const o = (x + width * y) * 3;
  rgb[o] = r;
  rgb[o + 1] = g;
  rgb[o + 2] = b;
}

function blendPx(rgb, width, height, x, y, r, g, b, a = 1) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const o = (x + width * y) * 3;
  rgb[o] = clampByte(rgb[o] * (1 - a) + r * a);
  rgb[o + 1] = clampByte(rgb[o + 1] * (1 - a) + g * a);
  rgb[o + 2] = clampByte(rgb[o + 2] * (1 - a) + b * a);
}

function drawLine(rgb, width, height, x0, y0, x1, y1, color, thickness = 1, alpha = 0.85) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  const r = color[0];
  const g = color[1];
  const b = color[2];
  for (;;) {
    for (let ty = -thickness + 1; ty < thickness; ty++) {
      for (let tx = -thickness + 1; tx < thickness; tx++) {
        blendPx(rgb, width, height, x + tx, y + ty, r, g, b, alpha);
      }
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Soft bloom stroke — outer glow then bright core (energy wire look). */
function drawEnergyLine(rgb, width, height, x0, y0, x1, y1, color, coreThick = 1) {
  const glow = [
    clampByte(color[0] * 0.45),
    clampByte(color[1] * 0.55),
    clampByte(color[2] * 0.65),
  ];
  drawLine(rgb, width, height, x0, y0, x1, y1, glow, coreThick + 2, 0.22);
  drawLine(rgb, width, height, x0, y0, x1, y1, color, coreThick + 1, 0.45);
  drawLine(rgb, width, height, x0, y0, x1, y1, [255, 245, 230], coreThick, 0.55);
  drawLine(rgb, width, height, x0, y0, x1, y1, color, coreThick, 0.9);
}

function energyColorFromFields(rho, K, yNorm) {
  // Dual-tone: amber on high-ρ / upper body, cyan on cool / lower / causal.
  const warm = rho * 0.55 + Math.max(0, yNorm) * 0.35 + Math.max(0, K) * 0.15;
  if (warm >= 0.42) return [255, 120, 28]; // amber-orange
  if (warm >= 0.28) return [255, 180, 90]; // warm cream
  return [0, 200, 255]; // electric cyan
}

function fillBackground(rgb, cool = [12, 14, 28]) {
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = cool[0];
    rgb[i + 1] = cool[1];
    rgb[i + 2] = cool[2];
  }
}

function fillEnergyVoid(rgb, width, height) {
  for (let y = 0; y < height; y++) {
    const t = y / Math.max(1, height - 1);
    const r = clampByte(4 + t * 6);
    const g = clampByte(5 + t * 8);
    const b = clampByte(12 + t * 18);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      rgb[o] = r;
      rgb[o + 1] = g;
      rgb[o + 2] = b;
    }
  }
}

/** Orbital energy ellipses around the figure (reference energy aura). */
function drawEnergyOrbits(rgb, width, height, bounds) {
  const cx = width * 0.5;
  const cy = height * 0.48;
  const sx = ((bounds.maxX - bounds.minX) || 1);
  const sy = ((bounds.maxY - bounds.minY) || 1);
  const rx0 = Math.min(width, height) * 0.38;
  const ry0 = Math.min(width, height) * 0.52;
  const orbits = [
    { rx: rx0, ry: ry0, color: [0, 196, 255], phase: 0 },
    { rx: rx0 * 0.82, ry: ry0 * 1.05, color: [255, 110, 24], phase: 0.7 },
    { rx: rx0 * 1.08, ry: ry0 * 0.72, color: [80, 220, 255], phase: 1.4 },
  ];
  for (const orb of orbits) {
    const samples = 72;
    let prev = null;
    for (let s = 0; s <= samples; s++) {
      const a = (s / samples) * Math.PI * 2 + orb.phase;
      const x = Math.round(cx + Math.cos(a) * orb.rx);
      const y = Math.round(cy + Math.sin(a) * orb.ry * (sy / sx > 1.2 ? 1.05 : 1));
      if (prev) drawEnergyLine(rgb, width, height, prev.x, prev.y, x, y, orb.color, 1);
      prev = { x, y };
    }
  }
}

function rhoRange(egt) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < egt.rho.length; i++) {
    const v = egt.rho[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max, span: max - min || 1 };
}

function kRange(egt) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < egt.K.length; i++) {
    const v = egt.K[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max, span: max - min || 1 };
}

/**
 * Entanglement heatmap: ρ brightness + soft K tint.
 */
export function renderEGTHeatmap(egt, { width = 384, height = 192 } = {}) {
  const rgb = new Uint8Array(width * height * 3);
  fillBackground(rgb);
  const bounds = boundsOf(egt);
  const rr = rhoRange(egt);
  const kr = kRange(egt);

  for (const e of egt.edges) {
    const a = egt.nodes[e.i];
    const b = egt.nodes[e.j];
    const pa = toPixel(a, bounds, width, height);
    const pb = toPixel(b, bounds, width, height);
    const th = Math.max(1, Math.round(e.w_ij * 2));
    const glow = clampByte(40 + e.w_ij * 120);
    drawLine(rgb, width, height, pa.px, pa.py, pb.px, pb.py, [glow, glow, clampByte(glow + 40)], th);
  }

  for (const n of egt.nodes) {
    const { px, py } = toPixel(n, bounds, width, height);
    const t = (egt.rho[n.id] - rr.min) / rr.span;
    const k = (egt.K[n.id] - kr.min) / kr.span;
    const r = clampByte(30 + t * 200 + k * 40);
    const g = clampByte(40 + t * 160 * (1 - 0.3 * k));
    const b = clampByte(80 + (1 - t) * 140);
    const rad = 1 + Math.round(t * 2);
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy <= rad * rad) {
          setPx(rgb, width, height, px + dx, py + dy, r, g, b);
        }
      }
    }
  }

  return {
    mode: EFR_MODES.HEATMAP,
    width,
    height,
    rgb,
    note: "ρ brightness / w edge glow / K tint — correlation proxy viz",
  };
}

/**
 * Causal flow field: directed marks along CausalLinks.
 */
export function renderEGTCausal(egt, { width = 384, height = 192 } = {}) {
  const rgb = new Uint8Array(width * height * 3);
  fillBackground(rgb, [8, 16, 22]);
  const bounds = boundsOf(egt);
  const links = egt.C || egt.causalLinks || [];

  for (const link of links) {
    const a = egt.nodes[link.from];
    const b = egt.nodes[link.to];
    if (!a || !b) continue;
    const pa = toPixel(a, bounds, width, height);
    const pb = toPixel(b, bounds, width, height);
    const s = link.strength ?? 0.5;
    const col = [clampByte(40 + s * 80), clampByte(180 + s * 50), clampByte(160 + s * 40)];
    drawLine(rgb, width, height, pa.px, pa.py, pb.px, pb.py, col, 1);
    // Arrow head near target
    const mx = Math.round(pa.px + 0.75 * (pb.px - pa.px));
    const my = Math.round(pa.py + 0.75 * (pb.py - pa.py));
    setPx(rgb, width, height, mx, my, 255, 220, 80);
    setPx(rgb, width, height, mx + 1, my, 255, 200, 60);
  }

  for (const n of egt.nodes) {
    const { px, py } = toPixel(n, bounds, width, height);
    setPx(rgb, width, height, px, py, 220, 230, 240);
  }

  return {
    mode: EFR_MODES.CAUSAL,
    width,
    height,
    rgb,
    note: "CausalLinks directional marks — ordering proxy, not lightlike geodesics",
  };
}

/**
 * Emergent geometry: mesh net warped by K (simple vertex offset).
 */
export function renderEGTEmergentGeometry(egt, { width = 384, height = 192 } = {}) {
  const rgb = new Uint8Array(width * height * 3);
  fillBackground(rgb, [18, 12, 24]);
  const bounds = boundsOf(egt);
  const kr = kRange(egt);
  const warped = egt.nodes.map((n) => {
    const k = (egt.K[n.id] - kr.min) / kr.span;
    return {
      ...n,
      x: n.x + 0.08 * (k - 0.5),
      y: n.y - 0.12 * k,
    };
  });

  for (const e of egt.edges) {
    const a = warped[e.i];
    const b = warped[e.j];
    const pa = toPixel(a, bounds, width, height);
    const pb = toPixel(b, bounds, width, height);
    const k = ((egt.K[e.i] + egt.K[e.j]) * 0.5 - kr.min) / kr.span;
    drawLine(
      rgb,
      width,
      height,
      pa.px,
      pa.py,
      pb.px,
      pb.py,
      [clampByte(100 + k * 120), clampByte(80 + (1 - k) * 100), clampByte(180)],
      1,
    );
  }

  for (const n of warped) {
    const { px, py } = toPixel(n, bounds, width, height);
    const k = (egt.K[n.id] - kr.min) / kr.span;
    setPx(
      rgb,
      width,
      height,
      px,
      py,
      clampByte(200 * k + 40),
      clampByte(120),
      clampByte(255 * (1 - k)),
    );
  }

  return {
    mode: EFR_MODES.EMERGENT_GEOMETRY,
    width,
    height,
    rgb,
    status: "partial",
    note: "Mesh warp by K — toy emergent geometry, not Einstein h_ij dynamics",
  };
}

/**
 * Combined: heatmap base + causal marks overlay.
 */
export function renderEGTCombined(egt, opts = {}) {
  const heat = renderEGTHeatmap(egt, opts);
  const causal = renderEGTCausal(egt, opts);
  const rgb = new Uint8Array(heat.rgb);
  for (let i = 0; i < rgb.length; i += 3) {
    // Lift causal cyan/yellow marks
    const cr = causal.rgb[i];
    const cg = causal.rgb[i + 1];
    const cb = causal.rgb[i + 2];
    if (cg > 100 && cb > 80) {
      rgb[i] = clampByte(rgb[i] * 0.4 + cr * 0.6);
      rgb[i + 1] = clampByte(rgb[i + 1] * 0.4 + cg * 0.6);
      rgb[i + 2] = clampByte(rgb[i + 2] * 0.4 + cb * 0.6);
    }
  }
  return {
    mode: EFR_MODES.COMBINED,
    width: heat.width,
    height: heat.height,
    rgb,
    note: "Dual overlay: ρ heatmap + causal flow (debug). COMPOSITE is the appearance path.",
  };
}

function hijDot(h, a, b) {
  const h00 = h?.[0] ?? 1;
  const h01 = h?.[1] ?? 0;
  const h02 = h?.[2] ?? 0;
  const h10 = h?.[3] ?? 0;
  const h11 = h?.[4] ?? 1;
  const h12 = h?.[5] ?? 0;
  const h20 = h?.[6] ?? 0;
  const h21 = h?.[7] ?? 0;
  const h22 = h?.[8] ?? 1;
  const hx = h00 * b[0] + h01 * b[1] + h02 * b[2];
  const hy = h10 * b[0] + h11 * b[1] + h12 * b[2];
  const hz = h20 * b[0] + h21 * b[1] + h22 * b[2];
  return a[0] * hx + a[1] * hy + a[2] * hz;
}

function normalize3(v) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

function mat3MulVec(h, v) {
  const m = h?.elements || h;
  const h00 = m?.[0] ?? 1;
  const h01 = m?.[1] ?? 0;
  const h02 = m?.[2] ?? 0;
  const h10 = m?.[3] ?? 0;
  const h11 = m?.[4] ?? 1;
  const h12 = m?.[5] ?? 0;
  const h20 = m?.[6] ?? 0;
  const h21 = m?.[7] ?? 0;
  const h22 = m?.[8] ?? 1;
  return [
    h00 * v[0] + h01 * v[1] + h02 * v[2],
    h10 * v[0] + h11 * v[1] + h12 * v[2],
    h20 * v[0] + h21 * v[1] + h22 * v[2],
  ];
}

/**
 * CPU analogue of holographic.vert / .frag for COMPOSITE PNG (optional path).
 * Official holo recorder uses raw .bin and skips this.
 */
export function shadeHolographicFromBuffers(buffers, uniforms, i, opts = {}) {
  const rawH = uniforms?.uInducedMetric?.value;
  const h = rawH?.elements || rawH || opts.h_ij;
  const aniso = uniforms?.uAnisotropy?.value ?? 1.2;
  const gain = uniforms?.uMuscleGain?.value ?? 0.3;
  const boneT = uniforms?.uBoneThreshold?.value ?? 0.8;
  const lightPos = uniforms?.uLightPos?.value || [2, 4, 3];
  const rho = buffers.entanglementDensity[i] || 0;
  const K = buffers.curvature[i] || 0;
  const wij = buffers.entanglementWeight[i] || 0;
  const dir = [
    buffers.entanglementDirection[i * 3] || 0,
    buffers.entanglementDirection[i * 3 + 1] || 0,
    buffers.entanglementDirection[i * 3 + 2] || 1,
  ];
  const bn = [
    buffers.baseNormal[i * 3] || 0,
    buffers.baseNormal[i * 3 + 1] || 0,
    buffers.baseNormal[i * 3 + 2] || 1,
  ];
  const hNormal = normalize3(mat3MulVec(h, bn));
  const muscle = rho * aniso * wij * gain;
  const boneFactor = K >= boneT ? 1 : 0;
  const px = buffers.position[i * 3] || 0;
  const py = buffers.position[i * 3 + 1] || 0;
  const pz = buffers.position[i * 3 + 2] || 0;
  const world = [
    px + hNormal[0] * muscle * (1 - boneFactor * 0.9) + dir[0] * muscle * 0.2,
    py + hNormal[1] * muscle * (1 - boneFactor * 0.9) + dir[1] * muscle * 0.2,
    pz + hNormal[2] * muscle * (1 - boneFactor * 0.9) + dir[2] * muscle * 0.2,
  ];
  const L = normalize3([lightPos[0] - world[0], lightPos[1] - world[1], lightPos[2] - world[2]]);
  const NoL = Math.max(0, hNormal[0] * L[0] + hNormal[1] * L[1] + hNormal[2] * L[2]);
  const energy = energyColorFromFields(rho, K, Math.max(0, Math.min(1, (py + 1) * 0.5)));
  const glow = Math.pow(Math.max(0, rho), 1.2) * 0.55 + NoL * 0.35;
  return {
    world,
    rho,
    rgb: [
      clampByte(energy[0] * (0.35 + glow)),
      clampByte(energy[1] * (0.35 + glow)),
      clampByte(energy[2] * (0.35 + glow)),
    ],
  };
}

/**
 * COMPOSITE: energy wire mesh (cyan/amber bloom) — Stage-1 look matching the
 * left reference panel. Still boundary information density, not photoreal.
 */
export function renderEGTComposite(egt, opts = {}) {
  const width = opts.width ?? 384;
  const height = opts.height ?? 512;
  const rgb = new Uint8Array(width * height * 3);
  fillEnergyVoid(rgb, width, height);
  const bounds = boundsOf(egt);
  const ySpan = (bounds.maxY - bounds.minY) || 1;
  const buffers = opts.holoBuffers;
  const appearance = egt.boundaryAppearance || {};
  const locked = appearance.boneLocked;
  const muscleSet = appearance.muscleSet;
  const boneSet = appearance.boneSet;
  const joints = appearance.joints || [];
  const vacuumRho = opts.vacuumRho ?? 0.05;
  const wantOrbits = opts.energyOrbits !== false;

  // Soft floor reflection strip
  for (let y = Math.floor(height * 0.78); y < height; y++) {
    const fade = (y - height * 0.78) / (height * 0.22);
    for (let x = 0; x < width; x++) {
      blendPx(rgb, width, height, x, y, 8, 14, 28, 0.15 + fade * 0.25);
    }
  }

  if (wantOrbits) drawEnergyOrbits(rgb, width, height, bounds);

  // Pass A — every edge as glowing energy filament (was nearly invisible dark purple)
  for (const e of egt.edges) {
    const a = egt.nodes[e.i];
    const b = egt.nodes[e.j];
    if (!a || !b) continue;
    const ia = a.id ?? e.i;
    const ib = b.id ?? e.j;
    const rhoA =
      buffers?.entanglementDensity?.[ia] ?? egt.rho?.[ia] ?? 0;
    const rhoB =
      buffers?.entanglementDensity?.[ib] ?? egt.rho?.[ib] ?? 0;
    const kA = buffers?.curvature?.[ia] ?? egt.K?.[ia] ?? 0;
    const kB = buffers?.curvature?.[ib] ?? egt.K?.[ib] ?? 0;
    const rho = (rhoA + rhoB) * 0.5;
    const K = (kA + kB) * 0.5;
    const yNorm = (((a.y + b.y) * 0.5) - bounds.minY) / ySpan;
    const color = energyColorFromFields(rho, K, yNorm);
    const pa = toPixel(a, bounds, width, height);
    const pb = toPixel(b, bounds, width, height);
    const boneBoost =
      (boneSet?.has?.(ia) || locked?.[ia] || boneSet?.has?.(ib) || locked?.[ib]) ? 1 : 0;
    drawEnergyLine(rgb, width, height, pa.px, pa.py, pb.px, pb.py, color, 1 + boneBoost);

    // Soft floor reflection for lower filaments
    const floorY = height * 0.88;
    if (pa.py > height * 0.55 || pb.py > height * 0.55) {
      const my0 = Math.round(floorY + (floorY - pa.py) * 0.28);
      const my1 = Math.round(floorY + (floorY - pb.py) * 0.28);
      drawLine(rgb, width, height, pa.px, my0, pb.px, my1, color, 1, 0.14);
    }
  }

  // Pass B — star / constellation nodes
  for (let i = 0; i < egt.nodes.length; i++) {
    const n = egt.nodes[i];
    const id = n.id ?? i;
    const rho =
      buffers?.entanglementDensity?.[id] ?? egt.rho?.[id] ?? 0;
    const K = buffers?.curvature?.[id] ?? egt.K?.[id] ?? 0;
    const keep =
      rho >= vacuumRho ||
      muscleSet?.has?.(id) ||
      boneSet?.has?.(id) ||
      locked?.[id];
    if (!keep) continue;
    const { px, py } = toPixel(n, bounds, width, height);
    const yNorm = (n.y - bounds.minY) / ySpan;
    const color = energyColorFromFields(rho, K, yNorm);
    const rad = 1 + Math.round(Math.min(3, rho * 3 + (muscleSet?.has?.(id) ? 1 : 0)));
    // outer glow
    for (let dy = -rad - 1; dy <= rad + 1; dy++) {
      for (let dx = -rad - 1; dx <= rad + 1; dx++) {
        if (dx * dx + dy * dy <= (rad + 1) * (rad + 1)) {
          blendPx(rgb, width, height, px + dx, py + dy, color[0], color[1], color[2], 0.25);
        }
      }
    }
    // cream core
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy <= rad * rad) {
          blendPx(rgb, width, height, px + dx, py + dy, 255, 230, 180, 0.95);
        }
      }
    }
  }

  // Pass C — joint sparks (d̂ flips)
  for (const j of joints) {
    const a = egt.nodes[j.i];
    const b = egt.nodes[j.j];
    if (!a || !b) continue;
    const pa = toPixel(a, bounds, width, height);
    const pb = toPixel(b, bounds, width, height);
    const mx = Math.round((pa.px + pb.px) / 2);
    const my = Math.round((pa.py + pb.py) / 2);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy <= 10) {
          blendPx(rgb, width, height, mx + dx, my + dy, 255, 200, 80, 0.75);
        }
      }
    }
  }

  // Pass D — causal filaments stay cyan-bright
  const links = egt.C || egt.causalLinks || [];
  for (const link of links) {
    if ((link.strength ?? 0) < 0.35) continue;
    const a = egt.nodes[link.from];
    const b = egt.nodes[link.to];
    if (!a || !b) continue;
    const pa = toPixel(a, bounds, width, height);
    const pb = toPixel(b, bounds, width, height);
    drawEnergyLine(rgb, width, height, pa.px, pa.py, pb.px, pb.py, [40, 220, 255], 1);
  }

  return {
    mode: EFR_MODES.COMPOSITE,
    width,
    height,
    rgb,
    status: COMPOSITE_STATUS,
    realisticMesh: REALISTIC_MESH_STATUS,
    usedHoloBuffers: Boolean(buffers?.entanglementDensity),
    note: "COMPOSITE energy wire mesh: cyan/amber bloom filaments + star nodes + orbits. Boundary density, not photoreal / Unreal PBR.",
    style: "energy_wire_mesh",
  };
}

export function renderEFR(egt, mode = EFR_MODES.HEATMAP, opts = {}) {
  const resolved =
    mode === "composite" || mode === "COMPOSITE" ? EFR_MODES.COMPOSITE : mode;
  switch (resolved) {
    case EFR_MODES.CAUSAL:
      return renderEGTCausal(egt, opts);
    case EFR_MODES.EMERGENT_GEOMETRY:
      return renderEGTEmergentGeometry(egt, opts);
    case EFR_MODES.COMBINED:
      return renderEGTCombined(egt, opts);
    case EFR_MODES.COMPOSITE:
      return renderEGTComposite(egt, opts);
    case EFR_MODES.HEATMAP:
    default:
      return renderEGTHeatmap(egt, opts);
  }
}

/**
 * Architecture alias: EntanglementRenderer.renderBoundary
 */
export function renderBoundary(egt, boundary, mode = EFR_MODES.HEATMAP, opts = {}) {
  return renderEFR(egt, mode, {
    ...opts,
    h_ij: opts.h_ij || boundary?.h_ij || egt.h_ij,
  });
}
