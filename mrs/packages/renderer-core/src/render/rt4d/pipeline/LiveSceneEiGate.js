/**
 * Live-scene EI gate — optional pre-render evaluation of engine invariants
 * against a built Scene4D BVH.
 *
 * Soft (default when enabled): attach evidence; never throws.
 * Enforce (`enforceEngineInvariantTopology: true`): deny on topology fail.
 *
 * Catalog EI-TOPOLOGY remains **tested**. This module is the runtime attach /
 * opt-in deny path (STACK.md next increment #1). Default renders stay ungated.
 *
 * Drive-G-1: do not claim CKL/default.policies wiring; opt-in only.
 */

import {
  topologyPreservationHolds,
  createEvidenceRecord,
  getEngineInvariant,
} from "../invariants/index.js";

export class LiveSceneEiGateError extends Error {
  /**
   * @param {string} message
   * @param {object} [details]
   */
  constructor(message, details = {}) {
    super(message);
    this.name = "LiveSceneEiGateError";
    this.details = details;
  }
}

/**
 * Evaluate EI-TOPOLOGY on `scene4D.bvh` (must be built via `scene.build()`).
 *
 * @param {import("../scene/Scene4D.js").Scene4D|null|undefined} scene4D
 * @param {{
 *   checkMissImplication?: boolean,
 *   rays?: number,
 *   seed?: number,
 *   tol?: number,
 * }} [opts]
 * @returns {{
 *   invariantId: string,
 *   ok: boolean|null,
 *   status: string,
 *   source: string,
 *   nodeCount?: number,
 *   checkedPairs?: number,
 *   violations?: Array,
 *   missImplication?: object|null,
 *   reason?: string,
 * }}
 */
export function evaluateLiveSceneTopology(scene4D, opts = {}) {
  const bvh = scene4D?.bvh ?? null;
  if (!bvh || !Array.isArray(bvh.nodes) || bvh.nodes.length === 0) {
    return {
      invariantId: "EI-TOPOLOGY",
      ok: null,
      status: "skipped",
      source: "live-scene",
      reason:
        "No scene.bvh — call scene.build() with bounded primitives (getBounds) before gating.",
    };
  }
  const result = topologyPreservationHolds(bvh, {
    checkMissImplication: opts.checkMissImplication !== false,
    rays: opts.rays ?? 64,
    seed: opts.seed ?? 0x70706f,
    tol: opts.tol,
  });
  return {
    invariantId: "EI-TOPOLOGY",
    source: "live-scene",
    ...result,
  };
}

/**
 * @typedef {object} LiveSceneEiGateResult
 * @property {boolean} enabled
 * @property {boolean} enforce
 * @property {"attach"|"deny"|"skip"} verdict
 * @property {"accepted"|"enforced"|"skipped"} status
 * @property {ReturnType<typeof evaluateLiveSceneTopology>|null} topology
 * @property {import("../invariants/evidence.js").EvidenceRecord|null} evidence
 * @property {string} message
 */

/**
 * Optional live-scene EI gate. Runs only when `runEiGate` or
 * `enforceEngineInvariantTopology` is true.
 *
 * @param {import("../scene/Scene4D.js").Scene4D|null|undefined} scene4D
 * @param {{
 *   runEiGate?: boolean,
 *   enforceEngineInvariantTopology?: boolean,
 *   requireBvh?: boolean,
 *   checkMissImplication?: boolean,
 *   topologyRays?: number,
 *   seed?: number,
 *   tol?: number,
 *   log?: boolean,
 * }} [options]
 * @returns {LiveSceneEiGateResult|null} null when gate is not enabled
 * @throws {LiveSceneEiGateError} when enforce is on and topology fails (or
 *   requireBvh + missing BVH under enforce)
 */
export function runLiveSceneEiGate(scene4D, options = {}) {
  const enforce = options.enforceEngineInvariantTopology === true;
  const enabled = options.runEiGate === true || enforce;
  if (!enabled) return null;

  const topology = evaluateLiveSceneTopology(scene4D, {
    checkMissImplication: options.checkMissImplication !== false,
    rays: options.topologyRays ?? 64,
    seed: options.seed ?? 0x70706f,
    tol: options.tol,
  });

  const catalog = getEngineInvariant("EI-TOPOLOGY");
  let evidence = null;
  if (topology.ok !== null) {
    evidence = createEvidenceRecord({
      invariantId: "EI-TOPOLOGY",
      layer: "engine",
      catalogStatus: catalog?.status ?? "tested",
      predicateResult: topology,
      measurementIds: ["M-BVH-CONTAINMENT"],
      evidenceAnchors: [
        "pipeline/LiveSceneEiGate.js",
        "predicates.js::topologyPreservationHolds",
        "accel/BVH4D.js",
      ],
      runtimeId: "rt4d-live-scene",
      note: "Live-scene BVH evaluation before render (optional gate).",
    });
  }

  if (topology.ok === null) {
    const requireBvh = options.requireBvh === true || enforce;
    if (requireBvh && enforce) {
      const message = `[LiveSceneEiGate] DENY EI-TOPOLOGY: ${topology.reason ?? "no BVH"}`;
      if (options.log !== false) console.warn(message);
      throw new LiveSceneEiGateError(message, { topology, enforce: true });
    }
    const message = `[LiveSceneEiGate] SKIP EI-TOPOLOGY: ${topology.reason ?? "no BVH"}`;
    if (options.log !== false) console.log(message);
    return {
      enabled: true,
      enforce,
      verdict: "skip",
      status: "skipped",
      topology,
      evidence: null,
      message,
    };
  }

  if (enforce && topology.ok === false) {
    const message =
      `[LiveSceneEiGate] DENY EI-TOPOLOGY: containment/miss-implication failed ` +
      `(violations=${topology.violations?.length ?? "?"}, nodes=${topology.nodeCount ?? "?"})`;
    if (options.log !== false) console.warn(message);
    throw new LiveSceneEiGateError(message, { topology, evidence, enforce: true });
  }

  const passed = topology.ok === true;
  const message = passed
    ? `[LiveSceneEiGate] PASS EI-TOPOLOGY nodes=${topology.nodeCount} pairs=${topology.checkedPairs}`
    : `[LiveSceneEiGate] FAIL EI-TOPOLOGY (soft attach) violations=${topology.violations?.length ?? 0}`;
  if (options.log !== false) {
    if (passed) console.log(message);
    else console.warn(message);
  }

  return {
    enabled: true,
    enforce,
    verdict: "attach",
    status: enforce ? "enforced" : "accepted",
    topology,
    evidence,
    message,
  };
}
