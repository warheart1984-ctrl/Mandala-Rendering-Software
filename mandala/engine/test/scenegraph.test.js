import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialCertifiedState } from "../../proto/certified-state.mjs";
import { ORGAN_MAP } from "../../proto/organs.mjs";
import {
  addNode,
  addProjectionNode,
  certifiedHashOf,
  createEmptyGraph,
  graphHash,
  recordTopologicalEvent,
  wrapProtoCertifiedState,
} from "../scenegraph.mjs";
import { ORGAN_TAGS } from "../organs.mjs";

describe("mandala engine v0.1 — 4D scene graph skeleton", () => {
  it("wraps proto certified state as a domain without copying field buffers", () => {
    const state = createInitialCertifiedState({ seed: 7 });
    const graph = wrapProtoCertifiedState(state);
    const domain = graph.domains["proto-32cubed"];
    assert.equal(domain.certifiedHash, state.hash);
    assert.equal(domain.t, 0);
    assert.equal(domain.shape.nx, 32);
    assert.equal(graph.nodes.some((n) => n.kind === "simulationDomain"), true);
    assert.equal(graph.nodes.some((n) => n.organ === "StoryForge"), true);
    assert.equal(graph.nodes.some((n) => n.organ === "AAIS"), true);
    assert.equal(graph.nodes.some((n) => n.organ === "MovieLane"), true);
    const movie = graph.nodes.find((n) => n.organ === "MovieLane");
    assert.equal(movie.payload.ownsTime, false);
    assert.equal("scalar" in domain, false);
  });

  it("graph construction is deterministic for the same certified seed", () => {
    const a = wrapProtoCertifiedState(createInitialCertifiedState({ seed: 7 }));
    const b = wrapProtoCertifiedState(createInitialCertifiedState({ seed: 7 }));
    assert.equal(graphHash(a), graphHash(b));
    const c = wrapProtoCertifiedState(createInitialCertifiedState({ seed: 11 }));
    assert.notEqual(graphHash(c), graphHash(a));
  });

  it("adding a Mandala projection node does not change certified state hash", () => {
    const state = createInitialCertifiedState({ seed: 7 });
    const hashBefore = state.hash;
    const mass0 = state.scalar[0];
    const graph = wrapProtoCertifiedState(state);
    const domainHashBefore = certifiedHashOf(graph, "proto-32cubed");
    addProjectionNode(graph, { domainId: "proto-32cubed", t: 0 });
    assert.equal(state.hash, hashBefore);
    assert.equal(state.scalar[0], mass0);
    assert.equal(certifiedHashOf(graph, "proto-32cubed"), domainHashBefore);
    assert.equal(certifiedHashOf(graph, "proto-32cubed"), hashBefore);
    const proj = graph.nodes.find((n) => n.kind === "projection");
    assert.equal(proj.organ, "Mandala");
    assert.equal(proj.payload.mutatesCertified, false);
  });

  it("closed organ tags match proto Organ Map; unknown organs are rejected", () => {
    for (const tag of ORGAN_TAGS) {
      assert.ok(ORGAN_MAP[tag], tag);
    }
    const graph = createEmptyGraph();
    assert.throws(
      () => addNode(graph, { organ: "UnrealPhysics", t: 0 }),
      /unknown organ/,
    );
  });

  it("topological event log is skeleton and does not rewrite domain hash", () => {
    const state = createInitialCertifiedState({ seed: 3 });
    const graph = wrapProtoCertifiedState(state);
    const h = certifiedHashOf(graph, "proto-32cubed");
    const ev = recordTopologicalEvent(graph, {
      t: 0,
      kind: "identity",
      domainId: "proto-32cubed",
      nodeIds: [graph.nodes[1].id],
    });
    assert.equal(ev.status, "skeleton");
    assert.equal(certifiedHashOf(graph, "proto-32cubed"), h);
    assert.equal(state.hash, h);
  });
});
