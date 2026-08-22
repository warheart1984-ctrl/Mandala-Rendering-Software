/**
 * Governance gate (Step 5 light, locked at contract time).
 * Missing opticalLength or pixelId → reject before accumulation.
 * No orchestration without evidence.
 */

export const PATH_GATE_STATUS = "enforced";

export class PathSampleUnreadyError extends Error {
  constructor(reason, sample) {
    super(`HoloRT4D reject before accumulation: ${reason}`);
    this.name = "PathSampleUnreadyError";
    this.reason = reason;
    this.sample = sample;
  }
}

export function hasFinalizeEvidence(sample) {
  if (!sample || typeof sample !== "object") return false;
  const pixelId = sample.pixelId;
  const opticalLength = sample.opticalLength;
  const pixelOk = Number.isFinite(Number(pixelId)) && Number(pixelId) >= 0;
  const oplOk = Number.isFinite(Number(opticalLength));
  return pixelOk && oplOk;
}

/**
 * Reject before BinPaths / TiledAccumulate / atomic accumulate.
 * @throws {PathSampleUnreadyError}
 */
export function rejectUnreadyPath(sample) {
  if (sample == null || typeof sample !== "object") {
    throw new PathSampleUnreadyError("path sample missing", sample);
  }
  if (sample.pixelId == null || !Number.isFinite(Number(sample.pixelId))) {
    throw new PathSampleUnreadyError("pixelId missing", sample);
  }
  if (Number(sample.pixelId) < 0) {
    throw new PathSampleUnreadyError("pixelId missing", sample);
  }
  if (sample.opticalLength == null || !Number.isFinite(Number(sample.opticalLength))) {
    throw new PathSampleUnreadyError("opticalLength missing", sample);
  }
  return sample;
}

export function rejectUnreadyPaths(samples) {
  if (!Array.isArray(samples)) {
    throw new PathSampleUnreadyError("path samples missing", samples);
  }
  for (const s of samples) rejectUnreadyPath(s);
  return samples;
}
