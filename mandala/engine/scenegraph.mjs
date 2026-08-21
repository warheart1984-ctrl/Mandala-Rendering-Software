/**
 * 4D scene graph skeleton (Mandala Engine v0.1).
 *
 * Wraps proto certified state as a simulation domain. Nodes carry (x,y,z,t)
 * via temporal coordinate `t` plus optional observer payload. Organ tags are
 * the closed Organ Map. Topological events are a skeleton log.
 *
 * Status: **skeleton**. Not Unreal/Unity/Blender depsgraph.
 * Adding a projection node must not change certified state hash.
 */

import { createHash } from "node:crypto";
import {
  DEFAULT_KIND_FOR_ORGAN,
  NODE_KIND_SET,
  ORGAN_TAG_SET,
} from "./organs.mjs";
import { recordTopologicalEvent } from "./topological-events.mjs";

export const ENGINE_GRAPH_VERSION = "0.1.0";
export const ENGINE_GRAPH_STATUS = "skeleton";

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

export function canonicalStringify(value) {
  return JSON.stringify(sortKeys(value));
}

export function graphHash(graph) {
  return createHash("sha256")
    .update(canonicalStringify(graphFingerprint(graph)))
    .digest("hex");
}

export function graphFingerprint(graph) {
  return {
    version: graph.version,
    status: graph.status,
    nextId: graph.nextId,
    nodes: graph.nodes,
    edges: graph.edges,
    events: graph.events,
    domains: graph.domains,
  };
}

function nextNodeId(graph) {
  const id = `n${String(graph.nextId).padStart(4, "0")}`;
  graph.nextId += 1;
  return id;
}

/**
 * Empty deterministic graph. No certified buffers live here.
 */
export function createEmptyGraph({ graphId = "mandala-engine-graph-v0" } = {}) {
  return {
    graphId,
    version: ENGINE_GRAPH_VERSION,
    status: ENGINE_GRAPH_STATUS,
    nextId: 1,
    nodes: [],
    edges: [],
    events: [],
    domains: {},
  };
}

export function addNode(graph, spec) {
  const organ = spec.organ;
  if (!ORGAN_TAG_SET.has(organ)) {
    throw new Error(`unknown organ tag: ${organ}`);
  }
  const kind = spec.kind || DEFAULT_KIND_FOR_ORGAN[organ];
  if (!NODE_KIND_SET.has(kind)) {
    throw new Error(`unknown node kind: ${kind}`);
  }
  const t = spec.t | 0;
  const node = {
    id: spec.id || nextNodeId(graph),
    t,
    organ,
    kind,
    domainId: spec.domainId ?? null,
    parentId: spec.parentId ?? null,
    payload: spec.payload ? sortKeys({ ...spec.payload }) : {},
  };
  if (spec.id && graph.nodes.some((n) => n.id === spec.id)) {
    throw new Error(`duplicate node id: ${spec.id}`);
  }
  if (spec.id) {
    const n = Number(String(spec.id).replace(/^n/, ""));
    if (Number.isFinite(n) && n >= graph.nextId) graph.nextId = n + 1;
  }
  graph.nodes.push(node);
  return node;
}

export function addEdge(graph, fromId, toId, rel = "observes") {
  if (!graph.nodes.some((n) => n.id === fromId)) {
    throw new Error(`edge from unknown node: ${fromId}`);
  }
  if (!graph.nodes.some((n) => n.id === toId)) {
    throw new Error(`edge to unknown node: ${toId}`);
  }
  const edge = { from: fromId, to: toId, rel: String(rel) };
  graph.edges.push(edge);
  return edge;
}

/**
 * Attach proto certified state as a simulation domain.
 * Stores hash + metadata only — no 32³ buffers (keep RAM tiny).
 */
export function attachCertifiedDomain(graph, certified, { domainId = "proto-32cubed" } = {}) {
  if (!certified || typeof certified.hash !== "string") {
    throw new Error("attachCertifiedDomain requires proto certified state with hash");
  }
  graph.domains[domainId] = {
    domainId,
    certifiedHash: certified.hash,
    constitutionId: certified.constitutionId,
    seed: certified.seed,
    t: certified.t | 0,
    shape: {
      nx: certified.shape.nx,
      ny: certified.shape.ny,
      nz: certified.shape.nz,
      nt: certified.shape.nt,
    },
  };
  const node = addNode(graph, {
    organ: "SimulationChamber",
    kind: "simulationDomain",
    t: certified.t | 0,
    domainId,
    payload: {
      certifiedHash: certified.hash,
      constitutionId: certified.constitutionId,
      seed: certified.seed,
    },
  });
  return { domainId, node, certifiedHash: certified.hash };
}

/**
 * Mandala projection / render node. Observes a domain; must not write certified state.
 */
export function addProjectionNode(graph, { domainId, t, parentId = null } = {}) {
  const domain = graph.domains[domainId];
  if (!domain) throw new Error(`no simulation domain: ${domainId}`);
  const node = addNode(graph, {
    organ: "Mandala",
    kind: "projection",
    t: t == null ? domain.t : t | 0,
    domainId,
    parentId,
    payload: {
      frozenSnapshot: true,
      observesHash: domain.certifiedHash,
      mutatesCertified: false,
    },
  });
  addEdge(graph, node.id, parentId || domainNodeId(graph, domainId), "projects");
  return node;
}

export function domainNodeId(graph, domainId) {
  const n = graph.nodes.find(
    (x) => x.kind === "simulationDomain" && x.domainId === domainId,
  );
  return n ? n.id : null;
}

export function certifiedHashOf(graph, domainId) {
  return graph.domains[domainId]?.certifiedHash ?? null;
}

/**
 * Wrap a proto certified snapshot as a tiny organ graph (intent, domain, gate, observer).
 * Does not evolve Chamber. Does not project.
 */
export function wrapProtoCertifiedState(certified, { domainId = "proto-32cubed", seed } = {}) {
  const graph = createEmptyGraph();
  const intent = addNode(graph, {
    organ: "StoryForge",
    kind: "intent",
    t: certified.t | 0,
    domainId,
    payload: {
      constitutionId: certified.constitutionId,
      seed: seed ?? certified.seed,
    },
  });
  const attached = attachCertifiedDomain(graph, certified, { domainId });
  addEdge(graph, intent.id, attached.node.id, "declares");
  const gate = addNode(graph, {
    organ: "AAIS",
    kind: "gate",
    t: certified.t | 0,
    domainId,
    payload: { invariant: "proto.scalar-mass-conservation" },
  });
  addEdge(graph, gate.id, attached.node.id, "gates");
  const observer = addNode(graph, {
    organ: "MovieLane",
    kind: "observation",
    t: certified.t | 0,
    domainId,
    payload: {
      ownsTime: false,
      observer: certified.observer ? { ...certified.observer } : null,
    },
  });
  addEdge(graph, observer.id, attached.node.id, "observes");
  return graph;
}

export { recordTopologicalEvent };
