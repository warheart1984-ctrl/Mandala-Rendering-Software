import { MetricTensor } from "./MetricTensor.js";
import { ChristoffelSymbols } from "./Christoffel.js";
import { CurvatureTensors } from "./Curvature.js";

export {
  MetricTensor,
  METRIC_SIGNATURES,
  createMinkowskiMetric,
  createEuclideanMetric,
} from "./MetricTensor.js";

export {
  ChristoffelSymbols,
  computeChristoffel,
} from "./Christoffel.js";

export {
  CurvatureTensors,
  StressEnergyTensor,
  computeCurvature,
} from "./Curvature.js";

export function createArena(metricSignature = [-1, 1, 1, 1]) {
  const metric = new MetricTensor(metricSignature);
  const christoffel = new ChristoffelSymbols(metric);
  const curvature = new CurvatureTensors(metric);
  return { metric, christoffel, curvature };
}