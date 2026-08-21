/**
 * Gradient-flow solver organ API.
 * Named wrapper around proto CPU −∇φ (finite-difference ∇φ).
 * Status: **working** at proto scale (32³). Not a GPU world solver.
 */

import { computeGradientInto, CPU_REFERENCE_STATUS } from "../../proto/cpu-reference.mjs";
import { PROTO_SHAPE } from "../../proto/constitution.mjs";

export const GRADIENT_FLOW_STATUS = "working";
export const GRADIENT_FLOW_KERNEL = "cpu-reference.finite-difference-grad-phi";

/**
 * Evaluate ∇φ into `out` (length 3 * cellCount). Does not mutate φ.
 */
export function evaluate(phi, out, shape = PROTO_SHAPE) {
  if (!out || out.length < phi.length * 3) {
    throw new Error("GradientFlowSolver.evaluate requires vector buffer of length 3N");
  }
  computeGradientInto(phi, out, shape);
  return out;
}

export function describeGradientFlow() {
  return {
    organ: "SimulationChamber",
    api: "GradientFlowSolver.evaluate",
    status: GRADIENT_FLOW_STATUS,
    kernel: GRADIENT_FLOW_KERNEL,
    cpuReference: CPU_REFERENCE_STATUS,
    formula: "finite-difference ∇φ (Neumann); defect transport uses −∇φ",
  };
}
