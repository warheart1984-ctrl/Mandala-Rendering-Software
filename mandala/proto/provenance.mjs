/**
 * Frame / receipt provenance for the proto.
 * Records: state hash, constitution id, seed, observer, rule.
 */

export function frameReceipt({
  state,
  constitution,
  decision = null,
  observer = null,
  rule = "certified-evolve",
  extra = {},
}) {
  return {
    type: "mandala-proto-receipt",
    status: "partial",
    stateHash: state.hash,
    constitutionId: constitution.id,
    invariantId: constitution.invariant.id,
    seed: state.seed,
    t: state.t,
    observer: observer ? { ...observer } : { ...state.observer },
    defect: { ...state.defect },
    rule,
    gate: decision
      ? {
          accepted: decision.accepted,
          reasons: decision.reasons,
          prevMass: decision.prevMass,
          nextMass: decision.nextMass,
        }
      : null,
    ...extra,
  };
}
