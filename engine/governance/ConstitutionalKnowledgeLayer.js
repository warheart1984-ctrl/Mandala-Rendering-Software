/**
 * Constitutional Knowledge Layer (CKL) — policies + precedents.
 * Status: enforced for policy evaluation; precedents grow from decisions.
 */

import { CONTRACTS, resolveAuthority } from "../constitution/contracts.js";
import { nowIso } from "../runtime/types.js";
import {
  evaluateAmendmentVIIPolicy,
  POLICY_IDS as AMENDMENT_VII_POLICY_IDS,
} from "./biometric/amendmentVII.js";
import {
  evaluateWorldProfilePolicy,
  WORLD_PROFILE_ORDER,
} from "./biometric/amendmentVIII.js";

export class ConstitutionalKnowledgeLayer {
  /**
   * @param {object[]} policies
   */
  constructor(policies = []) {
    this.policies = policies.slice();
    this.precedents = [];
  }

  static async loadDefault(fetchImpl = fetch, options = {}) {
    const baseRaw =
      options.policiesBaseUrl ??
      (typeof import.meta?.url === "string"
        ? new URL(".", import.meta.url).href
        : "file:///" + process.cwd().replace(/\\/g, "/") + "/");
    const base = baseRaw.endsWith("/") ? baseRaw : new URL("./", baseRaw).href;
    const url = new URL("policies/default.policies.json", base).href;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error("Failed to load CKL policies");
    const policies = await res.json();
    return new ConstitutionalKnowledgeLayer(policies);
  }

  GetPoliciesForWorld(worldId) {
    return {
      worldId: worldId ?? "*",
      policies: this.policies.slice(),
      loadedAt: nowIso(),
    };
  }

  GetPrecedents(intent) {
    const type = intent?.type ?? intent?.kind;
    return this.precedents.filter(
      (p) => !type || p.intentType === type || p.worldId === intent.world,
    );
  }

  recordPrecedent({ intent, decision, driftScore = 0 }) {
    const row = {
      id: `precedent-${this.precedents.length + 1}`,
      intentType: intent?.type ?? intent?.kind,
      worldId: intent?.world,
      intentId: intent?.id,
      decision: decision?.verdict ?? decision?.ok,
      driftScore,
      at: nowIso(),
    };
    this.precedents.push(row);
    return row;
  }
}

/**
 * Apply policy set to intent + evidence → allow / deny / require_evidence / attach_provenance
 */
