/**
 * CKL-backed acceptance gate for PI-* Constitutional Contracts.
 *
 * Soft (default): attach acceptance evidence — does not deny.
 * Enforce (`enforcePhysicalInvariantConformance: true`): deny when required
 * PI-* claims are not all `pass`.
 *
 * Package-local bridge: evaluates against additive PI policies; optionally
 * hooks engine `resolveDecision` / GovernanceKernel when injected or loadable.
 * Does not rewrite the charter; does not deny every render by default.
 *
 * Scope: required PI-* contractual set only — not EI-*.
 */

import {
  ACCEPTANCE_DECISION_SCHEMA,
  CROSS_RUNTIME_CONTRACT_VERSION,
  REQUIRED_INVARIANT_IDS,
  getCrossRuntimeContract,
  listConstitutionalContracts,
} from "./contract.js";
import {
  CROSS_RUNTIME_REPORT_SCHEMA,
  validateCrossRuntimeReport,
} from "./suite.js";
import { PI_CONFORMANCE_POLICIES } from "./policies/piConformancePolicies.js";

/** Evidence id attached on soft / successful enforce accept. */
export const PI_ACCEPTANCE_EVIDENCE_ID = "ev-pi-conformance-acceptance";

/** Intent type used when routing through CKL / GovernanceKernel. */
export const PI_ACCEPTANCE_INTENT_TYPE = "accept_physical_invariant_conformance";

/**
 * Summarize required PI-* claims across hosts from a ConformanceReport.
 * @param {object} report
 * @param {readonly string[]} [requiredIds]
 * @returns {{
 *   contractIds: string[],
 *   allRequiredPassed: boolean,
 *   failing: {runtimeId:string, invariantId:string, verdict:string}[],
 *   claimsCited: object[]
 * }}
 */
export function summarizeRequiredPiClaims(report, requiredIds = REQUIRED_INVARIANT_IDS) {
  const contractIds = [...requiredIds];
  const claims = Array.isArray(report?.claims) ? report.claims : [];
  const hosts = Array.isArray(report?.hosts)
    ? report.hosts.map((h) => h.runtimeId)
    : [...new Set(claims.map((c) => c.runtimeId))];

  const claimsCited = [];
  const failing = [];

  for (const runtimeId of hosts) {
    for (const invariantId of contractIds) {
      const claim = claims.find(
        (c) => c.runtimeId === runtimeId && c.invariantId === invariantId,
      );
      if (!claim) {
        failing.push({
          runtimeId,
          invariantId,
          verdict: "missing",
        });
        continue;
      }
      claimsCited.push({
        runtimeId: claim.runtimeId,
        invariantId: claim.invariantId,
        verdict: claim.verdict,
        sourceSchema: claim.sourceSchema,
      });
      if (claim.verdict !== "pass") {
        failing.push({
          runtimeId: claim.runtimeId,
          invariantId: claim.invariantId,
          verdict: claim.verdict,
        });
      }
    }
  }

  return {
    contractIds,
    allRequiredPassed: hosts.length > 0 && failing.length === 0,
    failing,
    claimsCited,
  };
}

/**
 * Build acceptance evidence payload (P2 / attach-provenance aligned).
 * @param {object} report
 * @param {{enforce:boolean, summary:ReturnType<typeof summarizeRequiredPiClaims>, verdict:string}} ctx
 */
export function buildAcceptanceEvidence(report, ctx) {
  const contracts = listConstitutionalContracts().filter((c) =>
    ctx.summary.contractIds.includes(c.id),
  );
  return Object.freeze({
    id: PI_ACCEPTANCE_EVIDENCE_ID,
    schema: ACCEPTANCE_DECISION_SCHEMA,
    kind: "AcceptanceEvidence",
    contractVersion: CROSS_RUNTIME_CONTRACT_VERSION,
    reportSchema: report?.schema ?? CROSS_RUNTIME_REPORT_SCHEMA,
    enforce: ctx.enforce,
    verdict: ctx.verdict,
    contractIds: ctx.summary.contractIds,
    contractsCited: contracts.map((c) => ({ id: c.id, kind: c.kind })),
    claimsCited: ctx.summary.claimsCited,
    failing: ctx.summary.failing,
    allRequiredPassed: ctx.summary.allRequiredPassed,
    principles: Object.freeze(["P2-evidence", "P4-replayability"]),
    policies: Object.freeze([
      "policy-no-state-change-without-evidence",
      "policy-physical-invariant-conformance",
    ]),
    note:
      ctx.enforce
        ? "Enforce mode: required PI-* must all pass for accept."
        : "Soft mode: acceptance evidence attached; no deny.",
  });
}

