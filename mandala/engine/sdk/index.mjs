/**
 * Mandala Engine SDK (roadmap v0.9).
 * Public API: createUniverse, propose, project, observe, paint, speak.
 * Status: **partial** — embeddable Node ESM, not a polished product package.
 */

import { DEFAULT_CONSTITUTION } from "../../proto/constitution.mjs";
import { createInitialCertifiedState, freezeCertifiedSnapshot, sliceHashFromCache } from "../../proto/certified-state.mjs";
import { createChamber } from "../../proto/simulation-chamber.mjs";
import { observerAt, setObserverPath, defaultFlythroughPath } from "../../proto/movie-lane.mjs";
import { storyForgeIntent } from "../../proto/world.mjs";
import { wrapProtoCertifiedState, addProjectionNode } from "../scenegraph.mjs";
import { createIntegratorBuffers, step as physicsStep, PHYSICS_ABI_ID } from "../physics/index.mjs";
import {
  ORGAN_ABI_V1,
  commitEngineProposal,
  evaluateEngineProposal,
  makeEngineProposal,
} from "../aais/index.mjs";
import { createImage, projectCertifiedLayered } from "../project.mjs";
import { paint as paintOrgan } from "../painter/index.mjs";
import { speak as speakOrgan } from "../mythar/index.mjs";
import { createDemoGovernanceGraph, relaxGovStep } from "../hamiltonian/governance.mjs";

export const SDK_STATUS = "partial";
export const SDK_VERSION = "0.9.0";

export function createUniverse({
  seed = 7,
  constitution = DEFAULT_CONSTITUTION,
  defect,
  observer,
} = {}) {
  const state = createInitialCertifiedState({ constitution, seed, defect, observer });
  const chamber = createChamber(constitution);
  const graph = wrapProtoCertifiedState(state, { seed });
  addProjectionNode(graph, { domainId: "proto-32cubed", t: 0 });
  return {
    sdk: SDK_VERSION,
    abiId: ORGAN_ABI_V1.abiId,
    physicsAbi: PHYSICS_ABI_ID,
    status: SDK_STATUS,
    constitution,
    state,
    chamber,
    graph,
    buffers: createIntegratorBuffers(state.shape),
    intent: storyForgeIntent({ seed }),
    governance: createDemoGovernanceGraph(),
  };
}

export function propose(universe, proposal) {
  return commitEngineProposal(universe.state, proposal, universe.constitution);
}

export function stepPhysics(universe, extra = {}) {
  const opts = { ...extra };
  if (universe.governance && opts.governance === undefined) {
    relaxGovStep(universe.governance);
    opts.governance = universe.governance;
  }
  const proposal = physicsStep(universe.state, universe.constitution, universe.buffers, extra);
  proposal.kind = "physics";
  proposal.abiId = ORGAN_ABI_V1.abiId;
  proposal.governance = opts.governance || proposal.governance;
  const result = commitEngineProposal(universe.state, proposal, universe.constitution, opts);
  const domain = universe.graph.domains["proto-32cubed"];
  if (domain && result.committed) {
    domain.certifiedHash = universe.state.hash;
    domain.t = universe.state.t;
  }
  return result;
}

export function project(universe, image, opts = {}) {
  const img = image || createImage(64, 64);
  return projectCertifiedLayered(universe.state, img, opts);
}

/**
 * Movie Lane: sample certified t. Does not call the integrator. Does not own time.
 */
export function observe(universe, t) {
  const view = observerAt(universe.state, t);
  return {
    ...view,
    hash: sliceHashFromCache(universe.state, t),
    filled: universe.state.temporal.filled,
    ownsTime: false,
  };
}

export function authorObserverPath(universe, points) {
  return setObserverPath(universe.state, points || defaultFlythroughPath(universe.state.temporal.filled, universe.state.shape));
}

export async function paint(universe, image, opts) {
  const snap = freezeCertifiedSnapshot(universe.state);
  return paintOrgan(snap, image, opts);
}

export function speak(universe, opts) {
  const snap = freezeCertifiedSnapshot(universe.state);
  return speakOrgan(snap, opts);
}

export {
  makeEngineProposal,
  evaluateEngineProposal,
  ORGAN_ABI_V1,
  createImage,
  freezeCertifiedSnapshot,
};
