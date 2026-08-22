/**
 * Character holography CPU proof renders (ρ heatmap + warped skin preview).
 * Reuses EFR patterns from mandala/holography/efr.mjs.
 * Status: **partial**
 */

import {
  EFR_MODES,
  renderEGTHeatmap,
  renderEGTEmergentGeometry,
  renderEGTCombined,
} from "../../mandala/holography/efr.mjs";

export const CHAR_EFR_STATUS = "partial";

/**
 * Skin ρ / K heatmap via shared EFR.
 */
export function renderSkinRhoHeatmap(egt, opts = {}) {
  const width = opts.width ?? 384;
  const height = opts.height ?? 512;
  const frame = renderEGTHeatmap(egt, { width, height });
  return {
    ...frame,
    status: CHAR_EFR_STATUS,
    note: "Character skin ρ heatmap — EFR HEATMAP reused; brightness=ρ, tint=K",
  };
}

/**
 * Warped preview: emergent geometry mode (K-warped mesh net).
 */
export function renderSkinWarpedPreview(egt, opts = {}) {
  const width = opts.width ?? 384;
  const height = opts.height ?? 512;
  const frame = renderEGTEmergentGeometry(egt, { width, height });
  return {
    ...frame,
    status: CHAR_EFR_STATUS,
    note: "Warped skin preview — EFR EMERGENT_GEOMETRY; K offsets layout verts",
  };
}

/**
 * Combined dual view.
 */
export function renderSkinCombined(egt, opts = {}) {
  const width = opts.width ?? 512;
  const height = opts.height ?? 384;
  const frame = renderEGTCombined(egt, { width, height });
  return {
    ...frame,
    status: CHAR_EFR_STATUS,
    modes: EFR_MODES,
    note: "Combined EFR for character skin boundary",
  };
}

/**
 * Side-by-side baseline vs activated ρ (two heatmaps stacked).
 */
export function renderActivationCompare(baselineEgt, activatedEgt, opts = {}) {
  const width = opts.width ?? 384;
  const height = opts.height ?? 256;
  const a = renderEGTHeatmap(baselineEgt, { width, height });
  const b = renderEGTHeatmap(activatedEgt, { width, height });
  const outH = height * 2;
  const rgb = new Uint8Array(width * outH * 3);
  rgb.set(a.rgb, 0);
  rgb.set(b.rgb, a.rgb.length);
  return {
    mode: "ACTIVATION_COMPARE",
    width,
    height: outH,
    rgb,
    status: CHAR_EFR_STATUS,
    note: "Top=baseline ρ · Bottom=after muscle activation",
  };
}

/**
 * Heatmap of entanglement Frobenius ‖E‖ or |K| by temporarily mapping field → ρ.
 * Does not mutate the source egt.
 */
export function renderFieldHeatmap(egt, field, opts = {}) {
  const width = opts.width ?? 320;
  const height = opts.height ?? 480;
  const n = egt.nodes.length;
  const values =
    field === "K"
      ? Float64Array.from(egt.K || [], (k) => Math.abs(k))
      : field === "E" || field === "E_norm"
        ? Float64Array.from(egt.E_norms || egt.nodes.map((nd) => nd.E_norm || 0))
        : Float64Array.from(egt.rho);

  let maxV = 1e-12;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > maxV) maxV = values[i];
  }
  const proxy = {
    ...egt,
    rho: Float64Array.from({ length: n }, (_, i) =>
      Math.min(1, values[i] / maxV),
    ),
    K: egt.K || new Float64Array(n),
  };
  const frame = renderEGTHeatmap(proxy, { width, height });
  return {
    ...frame,
    status: CHAR_EFR_STATUS,
    field,
    note: `Character field heatmap — ${field} mapped to ρ channel for EFR`,
  };
}
