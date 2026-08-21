/**
 * Engine AAIS gate — schema + organ boundaries + proto mass invariant + causality.
 *
 * Only SimulationChamber may propose physics deltas.
 * Mandala / AIPainter / Mythar / MovieLane cannot mutate certified physics hash.
 *
 * Status: **working** for this freeze (organ ABI v1). Full arbitration still **partial**.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateProposal as evaluateProtoProposal, makeProposal } from "../../proto/aais-gate.mjs";
import { rehash, storeSlice } from "../../proto/certified-state.mjs";
import { ORGAN_TAGS } from "../organs.mjs";
import { evaluateConstraints } from "../physics/constraint-solver.mjs";
import { classifyCollision } from "../physics/collision-manifold.mjs";
import { validate } from "./validator.mjs";
import { evaluateCpeHgov } from "../hamiltonian/governance.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ORGAN_ABI_V1 = Object.freeze({
  abiId: "mandala-engine-organ.v1",
  version: "1.0.0",
  status: "working",
  supersedes: "mandala-engine-organ.v0",
  aaisUlV20: "not-in-repo",
  physicsProposer: "SimulationChamber",
  cannotProposePhysics: Object.freeze([
    "StoryForge",
    "Mandala",
    "AIPainter",
    "Mythar",
    "MovieLane",
    "AAIS",
  ]),
  organs: ORGAN_TAGS,
  movieLaneOwnsTime: false,
  rendererMutatesCertified: false,
});

export const AAIS_ENGINE_STATUS = "working";

let _schemas;
export function loadSchemas() {
  if (_schemas) return _schemas;
  const dir = join(__dirname, "schema");
  _schemas = {
    organAbi: JSON.parse(readFileSync(join(dir, "organ-abi.v1.json"), "utf8")),
    proposal: JSON.parse(readFileSync(join(dir, "proposal.schema.json"), "utf8")),
    receipt: JSON.parse(readFileSync(join(dir, "artifact-receipt.schema.json"), "utf8")),
  };
  return _schemas;
}

export function envelopeOf(proposal) {
  const env = {
    source: proposal.source,
    kind: proposal.kind || (proposal.source === "SimulationChamber" ? "physics" : "gate"),
    previous_state_hash: proposal.previous_state_hash,
    provenance: proposal.provenance || {},
  };
  if (typeof proposal.numerical_error_bound === "number") {
    env.numerical_error_bound = proposal.numerical_error_bound;
  }
  if (proposal.causality_bounds) env.causality_bounds = proposal.causality_bounds;
  if (proposal.proposed_delta) {
    env.proposed_delta = { t: proposal.proposed_delta.t };
    if (proposal.proposed_delta.defect) {
      env.proposed_delta.defect = {
        type: proposal.proposed_delta.defect.type,
        x: proposal.proposed_delta.defect.x,
        y: proposal.proposed_delta.defect.y,
        z: proposal.proposed_delta.defect.z,
      };
    }
  }
  return env;
}

function deny(constitution, reasons, extra = {}) {
  return {
    organ: "AAIS",
    abiId: ORGAN_ABI_V1.abiId,
    status: AAIS_ENGINE_STATUS,
    accepted: false,
    rejected: true,
    constitutionId: constitution?.id,
    reasons,
    ...extra,
  };
}

/**
 * Gate a proposal. Does not mutate certified buffers.
 */