/**
 * Evaluate package-local PI conformance policies (CKL-shaped).
 * @param {object} intent
 * @param {object} evidence
 * @param {object[]} [policies]
 */
export function resolvePiConformanceDecision(
  intent,
  evidence,
  policies = PI_CONFORMANCE_POLICIES,
) {
  if (!intent) {
    return {
      ok: false,
      verdict: "deny",
      reason: "No execution without intent.",
      violations: ["policy-no-execution-without-intent"],
      attachAcceptance: false,
      attachProvenance: false,
    };
  }

  const report =
    evidence?.conformanceReport ??
    evidence?.physicalInvariantConformance ??
    null;
  const enforce =
    intent.params?.enforcePhysicalInvariantConformance === true ||
    intent.enforcePhysicalInvariantConformance === true ||
    evidence?.enforcePhysicalInvariantConformance === true;

  let attachAcceptance = false;
  let attachProvenance = false;
  const violations = [];
  const requirements = [];

  for (const policy of policies) {
    if (policy.condition === "physical_invariant_conformance_report") {
      if (!report) {
        // Policy only binds when a report is present (or intent is the accept type).
        if (
          intent.type === PI_ACCEPTANCE_INTENT_TYPE ||
          intent.kind === PI_ACCEPTANCE_INTENT_TYPE
        ) {
          violations.push(policy.id);
          requirements.push("conformanceReport");
        }
        continue;
      }

      const summary = summarizeRequiredPiClaims(
        report,
        policy.requiredContractIds || REQUIRED_INVARIANT_IDS,
      );

      if (policy.rule === "attach_acceptance" || policy.rule === "attach_provenance") {
        attachAcceptance = true;
        attachProvenance = true;
        requirements.push("acceptance");
      }

      if (
        (policy.rule === "deny_if_enforce_and_required_pi_fail" ||
          policy.rule === "deny_if_false") &&
        enforce &&
        !summary.allRequiredPassed
      ) {
        violations.push(policy.id);
        requirements.push(
          ...summary.failing.map(
            (f) => `pi:${f.invariantId}@${f.runtimeId}:${f.verdict}`,
          ),
        );
      }
    }
  }

  if (violations.length) {
    return {
      ok: false,
      verdict: "deny",
      reason: "Required PI-* Constitutional Contracts not satisfied under enforce.",
      violations,
      requirements,
      attachAcceptance,
      attachProvenance,
      enforce,
    };
  }

  return {
    ok: true,
    verdict: attachAcceptance ? "attach" : "allow",
    reason: enforce
      ? "Required PI-* claims passed; acceptance attached."
      : "Soft acceptance: evidence attached without deny.",
    violations: [],
    requirements,
    attachAcceptance: true,
    attachProvenance: true,
    enforce,
  };
}

/**
 * Accept (or deny under enforce) a ConformanceReport via CKL-shaped gate.
 *
 * @param {object} report — output of runCrossRuntimeConformance
 * @param {{
 *   enforce?: boolean,
 *   enforcePhysicalInvariantConformance?: boolean,
 *   intent?: object,
 *   ckl?: { GetPoliciesForWorld?: Function, GetPrecedents?: Function, recordPrecedent?: Function },
 *   kernel?: { evaluateIntent: Function },
 *   resolveDecision?: Function,
 *   policies?: object[],
 * }} [options]
 * @returns {import("./contract.js").AcceptanceDecision & {cklDecision?: object|null}}
 */
