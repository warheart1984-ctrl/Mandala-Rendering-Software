/**
 * Depth / opticalLength reconstruction lock for pixelId mapping validation.
 *
 * "Tunnel behind the subject" = background pixels carry coherent far opticalLength
 * when pixelId correctly maps PathSamples to holo pixels. Wrong maps (e.g.
 * pixelId % 16 for lx) scramble depth — no subject silhouette with far tunnel.
 *
 * Status: CPU enforced. GPU declared (same tiled + PhaseEncode path).
 */

import { holoXYFromPixelId, pixelXYFromPixelId } from "./aligned.js";
import { encodePhaseOnly, phaseNorm } from "./accumulate.js";
import { createComplexField, wavenumber } from "./types.js";
import { binPathsU32, tiledAccumulate } from "./tiled.js";

export const DEPTH_RECONSTRUCT_STATUS = Object.freeze({
  cpu: "enforced",
  gpu: "declared",
  note:
    "Validates pixelId→holo scatter and opticalLength→PhaseEncode. Tunnel = far depth ring/sky behind near subject.",
});

/** Scatter per-path opticalLength into holo grid via BinPaths pixelId map. */
export function scatterOpticalLength(paths, opts) {
  const { frameWidth, frameHeight, holoResX, holoResY } = opts;
  const n = holoResX * holoResY;
  const depth = new Float32Array(n);
  const counts = new Uint32Array(n);
  for (const p of paths) {
    const { holoX, holoY } = holoXYFromPixelId(
      p.pixelId,
      frameWidth,
      frameHeight,
      holoResX,
      holoResY,
    );
    const idx = holoY * holoResX + holoX;
    if (idx < 0 || idx >= n) continue;
    depth[idx] += Number(p.opticalLength ?? 0);
    counts[idx] += 1;
  }
  for (let i = 0; i < n; i++) {
    if (counts[i] > 0) depth[i] /= counts[i];
  }
  return { depth, counts };
}

/**
 * WRONG control: BinPaths bug — uses pixelId % TILE_SIZE for holoX seed.
 * Scrambles depth when frameWidth >> 16 (e.g. 512×512 human frame).
 */
export function scatterOpticalLengthTileModWrong(paths, holoResX, holoResY, tileSize = 16) {
  const n = holoResX * holoResY;
  const depth = new Float32Array(n);
  for (const p of paths) {
    const lx = p.pixelId % tileSize;
    const ly = Math.trunc(p.pixelId / tileSize) % tileSize;
    const tileX = Math.trunc((p.pixelId % holoResX) / tileSize);
    const tileY = Math.trunc(p.pixelId / holoResX);
    const holoX = tileX * tileSize + lx;
    const holoY = tileY * tileSize + ly;
    const idx = holoY * holoResX + holoX;
    if (idx >= 0 && idx < n) depth[idx] = Number(p.opticalLength ?? 0);
  }
  return depth;
}

/** E = exp(i k L) — phase-only depth field (constant unit amplitude). */
export function depthToComplexField(depth, lambda) {
  const k = wavenumber(lambda);
  const field = new Array(depth.length);
  for (let i = 0; i < depth.length; i++) {
    const phase = k * depth[i];
    field[i] = { real: Math.cos(phase), imag: Math.sin(phase) };
  }
  return field;
}

/** Paths → tiledAccumulate → encodePhaseOnly (production pipeline). */
export function reconstructPhaseFromPaths(paths, camera, opts) {
  const field = createComplexField(camera.resX, camera.resY);
  const bins = opts.bins ?? binPathsU32(paths, opts);
  tiledAccumulate(field, paths, camera, { ...opts, bins });
  const phases = encodePhaseOnly(field, { mode: "tiled" });
  return { field, phases, bins };
}

