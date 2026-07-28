/**
 * GPU Print Safeguard — constitutional pre-dispatch gate.
 *
 * STATUS: **partial** — throws on forbidden GPU×print / GPU×determinism combos.
 * Namespace: sx.router.contract.gpu.printSafeguard
 *
 * Wire BEFORE capability dispatch. Does not authorize GPU print SoT.
 */

export const GPU_PRINT_SAFEGUARD_CODE = "GPU_PRINT_SAFEGUARD";

/**
 * @param {string} capabilityId
 * @param {object} [request]
 * @throws {Error} when GPU is combined with print / determinism intents
 */
export function assertGpuPrintSafeguard(capabilityId, request = {}) {
  const id = String(capabilityId || "");
  const isGpu = id.startsWith("gpu.");
  if (!isGpu) return;

  if (request.determinismRequired === true) {
    const err = new Error(
      `${GPU_PRINT_SAFEGUARD_CODE}: determinismRequired forbids GPU capability '${id}' — use cpu.rt4d.print`,
    );
    err.code = GPU_PRINT_SAFEGUARD_CODE;
    throw err;
  }

  const printMode =
    request.mode === "print" ||
    request.intentLane === "print" ||
    request.capabilityClass === "print" ||
    request.asPrintSoT === true;

  if (printMode) {
    const err = new Error(
      `${GPU_PRINT_SAFEGUARD_CODE}: print mode forbids GPU capability '${id}' — use cpu.rt4d.print`,
    );
    err.code = GPU_PRINT_SAFEGUARD_CODE;
    throw err;
  }
}

/**
 * Soft check — returns null if ok, else structured denial (no throw).
 * @param {string} capabilityId
 * @param {object} [request]
 */
export function checkGpuPrintSafeguard(capabilityId, request = {}) {
  try {
    assertGpuPrintSafeguard(capabilityId, request);
    return null;
  } catch (err) {
    return {
      ok: false,
      assistOnly: true,
      nonAuthoritative: true,
      code: err?.code || GPU_PRINT_SAFEGUARD_CODE,
      message: err instanceof Error ? err.message : String(err),
      capabilityId,
    };
  }
}

export default { assertGpuPrintSafeguard, checkGpuPrintSafeguard };