export function acceptConformanceReport(report, options = {}) {
  const enforce =
    options.enforce === true ||
    options.enforcePhysicalInvariantConformance === true;

  const shape = validateCrossRuntimeReport(report);
  if (!shape.ok) {
    const summary = summarizeRequiredPiClaims(report || {});
    const acceptanceEvidence = buildAcceptanceEvidence(report || {}, {
      enforce,
      summary,
      verdict: "deny",
    });
    return Object.freeze({
      schema: ACCEPTANCE_DECISION_SCHEMA,
      verdict: /** @type {const} */ ("deny"),
      ok: false,
      enforce,
      contractIds: summary.contractIds,
      acceptanceEvidence,
      cklDecision: null,
      reason: `Invalid ConformanceReport: ${shape.errors.join("; ")}`,
      status: enforce ? /** @type {const} */ ("enforced") : /** @type {const} */ ("accepted"),
      contract: getCrossRuntimeContract(),
    });
  }

  const summary = summarizeRequiredPiClaims(report);
  const intent = options.intent || {
    id: "intent-pi-accept",
    type: PI_ACCEPTANCE_INTENT_TYPE,
    kind: PI_ACCEPTANCE_INTENT_TYPE,
    actor: "runtime-adapter",
    params: {
      enforcePhysicalInvariantConformance: enforce,
    },
  };
  // Ensure enforce flag is visible on intent even when caller supplied intent.
  const intentWithEnforce = {
    ...intent,
    params: {
      ...(intent.params || {}),
      enforcePhysicalInvariantConformance:
        intent.params?.enforcePhysicalInvariantConformance === true || enforce,
    },
  };

  const evidence = {
    id: "ev-pi-conformance-bundle",
    evidenceIds: [PI_ACCEPTANCE_EVIDENCE_ID],
    conformanceReport: report,
    physicalInvariantConformance: report,
    enforcePhysicalInvariantConformance: enforce,
  };

  const policies = options.policies || PI_CONFORMANCE_POLICIES;

  // PI-* gate is package-local (additive policies). Engine default.policies.json
  // is not mutated; inject resolveDecision only to merge world policies + PI set.
  let cklDecision;
  if (typeof options.resolveDecision === "function") {
    const worldPolicies =
      options.ckl?.GetPoliciesForWorld?.("*")?.policies || [];
    const policySet = { policies: [...worldPolicies, ...policies] };
    const precedents = options.ckl?.GetPrecedents?.(intentWithEnforce) || [];
    cklDecision = options.resolveDecision(
      intentWithEnforce,
      evidence,
      policySet,
      precedents,
    );
  } else {
    cklDecision = resolvePiConformanceDecision(
      intentWithEnforce,
      evidence,
      policies,
    );
  }

  // Optional GovernanceKernel hook: record precedent / attach provenance only
  // after the PI gate; kernel default policies must not override PI deny/accept.
  let kernelDecision = null;
  if (
    options.kernel &&
    typeof options.kernel.evaluateIntent === "function" &&
    cklDecision?.ok !== false
  ) {
    kernelDecision = options.kernel.evaluateIntent(intentWithEnforce, {
      ...evidence,
      evidenceIds: [
        ...(evidence.evidenceIds || []),
        PI_ACCEPTANCE_EVIDENCE_ID,
      ],
    });
    cklDecision = {
      ...cklDecision,
      kernelDecision,
      attachProvenance:
        cklDecision.attachProvenance ||
        kernelDecision?.attachProvenance === true,
    };
  }

  const denied =
    cklDecision?.ok === false ||
    cklDecision?.verdict === "deny" ||
    (enforce && !summary.allRequiredPassed);

  const verdict = denied
    ? /** @type {const} */ ("deny")
    : /** @type {const} */ ("attach");

  const acceptanceEvidence = buildAcceptanceEvidence(report, {
    enforce,
    summary,
    verdict,
  });

  if (
    options.ckl &&
    typeof options.ckl.recordPrecedent === "function" &&
    !options.kernel
  ) {
    options.ckl.recordPrecedent({
      intent: intentWithEnforce,
      decision: { ok: !denied, verdict },
    });
  }

  return Object.freeze({
    schema: ACCEPTANCE_DECISION_SCHEMA,
    verdict,
    ok: !denied,
    enforce,
    contractIds: summary.contractIds,
    acceptanceEvidence,
    cklDecision,
    reason: denied
      ? cklDecision?.reason ||
        "Required PI-* Constitutional Contracts failed under enforce."
      : enforce
        ? "ConformanceReport accepted under enforce; required PI-* all pass."
        : "Soft acceptance: ConformanceReport verified; acceptance evidence attached.",
    status: enforce
      ? /** @type {const} */ ("enforced")
      : /** @type {const} */ ("accepted"),
    contract: getCrossRuntimeContract(),
    allRequiredPassed: summary.allRequiredPassed,
  });
}

/**
 * Soft-wire helper for Sovereign X / adapters: run accept and merge refs.
 * Never denies unless `enforcePhysicalInvariantConformance` is true.
 *
 * @param {object} decision — routing decision object
 * @param {object} report — ConformanceReport
 * @param {{enforce?: boolean}} [opts]
 */
export function attachAcceptanceToDecision(decision, report, opts = {}) {
  const acceptance = acceptConformanceReport(report, {
    enforce: opts.enforce === true,
    enforcePhysicalInvariantConformance: opts.enforce === true,
  });

  if (!acceptance.ok && acceptance.enforce) {
    const err = new Error(acceptance.reason);
    err.code = "PI_CONFORMANCE_DENIED";
    err.acceptance = acceptance;
    throw err;
  }

  const evidenceRefs = [
    ...(decision.evidenceRefs || []),
    PI_ACCEPTANCE_EVIDENCE_ID,
  ];
  return {
    ...decision,
    evidenceRefs: [...new Set(evidenceRefs)],
    physicalInvariantAcceptance: acceptance,
    attachProvenance: true,
  };
}
