export const smoothstep = (edge0, edge1, value) => {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export const smootherstep = (edge0, edge1, value) => {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t ** 3 * (t * (t * 6 - 15) + 10);
};

export const easeInOutQuad = (t) => (
  t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2
);

/** Frame-rate independent exponential approach toward target. */
export const expDecay = (current, target, decayRate, deltaSeconds) => (
  target + (current - target) * Math.exp(-decayRate * deltaSeconds)
);