/** Roundtrip: pixelId = py*frameWidth+px and same-res holoIdx === pixelId. */
export function validatePixelIdRoundtrip(paths, opts) {
  const { frameWidth, frameHeight, holoResX, holoResY } = opts;
  const errors = [];
  let checked = 0;
  for (const p of paths) {
    if (!Number.isInteger(p.pixelId)) {
      errors.push({ pixelId: p.pixelId, reason: "missing pixelId" });
      continue;
    }
    const { px, py } = pixelXYFromPixelId(p.pixelId, frameWidth);
    const expectedId = py * frameWidth + px;
    if (p.pixelId !== expectedId) {
      errors.push({ pixelId: p.pixelId, expectedId, reason: "pixelId != py*width+px" });
    }
    if (holoResX === frameWidth && holoResY === frameHeight) {
      const { holoX, holoY } = holoXYFromPixelId(
        p.pixelId,
        frameWidth,
        frameHeight,
        holoResX,
        holoResY,
      );
      const holoIdx = holoY * holoResX + holoX;
      if (holoIdx !== p.pixelId) {
        errors.push({ pixelId: p.pixelId, holoIdx, reason: "same-res holoIdx mismatch" });
      }
    }
    checked += 1;
  }
  return { ok: errors.length === 0, checked, errors: errors.slice(0, 8) };
}

/** Each path's opticalLength lands at holo pixel from pixelId map. */
export function verifyDepthScatterRoundtrip(paths, opts) {
  const { depth, counts } = scatterOpticalLength(paths, opts);
  let matched = 0;
  for (const p of paths) {
    const { holoX, holoY } = holoXYFromPixelId(
      p.pixelId,
      opts.frameWidth,
      opts.frameHeight,
      opts.holoResX,
      opts.holoResY,
    );
    const idx = holoY * opts.holoResX + holoX;
    if (counts[idx] > 0 && Math.abs(depth[idx] - Number(p.opticalLength ?? 0)) < 1e-5) {
      matched += 1;
    }
  }
  return { ok: matched === paths.length, matched, total: paths.length };
}

/** Pearson r on overlapping non-zero depth samples. */
export function depthCorrelation(a, b) {
  let n = 0;
  let sumA = 0;
  let sumB = 0;
  let sumAB = 0;
  let sumA2 = 0;
  let sumB2 = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    if (va === 0 && vb === 0) continue;
    n += 1;
    sumA += va;
    sumB += vb;
    sumAB += va * vb;
    sumA2 += va * va;
    sumB2 += vb * vb;
  }
  if (n < 2) return { r: 0, n };
  const num = n * sumAB - sumA * sumB;
  const varA = n * sumA2 - sumA * sumA;
  const varB = n * sumB2 - sumB * sumB;
  const den = Math.sqrt(Math.max(0, varA) * Math.max(0, varB));
  if (Math.abs(num - den) < 1e-12) return { r: 1, n };
  return { r: den > 0 ? num / den : 0, n };
}

/**
 * Tunnel metric: in columns containing a near subject hit, background rows
 * should have opticalLength >= backgroundMin (far tunnel/sky).
 */
export function analyzeTunnelBehindSubject(depth, opts) {
  const holoResX = opts.holoResX;
  const holoResY = opts.holoResY;
  const subjectThreshold = opts.subjectThreshold ?? 2.0;
  const backgroundMin = opts.backgroundMin ?? 1.4;

  const subjectCols = new Set();
  let subjectPixels = 0;
  let backgroundPixels = 0;
  let tunnelPixels = 0;

  for (let y = 0; y < holoResY; y++) {
    for (let x = 0; x < holoResX; x++) {
      const d = depth[y * holoResX + x];
      if (d > 0 && d < subjectThreshold) {
        subjectCols.add(x);
        subjectPixels += 1;
      }
    }
  }

  for (let y = 0; y < holoResY; y++) {
    for (let x = 0; x < holoResX; x++) {
      if (!subjectCols.has(x)) continue;
      const idx = y * holoResX + x;
      const d = depth[idx];
      if (d >= backgroundMin) {
        backgroundPixels += 1;
        tunnelPixels += 1;
      } else if (d > 0 && d < subjectThreshold) {
        subjectPixels += 0;
      }
    }
  }

  const tunnelRatio = subjectCols.size > 0 ? tunnelPixels / Math.max(1, backgroundPixels) : 0;
  return {
    subjectPixels,
    subjectColumns: subjectCols.size,
    backgroundPixels,
    tunnelPixels,
    tunnelRatio,
    hasTunnel: tunnelPixels > 0 && subjectCols.size > 0,
  };
}

