import { METRIC_IDS, INTERVAL_TOL, signClass } from "./Metric4D.js";

/**
 * Diagonal metric g = diag(g0,g1,g2,g3) on (w,x,y,z) ordering matching vec4 (x,y,z,w).
 * Signature string is informational; classification uses sign of interval when
 * indefinite, else "euclidean".
 *
 * Status: **partial** — useful for experiments; not a full pseudo-Riemannian atlas.
 */
export class CustomDiagonalMetric {
  /**
   * @param {[number, number, number, number]} diag components for (x,y,z,w)
   * @param {{id?: string, signature?: string, tol?: number}} [opts]
   */
  constructor(diag, opts = {}) {
    if (!Array.isArray(diag) || diag.length !== 4) {
      throw new Error("CustomDiagonalMetric requires diag length 4 [gx,gy,gz,gw]");
    }
    this.diag = Object.freeze([...diag]);
    this.id = opts.id ?? METRIC_IDS.CUSTOM_DIAGONAL;
    this.version = "1.0.0";
    this.signature = opts.signature ?? "custom";
    this.tol = opts.tol ?? INTERVAL_TOL;
    this.status = "partial";
  }

  /**
   * @param {{x:number,y:number,z:number,w:number}} a
   * @param {{x:number,y:number,z:number,w:number}} b
   */
  innerProduct(a, b) {
    const [gx, gy, gz, gw] = this.diag;
    return gx * a.x * b.x + gy * a.y * b.y + gz * a.z * b.z + gw * a.w * b.w;
  }

  /**
   * ds² = Σ gᵢᵢ(Δxᵢ)² — can be negative, zero, or positive.
   * @param {{x:number,y:number,z:number,w:number}} a
   * @param {{x:number,y:number,z:number,w:number}} b
   */
  intervalSquared(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const dw = b.w - a.w;
    const [gx, gy, gz, gw] = this.diag;
    return gx * dx * dx + gy * dy * dy + gz * dz * dz + gw * dw * dw;
  }

  /** Alias retained for backward compatibility; returns ds² (not ds). */
  interval(a, b) {
    return this.intervalSquared(a, b);
  }

  /**
   * @param {{x:number,y:number,z:number,w:number}} a
   * @param {{x:number,y:number,z:number,w:number}} b
   */
  classifyInterval(a, b) {
    const signs = this.diag.map((g) => Math.sign(g));
    const indefinite = signs.some((s) => s < 0) && signs.some((s) => s > 0);
    if (!indefinite) return "euclidean";
    const s = signClass(this.intervalSquared(a, b), this.tol);
    if (s === "zero") return "lightlike";
    // For mostly-plus custom metrics with negative time-like gw: match Minkowski sign
    if (this.diag[3] < 0) {
      return s === "negative" ? "timelike" : "spacelike";
    }
    return s === "positive" ? "timelike" : "spacelike";
  }
}
