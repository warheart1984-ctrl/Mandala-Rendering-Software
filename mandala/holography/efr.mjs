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

function drawLine(rgb, width, height, x0, y0, x1, y1, color, thickness = 1) {
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
        blendPx(rgb, width, height, x + tx, y + ty, r, g, b, 0.85);
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

function fillBackground(rgb, cool = [12, 14, 28]) {
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = cool[0];
    rgb[i + 1] = cool[1];
    rgb[i + 2] = cool[2];
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
  const bc = uniforms?.uBoundaryColor?.value || [0x8a / 255, 0x5c / 255, 1];
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
  const sss = Math.pow(Math.max(0, rho), 1.5) * 0.6;
  return {
    world,
    rho,
    rgb: [
      clampByte((bc[0] * 0.2 + bc[0] * NoL + sss * bc[0]) * 255),
      clampByte((bc[1] * 0.2 + bc[1] * NoL + sss * bc[1]) * 255),
      clampByte((bc[2] * 0.2 + bc[2] * NoL + sss * bc[2]) * 255),
    ],
  };
}

/**
 * COMPOSITE: bulk wire + boundary skin + causal flow (CPU PNG optional path).
 */
export function renderEGTComposite(egt, opts = {}) {
  const width = opts.width ?? 384;
  const height = opts.height ?? 512;
  const rgb = new Uint8Array(width * height * 3);
  fillBackground(rgb, [10, 9, 14]);
  const bounds = boundsOf(egt);
  const h = opts.h_ij || egt.h_ij;
  const buffers = opts.holoBuffers;
  const uniforms = opts.uniforms;
  const appearance = egt.boundaryAppearance || {};
  const locked = appearance.boneLocked;
  const muscleSet = appearance.muscleSet;
  const boneSet = appearance.boneSet;
  const joints = appearance.joints || [];
  const L = [0.45, 0.72, 0.53];
  const Ln = Math.hypot(L[0], L[1], L[2]) || 1;
  const light = [L[0] / Ln, L[1] / Ln, L[2] / Ln];
  const vacuumRho = opts.vacuumRho ?? 0.05;

  for (const e of egt.edges) {
    const a = egt.nodes[e.i];
    const b = egt.nodes[e.j];
    if (!a || !b) continue;
    const pa = toPixel(a, bounds, width, height);
    const pb = toPixel(b, bounds, width, height);
    drawLine(rgb, width, height, pa.px, pa.py, pb.px, pb.py, [42, 36, 58], 1);
  }

  for (const e of egt.edges) {
    const iBone = boneSet?.has?.(e.i) || locked?.[e.i];
    const jBone = boneSet?.has?.(e.j) || locked?.[e.j];
    if (!iBone && !jBone) continue;
    const a = egt.nodes[e.i];
    const b = egt.nodes[e.j];
    const pa = toPixel(a, bounds, width, height);
    const pb = toPixel(b, bounds, width, height);
    const stiff = locked?.[e.i] && locked?.[e.j] ? 1 : 0.55;
    drawLine(
      rgb,
      width,
      height,
      pa.px,
      pa.py,
      pb.px,
      pb.py,
      [clampByte(160 + stiff * 50), clampByte(168 + stiff * 40), clampByte(180 + stiff * 40)],
      stiff > 0.8 ? 2 : 1,
    );
  }

  for (let i = 0; i < egt.nodes.length; i++) {
    const n = egt.nodes[i];
    const id = n.id ?? i;
    const rhoProbe =
      buffers?.entanglementDensity && id < buffers.entanglementDensity.length
        ? buffers.entanglementDensity[id] || 0
        : egt.rho[id] || 0;
    if (rhoProbe < vacuumRho && !muscleSet?.has?.(id) && !boneSet?.has?.(id) && !locked?.[id]) {
      continue;
    }
    let px;
    let py;
    let r;
    let g;
    let b;
    let rho;
    const muscle = muscleSet?.has?.(id) ? 1 : 0;
    if (buffers?.entanglementDensity && id < buffers.entanglementDensity.length) {
      const shaded = shadeHolographicFromBuffers(buffers, uniforms, id, { h_ij: h });
      rho = shaded.rho;
      const node = { x: shaded.world[0] + 0.55, y: shaded.world[1] };
      ({ px, py } = toPixel(node, bounds, width, height));
      r = shaded.rgb[0];
      g = shaded.rgb[1];
      b = shaded.rgb[2];
    } else {
      ({ px, py } = toPixel(n, bounds, width, height));
      rho = egt.rho[id] || 0;
      const N = n.normal || [0, 0, 1];
      const ndl = Math.max(0.12, hijDot(h, N, light));
      const sss = Math.min(1, rho * 0.45);
      r = clampByte(70 + ndl * 90 + sss * 80 + muscle * 40);
      g = clampByte(52 + ndl * 70 + sss * 35 + muscle * 8);
      b = clampByte(48 + ndl * 55 + (1 - sss) * 30);
    }
    const rad = 1 + Math.round(rho * 2 + (muscle ? 1 : 0));
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy <= rad * rad) {
          blendPx(rgb, width, height, px + dx, py + dy, r, g, b, 0.9);
        }
      }
    }
  }

  for (const j of joints) {
    const a = egt.nodes[j.i];
    const b = egt.nodes[j.j];
    if (!a || !b) continue;
    const pa = toPixel(a, bounds, width, height);
    const pb = toPixel(b, bounds, width, height);
    const mx = Math.round((pa.px + pb.px) / 2);
    const my = Math.round((pa.py + pb.py) / 2);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy <= 5) {
          blendPx(rgb, width, height, mx + dx, my + dy, 230, 170, 70, 0.85);
        }
      }
    }
  }

  const links = egt.C || egt.causalLinks || [];
  for (const link of links) {
    if ((link.strength ?? 0) < 0.35) continue;
    const a = egt.nodes[link.from];
    const b = egt.nodes[link.to];
    if (!a || !b) continue;
    const pa = toPixel(a, bounds, width, height);
    const pb = toPixel(b, bounds, width, height);
    drawLine(rgb, width, height, pa.px, pa.py, pb.px, pb.py, [40, 170, 190], 1);
  }

  return {
    mode: EFR_MODES.COMPOSITE,
    width,
    height,
    rgb,
    status: COMPOSITE_STATUS,
    realisticMesh: REALISTIC_MESH_STATUS,
    note: "COMPOSITE = bulk wire + holographic buffers when present + d̂-flip joints. Not GPU Three.js / Unreal PBR.",
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
