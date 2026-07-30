/**
 * Constitutional State Engine (CSE)
 * Execution model: Intent → Evidence → Planning → Execution → Validation
 *
 * Enforced for governed actions (session + exports). Session CSR log is
 * in-memory; download emits a provenance artifact.
 */

import { CHARTER } from "./charter.js";
import { resolveAuthority } from "./contracts.js";
import { makeId, nowIso } from "../../engine/runtime/types.js";

export class ConstitutionalStateEngine {
  constructor(options = {}) {
    this.charterId = CHARTER.id;
    this.records = [];
    this.onRecord = options.onRecord ?? null;
  }

  /** ISL-lite: create a structured intent record. */
  declareIntent({ kind, goal, constraints = {}, actor = "4dce.renderer" }) {
    if (!kind || !goal) {
      throw new Error("Intent requires kind and goal");
    }
    const intent = {
      id: makeId("intent"),
      kind,
      goal,
      constraints,
      actor,
      charterId: this.charterId,
      createdAt: nowIso(),
    };
    this._append({
      phase: "intent",
      intentId: intent.id,
      payload: intent,
    });
    return intent;
  }

  /**
   * Validate evidence against cinematic 4D invariants when applicable.
   */
  validateEvidence(evidence, action) {
    const errors = [];
    if (!evidence || typeof evidence !== "object") {
      return { ok: false, errors: ["Evidence object required"] };
    }
    if (!evidence.timestamp) errors.push("Evidence.timestamp required");

    if (
      action === "artifact.picture.export" ||
      action === "artifact.movie.export" ||
      action === "render.session.start" ||
      action === "timeline.play" ||
      action === "csr.replay.params"
    ) {
      const inv = CHARTER.cinematic4d;
      if (evidence.vertexCount !== inv.vertexCount) {
        errors.push(`vertexCount must be ${inv.vertexCount}`);
      }
      if (evidence.edgeCount !== inv.edgeCount) {
        errors.push(`edgeCount must be ${inv.edgeCount}`);
      }
      for (const key of ["theta", "d4", "d3", "speed", "scale"]) {
        if (typeof evidence[key] !== "number" || Number.isNaN(evidence[key])) {
          errors.push(`Evidence.${key} must be a number`);
        }
      }
    }

    if (action === "timeline.pause" || action === "timeline.seek") {
      if (typeof evidence.timeSec !== "number") {
        errors.push("Evidence.timeSec required for timeline control");
      }
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * Governed execute: Intent → Evidence → Authority → Execution → CSR
   *
   * When `decision` is provided (from GovernanceKernel.evaluateIntent), its
   * governance trace (paramAdjust, attachProvenance, policiesApplied,
   * precedentCount, decisionId) is embedded in the CSR.  This closes the
   * CKL→CSE integration gap: policy evaluations from ConstitutionalKnowledgeLayer
   * flow into the execution record without a second independent path.
   */
  async execute({ intent, evidence, action, run, decision = null }) {
    if (!intent?.id) {
      throw new Error("No execution without intent");
    }

    const evCheck = this.validateEvidence(evidence, action);
    this._append({
      phase: "evidence",
      intentId: intent.id,
      payload: { evidence, validation: evCheck },
    });
    if (!evCheck.ok) {
      throw new Error(`No state change without evidence: ${evCheck.errors.join("; ")}`);
    }

    const auth = resolveAuthority(intent.actor, action);
    this._append({
      phase: "authority",
      intentId: intent.id,
      payload: auth,
    });
    if (!auth.ok) {
      throw new Error(`No authority without contract: ${auth.reason}`);
    }

    this._append({
      phase: "planning",
      intentId: intent.id,
      payload: { action, contractId: auth.contractId, decision },
    });

    let result;
    try {
      result = await run();
    } catch (err) {
      this._append({
        phase: "execution",
        intentId: intent.id,
        status: "failed",
        payload: { action, error: String(err?.message || err) },
      });
      throw err;
    }

    const csr = {
      id: makeId("csr"),
      intentId: intent.id,
      action,
      contractId: auth.contractId,
      charterId: this.charterId,
      evidence,
      result,
      governanceTrace: decision
        ? {
            decisionId: decision.decisionId,
            verdict: decision.verdict,
            policiesApplied: decision.policiesApplied,
            precedentCount: decision.precedentCount,
            paramAdjust: decision.paramAdjust,
            attachProvenance: Boolean(decision.attachProvenance),
          }
        : null,
      createdAt: nowIso(),
    };

    this._append({
      phase: "validation",
      intentId: intent.id,
      status: "ok",
      payload: csr,
    });

    return csr;
  }

  /** Snapshot for Temporal Replay Timeline (parameter replay). */
  latestCsr(action) {
    for (let i = this.records.length - 1; i >= 0; i--) {
      const r = this.records[i];
      if (r.phase === "validation" && r.payload?.action === action) {
        return r.payload;
      }
    }
    return null;
  }

  listCsrs() {
    return this.records
      .filter((r) => r.phase === "validation" && r.status === "ok")
      .map((r) => r.payload);
  }

  exportProvenance() {
    return {
      charterId: this.charterId,
      charterVersion: CHARTER.version,
      exportedAt: nowIso(),
      recordCount: this.records.length,
      records: this.records,
      csrs: this.listCsrs(),
    };
  }

  _append(entry) {
    const row = {
      id: makeId("log"),
      at: nowIso(),
      ...entry,
    };
    this.records.push(row);
    if (this.onRecord) this.onRecord(row);
    return row;
  }
}

export function renderEvidenceFrom(renderer, extras = {}) {
  return {
    timestamp: nowIso(),
    surfaceId: renderer.surfaceId ?? "tesseract",
    vertexCount: renderer.vertices4D.length,
    edgeCount: renderer.edges.length,
    theta: renderer.theta,
    d4: renderer.d4,
    d3: renderer.d3,
    speed: renderer.speed,
    scale: renderer.scale,
    weights: { ...renderer.weights },
    rotationPlanes: CHARTER.cinematic4d.activePlanes,
    ...extras,
  };
}