export function resolveDecision(intent, evidence, policySet, precedents = []) {
  const violations = [];
  const requirements = [];
  let attachProvenance = false;
  let paramAdjust = null;
  /** @type {string|null} */
  let haltCode = null;
  /** @type {object|null} */
  let auditReceipt = null;

  if (!intent) {
    return {
      ok: false,
      verdict: "deny",
      reason: "No execution without intent.",
      violations: ["policy-no-execution-without-intent"],
    };
  }

  const policies = policySet?.policies ?? [];
  const mutationTypes = new Set([
    "update_world",
    "play_timeline",
    "render_4d_tesseract",
    "artifact.picture",
    "artifact.movie",
    "render.session",
  ]);
  const getContract = (contractId) =>
    (CONTRACTS?.contracts ?? []).find((c) => c.contractId === contractId) ?? null;
  const timelineId =
    intent.timeline ??
    intent.timelineId ??
    intent.payload?.timelineId ??
    (typeof intent.params?.timeline === "string"
      ? intent.params.timeline
      : null) ??
    "";
  const driftScore =
    typeof evidence?.driftScore === "number"
      ? evidence.driftScore
      : typeof intent.params?.driftScore === "number"
        ? intent.params.driftScore
        : 0;
  const isDirectorIntent =
    intent.actor === "4dce.director" ||
    intent.type === "director" ||
    intent.kind === "director";
  const isReplayIntent =
    intent.actor === "4dce.replay" ||
    intent.type === "replay" ||
    intent.kind === "replay";

  for (const policy of policies) {
    if (policy.condition === "intent != null") {
      // already checked
      continue;
    }
    if (policy.condition === "require_evidence_for_mutation") {
      if (mutationTypes.has(intent.type) || mutationTypes.has(intent.kind)) {
        if (!evidence) {
          violations.push(policy.id);
        }
      }
    }
    if (policy.condition === "play_timeline_or_render_4d") {
      if (
        intent.type === "play_timeline" ||
        intent.type === "render_4d_tesseract" ||
        intent.kind === "play_timeline"
      ) {
        if (policy.rule === "attach_provenance") {
          attachProvenance = true;
          requirements.push("provenance");
        }
        if (!evidence) {
          violations.push(policy.id);
        }
      }
    }
    if (policy.condition === "actor_has_contract") {
      // Actor must map to a registered contract. When intent.action (or
      // authorizedAction) is set, also enforce the contract allow-list via
      // resolveAuthority. Full CSE execute() still resolves action separately.
      if (!intent.actor) {
        violations.push(policy.id);
      } else {
        const action = intent.action ?? intent.authorizedAction ?? null;
        if (action) {
          const auth = resolveAuthority(intent.actor, action);
          if (!auth.ok) {
            violations.push(policy.id);
          }
        } else {
          const hasContract = CONTRACTS.contracts.some(
            (c) => c.actor === intent.actor && c.status === "enforced",
          );
          if (!hasContract) {
            violations.push(policy.id);
          }
        }
      }
    }
    if (policy.condition === "play_timeline_requires_world") {
      if (intent.type === "play_timeline" || intent.kind === "play_timeline") {
        const world =
          intent.world ?? intent.constraints?.worldId ?? null;
        if (!world) {
          violations.push(policy.id);
        }
      }
    }
    if (policy.condition === "play_timeline") {
      if (intent.type === "play_timeline" || intent.kind === "play_timeline") {
        const world =
          intent.world ?? intent.constraints?.worldId ?? null;
        if (!world) {
          violations.push(policy.id);
        }
      }
    }
    if (policy.condition === "evidence != null") {
      if (mutationTypes.has(intent.type) || mutationTypes.has(intent.kind)) {
        if (!evidence) {
          violations.push(policy.id);
        }
      }
    }
    if (policy.condition === "actor.contract != null") {
      // No authority without contract. When an action is claimed, enforce the
      // contract allow-list; otherwise the intent must at least name an actor.
      if (!intent.actor) {
        violations.push(policy.id);
      } else {
        const action = intent.action ?? intent.authorizedAction ?? null;
        if (action) {
          const auth = resolveAuthority(intent.actor, action);
          if (!auth.ok) {
            violations.push(policy.id);
          }
        }
      }
    }
    if (policy.condition === "always") {
      if (policy.action === "attach_provenance") {
        attachProvenance = true;
        requirements.push("provenance");
      }
    }
    if (policy.condition === "director.contract != null") {
      const dir = getContract("contract.director.v1");
      if (!dir || dir.status !== "enforced") {
        violations.push(policy.id);
      }
    }
    if (policy.condition === "director.action in forbidden") {
      const dir = getContract("contract.director.v1");
      const action = intent.action ?? intent.authorizedAction ?? null;
      const forbidden = [...(dir?.forbiddenActions ?? []), ...(dir?.forbidden ?? [])];
      if (isDirectorIntent && action && forbidden.includes(action)) {
        violations.push(policy.id);
      }
    }
    if (policy.condition === "director.mcp_invocation") {
      const dir = getContract("contract.director.v1");
      const action = intent.action ?? intent.authorizedAction ?? null;
      const isMcpAction = (dir?.mcpToolAccess ?? []).includes(action);
      if (isDirectorIntent && isMcpAction && policy.action === "attach_provenance") {
        attachProvenance = true;
        requirements.push("mcp_provenance");
      }
    }
    if (policy.condition === "replay.contract != null") {
      const replay = getContract("contract.replay.v1");
      if (!replay || replay.status !== "enforced") {
        violations.push(policy.id);
      }
    }
    if (policy.condition === "replay.action in forbidden") {
      const replay = getContract("contract.replay.v1");
      const action = intent.action ?? intent.authorizedAction ?? null;
      const forbidden = replay?.forbidden ?? [];
      if (isReplayIntent && action && forbidden.includes(action)) {
        violations.push(policy.id);
      }
    }
    if (policy.condition === "replay.evidence_complete") {
      const replay = getContract("contract.replay.v1");
      const required = replay?.requiredEvidence ?? [];
      const missing = required.filter(
        (r) => !(evidence?.[r]) && !(evidence?.items?.some((i) => i?.id === r)),
      );
      if (isReplayIntent && (!evidence || missing.length)) {
        violations.push(policy.id);
      }
    }
    if (policy.condition === "replay.provenance_complete") {
      const hasProvenance =
        evidence?.mcp_provenance_chain ||
        evidence?.provenanceChain ||
        evidence?.provenance;
      if (isReplayIntent && !hasProvenance) {
        violations.push(policy.id);
      }
    }
    if (policy.condition === "replay.authority == replay-only") {
      const replay = getContract("contract.replay.v1");
      if (!replay || replay.authority !== "replay-only") {
        violations.push(policy.id);
      }
    }

    // Additive PI-* Constitutional Contract acceptance (opt-in via report + enforce flag).
    // Policies live package-local by default; this condition enables CKL when merged.
    if (policy.condition === "physical_invariant_conformance_report") {
      const report =
        evidence?.conformanceReport ??
        evidence?.physicalInvariantConformance ??
        null;
      const enforce =
        intent.params?.enforcePhysicalInvariantConformance === true ||
        intent.enforcePhysicalInvariantConformance === true ||
        evidence?.enforcePhysicalInvariantConformance === true;
      const acceptIntent =
        intent.type === "accept_physical_invariant_conformance" ||
        intent.kind === "accept_physical_invariant_conformance";

      if (!report) {
        if (acceptIntent) {
          violations.push(policy.id);
          requirements.push("conformanceReport");
        }
      } else {
        if (
          policy.rule === "attach_acceptance" ||
          policy.rule === "attach_provenance"
        ) {
          attachProvenance = true;
          requirements.push("acceptance");
        }
        if (
          (policy.rule === "deny_if_enforce_and_required_pi_fail" ||
            policy.rule === "deny_if_false") &&
          enforce
        ) {
          const requiredIds = Array.isArray(policy.requiredContractIds)
            ? policy.requiredContractIds
            : ["PI-GEO-LENGTH", "PI-CALC-ENERGY", "PI-TRIG-RADIAL"];
          const claims = Array.isArray(report.claims) ? report.claims : [];
          const hostIds = Array.isArray(report.hosts)
            ? report.hosts.map((h) => h.runtimeId)
            : [...new Set(claims.map((c) => c.runtimeId))];
          const failed = [];
          for (const runtimeId of hostIds) {
            for (const invariantId of requiredIds) {
              const claim = claims.find(
                (c) =>
                  c.runtimeId === runtimeId && c.invariantId === invariantId,
              );
              if (!claim || claim.verdict !== "pass") {
                failed.push(`${invariantId}@${runtimeId}`);
              }
            }
          }
          if (failed.length || report.allRequiredPassed === false) {
            violations.push(policy.id);
            requirements.push(...failed.map((f) => `pi:${f}`));
          }
        }
      }
    }

    // Expression-lite: intent.timeline == '...' [&& drift_score > N]
    if (
      typeof policy.condition === "string" &&
      policy.condition.includes("intent.timeline ==")
    ) {
      const match = evalTimelineCondition(policy.condition, {
        timelineId,
        driftScore,
      });
      if (match) {
        if (
          policy.rule === "deny_if_false" &&
          Array.isArray(policy.require)
        ) {
          const ids = collectEvidenceIds(evidence);
          const missing = policy.require.filter((r) => !ids.has(r));
          if (missing.length) {
            violations.push(policy.id);
            requirements.push(...missing.map((m) => `evidence:${m}`));
          }
        }
        if (policy.rule === "modify_param" && policy.param && policy.modifier) {
          const current =
            typeof evidence?.params?.[policy.param] === "number"
              ? evidence.params[policy.param]
              : typeof intent.params?.[policy.param] === "number"
                ? intent.params[policy.param]
                : 1;
          const modified = evalModifier(policy.modifier, {
            self: current,
            [policy.param]: current,
            speed: current,
          });
          paramAdjust = {
            ...(paramAdjust || {}),
            [policy.param]: modified,
            policy: policy.id,
            reason: policy.message ?? policy.description,
          };
        }
      }
    }

    // SME v1.0 shorthand conditions
    if (policy.condition === "drift > 0.7") {
      if (
        policy.action === "modify_param" &&
        policy.param &&
        policy.modifier &&
        driftScore > 0.7
      ) {
        const current =
          typeof evidence?.params?.[policy.param] === "number"
            ? evidence.params[policy.param]
            : typeof intent.params?.[policy.param] === "number"
              ? intent.params[policy.param]
              : 1;
        const modified = evalModifier(policy.modifier, {
          self: current,
          [policy.param]: current,
          speed: current,
        });
        paramAdjust = {
          ...(paramAdjust || {}),
          [policy.param]: modified,
          policy: policy.id,
          reason: policy.message ?? policy.description,
        };
      }
    }
    if (policy.condition === "dual_evidence") {
      const isAscension =
        timelineId === "mythar_ascension" ||
        intent.kind === "mythar_ascension" ||
        intent.type === "mythar_ascension";
      if (isAscension) {
        const required =
          Array.isArray(policy.require) && policy.require.length
            ? policy.require
            : ["ev-ascension-001", "ev-ascension-002"];
        const ids = collectEvidenceIds(evidence);
        const missing = required.filter((r) => !ids.has(r));
        if (missing.length) {
          violations.push(policy.id);
          requirements.push(...missing.map((m) => `evidence:${m}`));
        }
      }
    }

    // CKL Amendment VII — biometric → adaptive-scale → organic-variance
    // Opt-in via evidence.biometricAmendment / enforceAmendmentVII (Drive-G-1).
    if (
      policy.condition === "biometric_amendment_vii" &&
      Object.values(AMENDMENT_VII_POLICY_IDS).includes(policy.id)
    ) {
      const gate = evaluateAmendmentVIIPolicy(policy.id, intent, evidence);
      if (gate.applies && !gate.ok) {
        violations.push(policy.id);
        if (!haltCode && gate.haltCode) {
          haltCode = gate.haltCode;
          auditReceipt = gate.auditReceipt ?? null;
        }
        if (Array.isArray(gate.issues)) {
          for (const issue of gate.issues) {
            requirements.push(`amendment-vii:${issue}`);
          }
        }
      }
    }

    // World-profile → CKL (partial). Opt-in via worldProfileAmendment /
    // enforceWorldProfile. Necessary for world objects; not sufficient for
    // Lemonade plates or CIS SCAL.
    if (
      policy.condition === "world_profile_ckl" &&
      WORLD_PROFILE_ORDER.includes(policy.id)
    ) {
      const gate = evaluateWorldProfilePolicy(policy.id, intent, evidence);
      if (gate.applies && !gate.ok) {
        violations.push(policy.id);
        if (!haltCode && gate.haltCode) {
          haltCode = gate.haltCode;
          auditReceipt = gate.auditReceipt ?? null;
        }
        if (Array.isArray(gate.issues)) {
          for (const issue of gate.issues) {
            requirements.push(`world-profile:${issue}`);
          }
        }
      }
    }
  }

  // Drift from precedents: if recent denials for same type, slow cinematic
  const recentDenials = precedents.filter((p) => p.decision === false || p.decision === "deny").length;
  if (recentDenials >= 2 && intent.params) {
    paramAdjust = {
      ...(paramAdjust || {}),
      speedFactor: 0.75,
      reason: "high_drift_precedent",
    };
  }

  if (violations.length) {
    return {
      ok: false,
      verdict: haltCode ? "halt" : "deny",
      reason: haltCode
        ? `Constitutional halt: ${haltCode}`
        : "Constitutional policy violation",
      violations,
      requirements,
      attachProvenance,
      paramAdjust,
      haltCode: haltCode ?? null,
      auditReceipt: auditReceipt ?? null,
    };
  }

  return {
    ok: true,
    verdict: "allow",
    reason: "Policies satisfied",
    violations: [],
    requirements,
    attachProvenance,
    paramAdjust,
    haltCode: null,
    auditReceipt: null,
    decisionId: `decision-${intent.id}`,
  };
}

