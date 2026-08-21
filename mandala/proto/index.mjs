/**
 * Mandala proto — tiny governed 4D synthetic-world runtime.
 */
export { DEFAULT_CONSTITUTION, PROTO_SHAPE, INVARIANT_ID } from "./constitution.mjs";
export { createInitialCertifiedState, freezeCertifiedSnapshot, sliceHashFromCache } from "./certified-state.mjs";
export { computeGradientInto, CPU_REFERENCE_STATUS } from "./cpu-reference.mjs";
export { evaluateProposal } from "./aais-gate.mjs";
export { createChamber, evolveTo, proposeIllegalMassInjection } from "./simulation-chamber.mjs";
export { projectCertified, projectFrozen } from "./mandala-project.mjs";
export { observerAt, setObserverPath } from "./movie-lane.mjs";
export { ORGAN_MAP } from "./organs.mjs";
export { runTinyUniverse } from "./world.mjs";
