/**
 * Cross-runtime conformance suite runner.
 *
 * For each required (or selected) invariant ID × each host:
 *   collect native evidence → normalize → NormalizedClaim (ConformanceClaim).
 *
 * Aggregate **ConformanceReport** is independent verification that claims
 * satisfy the PI-* Constitutional Contracts. CKL acceptance is a separate
 * step: `acceptConformanceReport(report, { enforce })`.
 */

import {
  CROSS_RUNTIME_CONTRACT_VERSION,
  REQUIRED_INVARIANT_IDS,
  getCrossRuntimeContract,
  listConstitutionalContracts,
  resolveContractInvariantIds,
} from "./contract.js";
import {
  normalizeEvidence,
  createUnevaluatedClaim,
  validateConformanceClaim,
  CONFORMANCE_CLAIM_SCHEMA,
} from "./evidenceNormalize.js";

/** Aggregate ConformanceReport schema. */
export const CROSS_RUNTIME_REPORT_SCHEMA = "4drs.cross-runtime.conformance.v1";

/**
 * @typedef {object} RuntimeHost
 * @property {string} runtimeId
 * @property {string[]|readonly string[]} [capabilities]
 * @property {(id:string)=>boolean} [supports]
 * @property {(id:string, measurements?:object)=>object|null|undefined} [provideEvidence]
 * @property {(id:string, measurements?:object)=>object|null|undefined} [evaluate]
 * @property {string} [sourceSchemaHint]
 */

/**
 * @typedef {object} ConformanceReport
 * @property {string} schema
 * @property {"ConformanceReport"} kind
 * @property {string} contractVersion
 * @property {string} contractStatus
 * @property {object[]} contracts
 * @property {string[]} invariantIds
 * @property {object[]} hosts
 * @property {object[]} claims
 * @property {object} summary
 * @property {boolean} allRequiredPassed
 * @property {object} independentVerification
 * @property {string} note
 */

/**
 * @param {RuntimeHost} host
 * @param {string} invariantId
 * @returns {boolean}
 */
function hostSupports(host, invariantId) {
  if (typeof host.supports === "function") return host.supports(invariantId);
  if (Array.isArray(host.capabilities)) return host.capabilities.includes(invariantId);
  return typeof host.provideEvidence === "function" || typeof host.evaluate === "function";
}

/**
 * @param {RuntimeHost} host
 * @param {string} invariantId
 * @param {object} [measurements]
 * @returns {object|null|undefined}
 */
function collectEvidence(host, invariantId, measurements) {
  if (typeof host.provideEvidence === "function") {
    return host.provideEvidence(invariantId, measurements);
  }
  if (typeof host.evaluate === "function") {
    return host.evaluate(invariantId, measurements);
  }
  return null;
}

/**
 * Run cross-runtime conformance → first-class ConformanceReport.
 *
 * @param {{hosts: RuntimeHost[], measurements?: object, includeOptionalEngine?: boolean, invariantIds?: string[]}} args
 * @returns {ConformanceReport}
 */