function collectEvidenceIds(evidence) {
  const ids = new Set();
  if (!evidence) return ids;
  if (evidence.id) ids.add(evidence.id);
  if (Array.isArray(evidence.evidenceIds)) {
    for (const id of evidence.evidenceIds) ids.add(id);
  }
  if (Array.isArray(evidence.items)) {
    for (const item of evidence.items) {
      if (item?.id) ids.add(item.id);
    }
  }
  return ids;
}

/** Supports: intent.timeline == 'x' && drift_score > 0.7 */
function evalTimelineCondition(condition, { timelineId, driftScore }) {
  const parts = condition.split("&&").map((s) => s.trim());
  for (const part of parts) {
    const eq = part.match(/^intent\.timeline\s*==\s*'([^']*)'$/);
    if (eq) {
      if (timelineId !== eq[1]) return false;
      continue;
    }
    const gt = part.match(/^drift_score\s*>\s*([0-9.]+)$/);
    if (gt) {
      if (!(driftScore > Number(gt[1]))) return false;
      continue;
    }
    return false;
  }
  return true;
}

/** Supports: speed * 0.5 — unknown/unparseable modifiers leave `self` unchanged. */
function evalModifier(modifier, env) {
  const raw = String(modifier ?? "").trim();
  const self = Number(env.self);
  const unchanged = Number.isFinite(self) ? self : NaN;

  const mul = raw.match(/^([\w.]+)\s*\*\s*([0-9.]+)$/);
  if (mul) {
    const key = mul[1];
    if (!Object.prototype.hasOwnProperty.call(env, key)) {
      if (Number.isFinite(unchanged)) return unchanged;
      throw new Error(`evalModifier: unknown variable '${key}' in '${raw}'`);
    }
    const base = Number(env[key]);
    if (!Number.isFinite(base)) {
      if (Number.isFinite(unchanged)) return unchanged;
      throw new Error(`evalModifier: non-numeric '${key}' in '${raw}'`);
    }
    return base * Number(mul[2]);
  }
  if (Object.prototype.hasOwnProperty.call(env, raw)) {
    const direct = Number(env[raw]);
    if (Number.isFinite(direct)) return direct;
    if (Number.isFinite(unchanged)) return unchanged;
    throw new Error(`evalModifier: non-numeric env['${raw}']`);
  }
  if (Number.isFinite(unchanged)) return unchanged;
  throw new Error(`evalModifier: unparseable modifier '${raw}'`);
}
