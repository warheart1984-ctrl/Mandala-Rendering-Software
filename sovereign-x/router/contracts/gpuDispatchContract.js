/**
 * GPU Dispatch Contract — Sovereign X Router
 * Namespace: sx.router.contract.gpu.dispatch
 * STATUS: **partial** — validate() enforced in unit tests.
 *
 * User drop-in (adapted to ESM for monorepo package).
 */

/**
 * @param {object} request
 * @returns {object} validated request
 */
export function validate(request) {
  if (!request || typeof request !== "object") {
    throw new Error("GpuDispatchContract request must be an object");
  }

  const { determinismRequired, capabilityClass, backend } = request;

  if (determinismRequired) {
    if (capabilityClass !== "print" || backend !== "cpu.rt4d.print") {
      throw new Error(
        "Deterministic intents must route to cpu.rt4d.print with capabilityClass=print",
      );
    }
  } else if (backend && String(backend).startsWith("gpu.")) {
    if (!["gen", "inference", "compute"].includes(capabilityClass)) {
      throw new Error(
        "GPU backends must use capabilityClass ∈ {gen,inference,compute}",
      );
    }
    request.authority = "assist";
  }

  return request;
}

export default { validate };
