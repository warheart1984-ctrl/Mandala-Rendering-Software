import { METRIC_IDS } from "./Metric4D.js";

/**
 * CurvedMetricField — skeleton only (Phase-1).
 * Status: **declared** / skeleton — no Christoffel / geodesic integration.
 */
export class CurvedMetricField {
  constructor() {
    this.id = METRIC_IDS.CURVED_FIELD;
    this.version = "0.0.1";
    this.signature = "declared";
    this.status = "skeleton";
    this.note =
      "Curved metrics (GR-style g_μν(x)) are declared. Phase-1 ships flat Euclidean/Minkowski only.";
  }

  innerProduct() {
    throw new Error("CurvedMetricField.innerProduct is skeleton/declared — not implemented");
  }

  interval() {
    throw new Error("CurvedMetricField.interval is skeleton/declared — not implemented");
  }

  classifyInterval() {
    throw new Error("CurvedMetricField.classifyInterval is skeleton/declared — not implemented");
  }
}
