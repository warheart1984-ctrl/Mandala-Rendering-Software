import { createHash } from "node:crypto";
import { isTemporalOpType } from "./TemporalOp.js";

/**
 * Temporal evidence envelope — proves which history, frame, transform, and
 * simulation law participated in a temporal operation.
 *
 * Status: partial / substrate_verified for fork + Phase-2A toy evolution path.
 * Evolution laws remain classification toy_model (not physical dynamics).
 */

const REQUIRED = [
  "operationId",
  "operationType",
  "sourceTimelineId",
  "resultTimelineId",
  "metric",
  "parentStateHash",
  "resultStateHash",
  "replayToken",
  "evidenceStatus",
];

/**
 * Deterministic replay token from envelope material (no wall-clock).
 * @param {object} material
 */
export function computeReplayToken(material) {
  const json = JSON.stringify(material, Object.keys(material).sort());
  return createHash("sha256").update(json).digest("hex");
}

/**
 * @param {object} partial
 */
export function createTemporalEvidenceEnvelope(partial) {
  const evolutionLaw = partial.evolutionLaw ?? null;
  const simulationLawHash =
    partial.simulationLawHash ??
    (evolutionLaw && evolutionLaw.lawHash) ??
    "declared:no-evolution-law";

  const base = {
    operationId: partial.operationId,
    operationType: partial.operationType,
    sourceTimelineId: partial.sourceTimelineId,
    sourceEventId: partial.sourceEventId ?? null,
    resultTimelineId: partial.resultTimelineId,
    parentTimelineIds: partial.parentTimelineIds ?? null,
    observerFrame: partial.observerFrame ?? null,
    metric: partial.metric,
    transform: partial.transform ?? null,
    causalValidation: partial.causalValidation ?? { passed: true, violations: [] },
    parentStateHash: partial.parentStateHash,
    resultStateHash: partial.resultStateHash,
    simulationLawHash,
    evidenceStatus: partial.evidenceStatus ?? "draft",
    evolutionLaw,
    initialStateHash: partial.initialStateHash ?? null,
    finalStateHash: partial.finalStateHash ?? null,
    trajectoryRoot: partial.trajectoryRoot ?? null,
    stepCount: partial.stepCount ?? null,
    replayStatus: partial.replayStatus ?? null,
  };

  const replayToken =
    partial.replayToken ??
    computeReplayToken({
      operationId: base.operationId,
      operationType: base.operationType,
      sourceTimelineId: base.sourceTimelineId,
      resultTimelineId: base.resultTimelineId,
      parentStateHash: base.parentStateHash,
      resultStateHash: base.resultStateHash,
      simulationLawHash: base.simulationLawHash,
      metric: base.metric,
      trajectoryRoot: base.trajectoryRoot,
      initialStateHash: base.initialStateHash,
      finalStateHash: base.finalStateHash,
    });

  return { ...base, replayToken };
}

/**
 * @param {object} envelope
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateTemporalEvidenceEnvelope(envelope) {
  const errors = [];
  if (!envelope || typeof envelope !== "object") {
    return { ok: false, errors: ["envelope must be an object"] };
  }
  for (const key of REQUIRED) {
    if (envelope[key] === undefined || envelope[key] === null || envelope[key] === "") {
      errors.push(`missing required field: ${key}`);
    }
  }
  if (envelope.operationType && !isTemporalOpType(envelope.operationType)) {
    errors.push(`invalid operationType: ${envelope.operationType}`);
  }
  if (
    envelope.evidenceStatus &&
    !["draft", "substrate_verified", "declared"].includes(envelope.evidenceStatus)
  ) {
    errors.push(`invalid evidenceStatus: ${envelope.evidenceStatus}`);
  }
  if (envelope.metric && typeof envelope.metric !== "object") {
    errors.push("metric must be an object");
  }
  if (envelope.evolutionLaw != null) {
    if (typeof envelope.evolutionLaw !== "object") {
      errors.push("evolutionLaw must be an object");
    } else {
      const el = envelope.evolutionLaw;
      if (!el.lawId) errors.push("evolutionLaw.lawId required when evolutionLaw present");
      if (!el.lawHash) errors.push("evolutionLaw.lawHash required when evolutionLaw present");
      if (el.classification && el.classification !== "toy_model") {
        errors.push("evolutionLaw.classification must be toy_model in Phase-2A");
      }
    }
    if (!envelope.initialStateHash) errors.push("initialStateHash required when evolutionLaw present");
    if (!envelope.finalStateHash) errors.push("finalStateHash required when evolutionLaw present");
    if (!envelope.trajectoryRoot) errors.push("trajectoryRoot required when evolutionLaw present");
    if (envelope.stepCount == null) errors.push("stepCount required when evolutionLaw present");
    if (
      envelope.replayStatus != null &&
      !["verified", "failed", "declared"].includes(envelope.replayStatus)
    ) {
      errors.push(`invalid replayStatus: ${envelope.replayStatus}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
