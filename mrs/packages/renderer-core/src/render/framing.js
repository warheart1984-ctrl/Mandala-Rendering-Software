function finiteVisible(p) {
  return p?.visible !== false && Number.isFinite(p?.X) && Number.isFinite(p?.Y);
}

export function projectedBounds(points, trim = 0.01) {
  const xs = points.filter(finiteVisible).map((p) => p.X).sort((a, b) => a - b);
  const ys = points.filter(finiteVisible).map((p) => p.Y).sort((a, b) => a - b);
  if (!xs.length) return null;
  const lo = Math.min(Math.floor(xs.length * trim), xs.length - 1);
  const hi = Math.max(lo, Math.ceil(xs.length * (1 - trim)) - 1);
  return { minX: xs[lo], maxX: xs[hi], minY: ys[lo], maxY: ys[hi] };
}

export function fitTransform(points, width, height, options = {}) {
  const bounds = projectedBounds(points, options.trim ?? 0.01);
  if (!bounds) return { scale: 1, offsetX: 0, offsetY: 0, bounds: null };
  const padding = Math.max(0, Math.min(0.45, options.padding ?? 0.12));
  const bw = Math.max(1e-6, bounds.maxX - bounds.minX);
  const bh = Math.max(1e-6, bounds.maxY - bounds.minY);
  const scale = Math.min(width * (1 - padding * 2) / bw, height * (1 - padding * 2) / bh);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { scale, offsetX: width / 2 - cx * scale, offsetY: height / 2 - cy * scale, bounds };
}

export function applyFit(points, transform) {
  for (const p of points) {
    if (!finiteVisible(p)) continue;
    p.X = p.X * transform.scale + transform.offsetX;
    p.Y = p.Y * transform.scale + transform.offsetY;
  }
  return points;
}

export class FramingController {
  constructor(options = {}) { this.smoothing = options.smoothing ?? 0.16; this.current = null; }
  update(target) {
    if (!this.current) this.current = { ...target };
    else for (const key of ["scale", "offsetX", "offsetY"]) this.current[key] += (target[key] - this.current[key]) * this.smoothing;
    return this.current;
  }
  reset() { this.current = null; }
}
