/**
 * Constitutional Knowledge Layer (CKL) — policies + precedents.
 * Status: enforced for policy evaluation; precedents grow from decisions.
 */

import { CONTRACTS, resolveAuthority } from "../constitution/contracts.js";
import { nowIso } from "../runtime/types.js";

export class ConstitutionalKnowledgeLayer {
  /**
   * @param {object[]} policies
   */
  constructor(policies = []) {
    this.policies = policies.slice();
    this.precedents = [];
  }

  static async loadDefault(fetchImpl = fetch) {
    const base = typeof import.meta?.url === "string"
      ? new URL(".", import.meta.url).href
      : "file:///" + process.cwd().replace(/\\/g, "/") + "/";
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
          const hasContract = Object.values(CONTRACTS).some(
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
            [policy.param]: current,
            speed: current,
          });
          paramAdjust = {
            ...(paramAdjust || {}),
            [policy.param]: modified,
            policy: policy.id,
            reason: policy.message,
          };
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
      verdict: "deny",
      reason: "Constitutional policy violation",
      violations,
      requirements,
      attachProvenance,
      paramAdjust,
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

/** Supports: speed * 0.5 */
function evalModifier(modifier, env) {
  const raw = String(modifier ?? "").trim();
  const mul = raw.match(/^([\w.]+)\s*\*\s*([0-9.]+)$/);
  if (mul) {
    const base = Number(env[mul[1]] ?? 0);
    return base * Number(mul[2]);
  }
  if (Object.prototype.hasOwnProperty.call(env, raw)) {
    return Number(env[raw] ?? 0);
  }
  return Number(env.self ?? 1);
}
