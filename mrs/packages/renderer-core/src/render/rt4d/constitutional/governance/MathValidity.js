/**
 * MathValidity — error-bound semantics for certified math operations.
 *
 * Constitutional layer 15/18 (numerical integrity + verification): every
 * certified operation may carry a residual/error estimate. A check with a
 * numeric `residual`, `diff`, `error`, or `errorBound` contributes to the
 * operation's error bound; `withinTolerance(tol)` decides whether the bound
 * is provably small enough.
 */

const RESIDUAL_KEYS = ["residual", "diff", "error", "errorBound"];

export function computeErrorBound(checks = []) {
  let max = 0;
  const sources = [];
  for (const check of checks) {
    if (!check || typeof check !== "object") continue;
    for (const key of RESIDUAL_KEYS) {
      const v = check[key];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const magnitude = Math.abs(v);
      if (magnitude > max) {
        max = magnitude;
      }
      sources.push({ check: check.name || "unnamed", key, value: v });
      break;
    }
  }
  return { max, sources };
}

export function residualCheck(name, residual, tolerance, details = {}) {
  const magnitude = Math.abs(residual);
  return {
    name,
    passed: Number.isFinite(residual) && magnitude <= tolerance,
    residual,
    tolerance,
    ...details,
  };
}

export function withinTolerance(errorBound, tolerance) {
  return (
    errorBound &&
    Number.isFinite(errorBound.max) &&
    errorBound.max <= tolerance
  );
}