export function runCrossRuntimeConformance(args) {
  const hosts = args?.hosts;
  if (!Array.isArray(hosts) || hosts.length === 0) {
    throw new Error("runCrossRuntimeConformance requires args.hosts (non-empty array)");
  }

  const invariantIds = resolveContractInvariantIds({
    includeOptionalEngine: args.includeOptionalEngine,
    invariantIds: args.invariantIds,
  });
  const measurements = args.measurements || undefined;
  const contract = getCrossRuntimeContract();
  const contracts = listConstitutionalContracts().filter((c) =>
    invariantIds.includes(c.id),
  );

  /** @type {import("./evidenceNormalize.js").ConformanceClaim[]} */
  const claims = [];
  const hostSummaries = [];

  for (const host of hosts) {
    const runtimeId = host.runtimeId || "unknown";
    const hostCounts = { pass: 0, fail: 0, partial: 0, unevaluated: 0 };

    for (const invariantId of invariantIds) {
      let claim;
      if (!hostSupports(host, invariantId)) {
        claim = createUnevaluatedClaim({
          invariantId,
          runtimeId,
          reason: `Host '${runtimeId}' does not advertise capability for ${invariantId}`,
        });
      } else {
        const evidence = collectEvidence(host, invariantId, measurements);
        if (!evidence) {
          claim = createUnevaluatedClaim({
            invariantId,
            runtimeId,
            reason: `Host '${runtimeId}' returned no evidence for ${invariantId}`,
          });
        } else {
          claim = normalizeEvidence(evidence, {
            runtimeId,
            sourceHint: host.sourceSchemaHint,
          });
          if (claim.invariantId === "unknown" || claim.invariantId !== invariantId) {
            claim = Object.freeze({ ...claim, invariantId });
          }
        }
      }
      claims.push(claim);
      hostCounts[claim.verdict] += 1;
    }

    hostSummaries.push({
      runtimeId,
      capabilities: host.capabilities ? [...host.capabilities] : undefined,
      sourceSchemaHint: host.sourceSchemaHint,
      summary: hostCounts,
    });
  }

  const summary = { pass: 0, fail: 0, partial: 0, unevaluated: 0 };
  for (const c of claims) {
    summary[c.verdict] += 1;
  }

  const requiredInRun = invariantIds.filter((id) =>
    REQUIRED_INVARIANT_IDS.includes(id),
  );
  const allRequiredPassed =
    requiredInRun.length > 0 &&
    hosts.every((host) => {
      const rid = host.runtimeId || "unknown";
      return requiredInRun.every((id) => {
        const claim = claims.find(
          (c) => c.runtimeId === rid && c.invariantId === id,
        );
        return claim && claim.verdict === "pass";
      });
    });

  const verifiedContractIds = requiredInRun.filter((id) =>
    hosts.every((host) => {
      const rid = host.runtimeId || "unknown";
      const claim = claims.find(
        (c) => c.runtimeId === rid && c.invariantId === id,
      );
      return claim && claim.verdict === "pass";
    }),
  );

  /** @type {ConformanceReport} */
  return {
    schema: CROSS_RUNTIME_REPORT_SCHEMA,
    kind: "ConformanceReport",
    contractVersion: CROSS_RUNTIME_CONTRACT_VERSION,
    contractStatus: contract.status,
    contracts,
    invariantIds: [...invariantIds],
    hosts: hostSummaries,
    claims,
    summary,
    allRequiredPassed,
    independentVerification: {
      verifiedContractIds,
      requiredContractIds: [...requiredInRun],
      allRequiredPassed,
      hosts: hostSummaries.map((h) => h.runtimeId),
      note:
        "Independent verification that normalized claims satisfy cited PI-* Constitutional Contracts. " +
        "This report is not itself a CKL deny gate — use acceptConformanceReport.",
    },
    acceptance: contract.acceptance,
    note:
      "ConformanceReport: PI-* IDs are Constitutional Contracts; native evidence schemas may differ. " +
      "Suite status is 'tested'. Soft CKL acceptance attaches evidence via acceptConformanceReport; " +
      "deny only when enforcePhysicalInvariantConformance is true. " +
      "CROS CI-* remains a separate lineage. EI-* not in required contractual set.",
  };
}

/**
 * Soft-validate an aggregate ConformanceReport.
 * @param {object} report
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateCrossRuntimeReport(report) {
  const errors = [];
  if (!report || report.schema !== CROSS_RUNTIME_REPORT_SCHEMA) {
    errors.push(`schema must be ${CROSS_RUNTIME_REPORT_SCHEMA}`);
  }
  if (report?.contractVersion !== CROSS_RUNTIME_CONTRACT_VERSION) {
    errors.push(`contractVersion must be ${CROSS_RUNTIME_CONTRACT_VERSION}`);
  }
  if (report?.kind != null && report.kind !== "ConformanceReport") {
    errors.push("kind must be ConformanceReport when present");
  }
  if (!Array.isArray(report?.claims)) {
    errors.push("claims missing");
    return { ok: false, errors };
  }
  for (const claim of report.claims) {
    const v = validateConformanceClaim(claim);
    if (!v.ok) {
      errors.push(`${claim.runtimeId}/${claim.invariantId}: ${v.errors.join("; ")}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export { CONFORMANCE_CLAIM_SCHEMA, getCrossRuntimeContract, REQUIRED_INVARIANT_IDS };
