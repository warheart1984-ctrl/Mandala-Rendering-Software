import { METRIC_IDS, INTERVAL_TOL, signClass } from "./Metric4D.js";

/**
 * Minkowski metric with signature -+++ (mostly-plus).
 * Fourth component `w` is coordinate time t. Interval:
 *   s² = -c²(Δt)² + Δx² + Δy² + Δz²
 * Prefer natural units c=1 (then t and ct coincide numerically).
 *
 *   timelike  → s² < 0
 *   lightlike → s² ≈ 0
 *   spacelike → s² > 0
 */
export class MinkowskiMetric {
  /**
   * @param {{c?: number, tol?: number}} [opts]
   */
  constructor(opts = {}) {
    this.id = METRIC_IDS.MINKOWSKI_MINUS_PLUS;
    this.signature = "-+++";
    this.c = opts.c ?? 1;
    this.tol = opts.tol ?? INTERVAL_TOL;
    this.status = "tested";
  }

  /**
   * @param {{x:number,y:number,z:number,w:number}} a
   * @param {{x:number,y:number,z:number,w:number}} b
   */
  innerProduct(a, b) {
    const c2 = this.c * this.c;
    return -c2 * a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
  }

  /**
   * @param {{x:number,y:number,z:number,w:number}} a
   * @param {{x:number,y:number,z:number,w:number}} b
   */
  interval(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const dt = b.w - a.w;
    const c2 = this.c * this.c;
    return -c2 * dt * dt + dx * dx + dy * dy + dz * dz;
  }

  /**
   * @param {{x:number,y:number,z:number,w:number}} a
   * @param {{x:number,y:number,z:number,w:number}} b
   * @returns {"timelike"|"spacelike"|"lightlike"}
   */
  classifyInterval(a, b) {
    const s = signClass(this.interval(a, b), this.tol);
    if (s === "zero") return "lightlike";
    if (s === "negative") return "timelike";
    return "spacelike";
  }
}

export const MINKOWSKI_METRIC = new MinkowskiMetric();