export function evaluateEngineProposal(certified, proposal, constitution, opts = {}) {
  const { occupied = [] } = opts;
  const schemas = loadSchemas();
  const env = envelopeOf(proposal);
  const schemaErrors = validate(schemas.proposal, env);
  if (schemaErrors.length) {
    return deny(constitution, schemaErrors.map((detail) => ({ code: "schema", detail })));
  }

  const kind = env.kind;
  if (kind === "physics" && env.source !== ORGAN_ABI_V1.physicsProposer) {
    return deny(constitution, [
      {
        code: "organ-cannot-mutate-physics",
        detail: `${env.source} cannot propose physics; only ${ORGAN_ABI_V1.physicsProposer} may`,
      },
    ]);
  }

  // CPE analogue (JACA execution, not CIEMS CPE-* packets): H_gov < threshold.
  // Applied when a governance graph is attached. Existing physics tests omit it.
  const gov = opts.governance || proposal.governance || null;
  const cpe = evaluateCpeHgov(gov);
  if (cpe.applied && !cpe.ok) {
    return deny(constitution, cpe.reasons, { H_gov: cpe.H, H_gov_threshold: cpe.threshold });
  }

  if (kind !== "physics") {
    return {
      organ: "AAIS",
      abiId: ORGAN_ABI_V1.abiId,
      status: AAIS_ENGINE_STATUS,
      accepted: true,
      rejected: false,
      constitutionId: constitution.id,
      reasons: [],
      note: "non-physics proposal: no certified hash mutation",
    };
  }

  const proto = evaluateProtoProposal(certified, proposal, constitution);
  const reasons = [...(proto.reasons || [])];

  if (proposal.proposed_delta?.defect && certified.defect) {
    const constraints = evaluateConstraints(certified, proposal.proposed_delta, constitution);
    reasons.push(...constraints.reasons);
    const collision = classifyCollision(
      certified.defect,
      proposal.proposed_delta.defect,
      certified.shape,
      occupied,
    );
    if (!collision.legal) {
      reasons.push({
        code: collision.code,
        detail: `chebyshev=${collision.chebyshev}`,
      });
    }
  }

  const accepted = reasons.length === 0;
  return {
    organ: "AAIS",
    abiId: ORGAN_ABI_V1.abiId,
    status: AAIS_ENGINE_STATUS,
    accepted,
    rejected: !accepted,
    invariantId: constitution.invariant.id,
    constitutionId: constitution.id,
    reasons,
    prevMass: proto.prevMass,
    nextMass: proto.nextMass,
  };
}

export function makeEngineProposal(spec) {
  const base = makeProposal(spec);
  return {
    ...base,
    kind: spec.kind || (spec.source === "SimulationChamber" ? "physics" : spec.kind),
    abiId: ORGAN_ABI_V1.abiId,
  };
}

/**
 * Gate then commit. On reject, certified buffers are unchanged.
 */
export function commitEngineProposal(certified, proposal, constitution, opts) {
  const decision = evaluateEngineProposal(certified, proposal, constitution, opts);
  if (!decision.accepted) {
    return { committed: false, decision, hash: certified.hash };
  }
  if (envelopeOf(proposal).kind !== "physics") {
    return { committed: false, decision, hash: certified.hash, note: "non-physics accepted but does not mutate" };
  }
  const d = proposal.proposed_delta;
  if (d.t >= certified.shape.nt) {
    return {
      committed: false,
      decision: {
        ...decision,
        accepted: false,
        rejected: true,
        reasons: [...decision.reasons, { code: "temporal-cache-full", detail: `t=${d.t}` }],
      },
      hash: certified.hash,
    };
  }
  certified.scalar.set(d.scalar);
  certified.vector.set(d.vector);
  certified.defect = { ...d.defect };
  certified.t = d.t;
  certified.observer = { ...certified.observer, t: d.t };
  storeSlice(certified, d.t);
  rehash(certified);
  return { committed: true, decision, hash: certified.hash };
}

export function proposeIllegalSuperluminal(certified, constitution) {
  const scalar = new Float32Array(certified.scalar);
  const vector = new Float32Array(certified.vector);
  return makeEngineProposal({
    source: "SimulationChamber",
    kind: "physics",
    certified,
    proposed_delta: {
      t: certified.t + 1,
      scalar,
      vector,
      defect: { ...certified.defect, x: certified.defect.x + 10 },
    },
    numerical_error_bound: constitution.invariant.numericalErrorBound,
    provenance: { organ: "SimulationChamber", intent: "illegal-superluminal-test" },
  });
}

export function proposeIllegalCollision(certified, constitution) {
  const scalar = new Float32Array(certified.scalar);
  const vector = new Float32Array(certified.vector);
  return makeEngineProposal({
    source: "SimulationChamber",
    kind: "physics",
    certified,
    proposed_delta: {
      t: certified.t + 1,
      scalar,
      vector,
      defect: { ...certified.defect, x: -4, y: certified.defect.y, z: certified.defect.z },
    },
    numerical_error_bound: constitution.invariant.numericalErrorBound,
    provenance: { organ: "SimulationChamber", intent: "illegal-collision-test" },
  });
}

export function proposeIllegalOrganPhysics(certified, constitution, source = "AIPainter") {
  const scalar = new Float32Array(certified.scalar);
  const vector = new Float32Array(certified.vector);
  return makeEngineProposal({
    source,
    kind: "physics",
    certified,
    proposed_delta: {
      t: certified.t + 1,
      scalar,
      vector,
      defect: { ...certified.defect },
    },
    numerical_error_bound: constitution.invariant.numericalErrorBound,
    provenance: { organ: source, intent: "illegal-organ-physics-test" },
  });
}

export { makeProposal };
