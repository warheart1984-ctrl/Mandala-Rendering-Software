import {
  bindInertialMotionLaw,
  createInertialMotionLawSpec,
  hashInertialState,
  stepInertial,
  validateInertialState,
} from "./InertialMotionLaw.js";
import { trajectoryRootFromStepHashes } from "./hash.js";
import { createTemporalEvidenceEnvelope } from "../temporal/TemporalEvidenceEnvelope.js";
import { TEMPORAL_OP_TYPES } from "../temporal/TemporalOp.js";

/**
 * Fixed-step evolution runner (Phase-2A).
 * Fail-closed on missing law or non-finite state.
 */

/**
 * @typedef {import("./InertialMotionLaw.js").InertialState} InertialState
 */

/**
 * @param {unknown} law
 * @returns {{ok: true, law: ReturnType<typeof bindInertialMotionLaw>} | {ok: false, error: string}}
 */
export function requireEvolutionLaw(law) {
  if (law == null) {
    return { ok: false, error: "missing evolution law (fail closed)" };
  }
  if (typeof law !== "object") {
    return { ok: false, error: "evolution law must be an object" };
  }
  const raw = /** @type {Record<string, unknown>} */ (law);
  if (raw.lawId !== "inertial-motion-v1") {
    return { ok: false, error: `unsupported lawId: ${String(raw.lawId)}` };
  }
  try {
    const spec = createInertialMotionLawSpec({
      fixedDelta: /** @type {number} */ (raw.fixedDelta),
    });
    const bound = bindInertialMotionLaw(spec);
    if (raw.lawHash != null && raw.lawHash !== bound.lawHash) {
      return {
        ok: false,
        error: "lawHash mismatch — law specification changed or was tampered",
      };
    }
    return { ok: true, law: bound };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Evolve initial state for stepCount fixed steps.
 * @param {object} args
 * @param {unknown} args.law
 * @param {InertialState} args.initialState
 * @param {number} args.stepCount
 */
export function evolveFixedSteps(args) {
  const lawReq = requireEvolutionLaw(args.law);
  if (!lawReq.ok) {
    return { ok: false, error: lawReq.error };
  }
  const initial = validateInertialState(args.initialState);
  if (!initial.ok) {
    return { ok: false, error: initial.error };
  }
  const stepCount = args.stepCount;
  if (!Number.isInteger(stepCount) || stepCount < 0) {
    return { ok: false, error: "stepCount must be a non-negative integer" };
  }

  const law = lawReq.law;
  /** @type {InertialState[]} */
  const states = [initial.state];
  /** @type {string[]} */
  const stepHashes = [hashInertialState(initial.state)];

  let current = initial.state;
  for (let i = 0; i < stepCount; i++) {
    try {
      current = stepInertial(current, law.fixedDelta);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const finite = validateInertialState(current);
    if (!finite.ok) {
      return { ok: false, error: `non-finite state at step ${i + 1}: ${finite.error}` };
    }
    states.push(current);
    stepHashes.push(hashInertialState(current));
  }

  const initialStateHash = stepHashes[0];
  const finalStateHash = stepHashes[stepHashes.length - 1];
  const trajectoryRoot = trajectoryRootFromStepHashes(stepHashes);

  return {
    ok: true,
    law,
    states,
    stepHashes,
    initialStateHash,
    finalStateHash,
    trajectoryRoot,
    stepCount,
    classification: /** @type {const} */ ("toy_model"),
  };
}

/**
 * Re-run evolution and verify hashes / trajectory within exact match
 * (toy inertial is analytically exact under IEEE ops for these fixtures).
 * @param {object} prior result of evolveFixedSteps (ok:true)
 * @param {{tol?: number}} [opts] reserved; Phase-2A uses exact hash equality
 */
export function verifyEvolutionReplay(prior, opts = {}) {
  void opts;
  if (!prior || prior.ok !== true) {
    return { ok: false, replayStatus: /** @type {const} */ ("failed"), error: "no prior trajectory" };
  }
  const again = evolveFixedSteps({
    law: prior.law,
    initialState: prior.states[0],
    stepCount: prior.stepCount,
  });
  if (!again.ok) {
    return { ok: false, replayStatus: /** @type {const} */ ("failed"), error: again.error };
  }
  if (again.trajectoryRoot !== prior.trajectoryRoot) {
    return {
      ok: false,
      replayStatus: /** @type {const} */ ("failed"),
      error: "trajectoryRoot mismatch on replay",
    };
  }
  if (again.initialStateHash !== prior.initialStateHash) {
    return {
      ok: false,
      replayStatus: /** @type {const} */ ("failed"),
      error: "initialStateHash mismatch on replay",
    };
  }
  if (again.finalStateHash !== prior.finalStateHash) {
    return {
      ok: false,
      replayStatus: /** @type {const} */ ("failed"),
      error: "finalStateHash mismatch on replay",
    };
  }
  for (let i = 0; i < prior.stepHashes.length; i++) {
    if (prior.stepHashes[i] !== again.stepHashes[i]) {
      return {
        ok: false,
        replayStatus: /** @type {const} */ ("failed"),
        error: `step hash mismatch at index ${i}`,
      };
    }
  }
  return { ok: true, replayStatus: /** @type {const} */ ("verified"), again };
}

/**
 * Bind evolution result into a temporal evidence envelope (simulate op).
 * @param {object} args
 * @param {ReturnType<typeof evolveFixedSteps>} args.evolution
 * @param {string} args.operationId
 * @param {string} args.sourceTimelineId
 * @param {string} args.resultTimelineId
 * @param {"verified"|"failed"|"declared"} [args.replayStatus]
 */
export function envelopeFromEvolution(args) {
  const evo = args.evolution;
  if (!evo || evo.ok !== true) {
    throw new Error("envelopeFromEvolution requires a successful evolution result");
  }
  const replayStatus = args.replayStatus ?? "declared";
  return createTemporalEvidenceEnvelope({
    operationId: args.operationId,
    operationType: TEMPORAL_OP_TYPES.SIMULATE,
    sourceTimelineId: args.sourceTimelineId,
    resultTimelineId: args.resultTimelineId,
    metric: { type: "euclidean", signature: "++++" },
    parentStateHash: evo.initialStateHash,
    resultStateHash: evo.finalStateHash,
    simulationLawHash: evo.law.lawHash,
    evidenceStatus: "substrate_verified",
    evolutionLaw: {
      lawId: evo.law.lawId,
      lawHash: evo.law.lawHash,
      classification: "toy_model",
      fixedDelta: evo.law.fixedDelta,
    },
    initialStateHash: evo.initialStateHash,
    finalStateHash: evo.finalStateHash,
    trajectoryRoot: evo.trajectoryRoot,
    stepCount: evo.stepCount,
    replayStatus,
  });
}
