/**
 * Mandala Engine v0.1 — scene graph skeleton + organ tags.
 * Identity: constitutional 4D simulation and rendering platform.
 */

export { ORGAN_MAP } from "../proto/organs.mjs";
export {
  ORGAN_TAGS,
  ORGAN_TAG_SET,
  NODE_KINDS,
  DEFAULT_KIND_FOR_ORGAN,
} from "./organs.mjs";
export {
  ENGINE_GRAPH_VERSION,
  ENGINE_GRAPH_STATUS,
  createEmptyGraph,
  addNode,
  addEdge,
  attachCertifiedDomain,
  addProjectionNode,
  wrapProtoCertifiedState,
  graphHash,
  certifiedHashOf,
  recordTopologicalEvent,
} from "./scenegraph.mjs";
export { TOPOLOGICAL_EVENT_STATUS, EVENT_KINDS } from "./topological-events.mjs";
export { ORGAN_ABI_V1 } from "./aais/index.mjs";
export {
  createUniverse,
  stepPhysics,
  propose,
  project,
  observe,
  paint,
  speak,
} from "./sdk/index.mjs";
export { PHYSICS_CORE_STATUS, PHYSICS_ABI_ID } from "./physics/index.mjs";
export { HAMILTONIAN_OPERATOR, HAMILTONIAN_STATUS } from "./hamiltonian/index.mjs";
