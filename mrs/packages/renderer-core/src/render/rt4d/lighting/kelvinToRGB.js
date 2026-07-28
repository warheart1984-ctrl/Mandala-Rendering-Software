/**
 * kelvinToRGB — physically-based color temperature to RGB conversion.
 *
 * Maps a Kelvin temperature (1000–40000 K) to an [r, g, b] triple in [0, 1]
 * using the CIE 1931 blackbody locus approximation (Hernandez-Andres et al.)
 * with a simplified curve fit.
 *
 * This replaces the fixed key light emission (90, 84, 76) in render-still.mjs
 * with physically meaningful lighting.
 */

/**
 * Attempt a simplified Planckian locus approximation.
 * Returns [r, g, b] each in [0, 1].
 *
 * @param {number} kelvin - Color temperature in Kelvin (clamped to 1000–40000).
 * @returns {[number, number, number]} RGB triple.
 */
export function kelvinToRGB(kelvin) {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;

  let r, g, b;

  // Red channel
  if (t <= 66) {
    r = 1;
  } else {
    r = 1.292936 * Math.pow(t - 60, -0.1332047592);
    r = Math.max(0, Math.min(1, r));
  }

  // Green channel
  if (t <= 66) {
    g = 0.3900815 * Math.log(t) - 0.6318414;
  } else {
    g = 1.129891 * Math.pow(t - 60, -0.0755148492);
  }
  g = Math.max(0, Math.min(1, g));

  // Blue channel
  if (t >= 66) {
    b = 1;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = 0.5432067 * Math.log(t - 10) - 1.814168;
    b = Math.max(0, Math.min(1, b));
  }

  return [r, g, b];
}

/**
 * Preset color temperatures for common lighting scenarios.
 */
export const COLOR_TEMPERATURE = Object.freeze({
  candle:        1900,
  warmWhite:     2700,
  tungsten:      3200,
  warmFluorescent: 3500,
  halogen:       4000,
  coolWhite:     5000,
  daylight:      5500,
  overcast:      6500,
  shade:         7500,
  blueSky:       10000,
});

/**
 * Parse a temperature keyword or numeric string into a Kelvin value.
 *
 * @param {string|number} input - Keyword or numeric kelvin value.
 * @returns {number|null} Kelvin value, or null if unrecognised.
 */
export function parseTemperature(input) {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input !== "string") return null;

  const s = input.trim().toLowerCase();
  if (s in COLOR_TEMPERATURE) return COLOR_TEMPERATURE[s];

  const n = Number(s);
  if (Number.isFinite(n) && n >= 1000 && n <= 40000) return n;

  return null;
}