/** Phase from depth-only field should match phaseNorm(cos(kL), sin(kL)) per pixel. */
export function phaseDepthAgreement(phases, depth, lambda = 550e-9) {
  const k = wavenumber(lambda);
  let matched = 0;
  let n = 0;
  let sumErr = 0;
  for (let i = 0; i < depth.length; i++) {
    const d = depth[i];
    if (d <= 0) continue;
    const expected = phaseNorm(Math.cos(k * d), Math.sin(k * d));
    const err = Math.abs((phases[i] ?? 0) - expected);
    sumErr += err;
    if (err < 1e-5) matched += 1;
    n += 1;
  }
  return {
    matched,
    n,
    ratio: n > 0 ? matched / n : 0,
    meanErr: n > 0 ? sumErr / n : 0,
  };
}

/** Normalize depth to grayscale RGBA for PNG. */
export function depthToRgba(depth, holoResX, holoResY) {
  let minD = Infinity;
  let maxD = -Infinity;
  for (let i = 0; i < depth.length; i++) {
    const d = depth[i];
    if (d <= 0) continue;
    minD = Math.min(minD, d);
    maxD = Math.max(maxD, d);
  }
  if (!Number.isFinite(minD)) {
    minD = 0;
    maxD = 1;
  }
  const span = Math.max(maxD - minD, 1e-9);
  const rgba = new Uint8Array(holoResX * holoResY * 4);
  for (let i = 0; i < depth.length; i++) {
    const d = depth[i];
    const t = d > 0 ? (d - minD) / span : 0;
    const v = Math.round(Math.min(255, Math.max(0, t * 255)));
    const o = i * 4;
    rgba[o] = v;
    rgba[o + 1] = v;
    rgba[o + 2] = Math.round((1 - t) * 120);
    rgba[o + 3] = 255;
  }
  return rgba;
}

/** Phase encode map to RGBA (reuse phase wheel hues). */
export function phaseToRgba(phases, holoResX, holoResY) {
  const rgba = new Uint8Array(holoResX * holoResY * 4);
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i] ?? 0.5;
    const v = Math.round(p * 255);
    const o = i * 4;
    rgba[o] = v;
    rgba[o + 1] = Math.round((1 - p) * 255);
    rgba[o + 2] = 128;
    rgba[o + 3] = 255;
  }
  return rgba;
}

/** Compare correct vs tile-mod-wrong scatter; validate phase encodes opticalLength. */
export function scorePixelIdMapping(paths, camera, opts) {
  const roundtrip = validatePixelIdRoundtrip(paths, opts);
  const { depth: tracedDepth } = scatterOpticalLength(paths, opts);
  const wrongDepth = scatterOpticalLengthTileModWrong(paths, camera.resX, camera.resY);

  const uniformPaths = paths.map((p) => ({
    ...p,
    radiance: 1,
    weight: 1,
    wl: camera.lambda,
  }));
  const { field, phases } = reconstructPhaseFromPaths(uniformPaths, camera, opts);

  const depthOnlyField = depthToComplexField(tracedDepth, camera.lambda);
  const depthOnlyPhases = encodePhaseOnly(depthOnlyField, { mode: "tiled" });

  const corrCorrect = depthCorrelation(tracedDepth, tracedDepth);
  const corrWrong = depthCorrelation(tracedDepth, wrongDepth);
  const scatterRt = verifyDepthScatterRoundtrip(paths, opts);
  const phaseAgreement = phaseDepthAgreement(phases, tracedDepth, camera.lambda);
  const depthPhaseAgreement = phaseDepthAgreement(depthOnlyPhases, tracedDepth, camera.lambda);
  const tunnel = analyzeTunnelBehindSubject(tracedDepth, {
    holoResX: camera.resX,
    holoResY: camera.resY,
    subjectThreshold: opts.subjectThreshold,
    backgroundMin: opts.backgroundMin,
  });

  const wrongBeatsCorrect = corrWrong.r >= corrCorrect.r - 0.01;
  const pass =
    roundtrip.ok &&
    scatterRt.ok &&
    !wrongBeatsCorrect &&
    corrWrong.r < 0.85 &&
    depthPhaseAgreement.ratio > 0.99 &&
    tunnel.hasTunnel;

  return {
    pass,
    roundtrip,
    scatterRt,
    corrCorrect,
    corrWrong,
    wrongBeatsCorrect,
    phaseAgreement,
    depthPhaseAgreement,
    tunnel,
    tracedDepth,
    wrongDepth,
    phases,
    depthOnlyPhases,
    field,
  };
}
