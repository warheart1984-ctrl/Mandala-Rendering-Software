import { METRIC_IDS, INTERVAL_TOL, signClass } from "./Metric4D.js";

/**
 * Euclidean metric on R^4: g = diag(+1,+1,+1,+1).
 * classifyInterval always reports "euclidean" (no causal structure).
 */
export class EuclideanMetric4D {
  constructor() {
    this.id = METRIC_IDS.EUCLIDEAN;
    this.signature = "++++";
    this.status = "tested";
  }

  /**
   * @param {{x:number,y:number,z:number,w:number}} a
   * @param {{x:number,y:number,z:number,w:number}} b
   */
  innerProduct(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  }

  /**
   * @param {{x:number,y:number,z:number,w:number}} a
   * @param {{x:number,y:number,z:number,w:number}} b
   */
  interval(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const dw = b.w - a.w;
    return dx * dx + dy * dy + dz * dz + dw * dw;
  }

  /**
   * @param {{x:number,y:number,z:number,w:number}} a
   * @param {{x:number,y:number,z:number,w:number}} b
   */
  classifyInterval(a, b) {
    void signClass(this.interval(a, b), INTERVAL_TOL);
    return "euclidean";
  }
}

export const EUCLIDEAN_METRIC_4D = new EuclideanMetric4D();
