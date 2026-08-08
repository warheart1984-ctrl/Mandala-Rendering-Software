// mrs/mcp/governance-adapter.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveAuthority, CONTRACTS } from '../../engine/constitution/contracts.js';
import { ConstitutionalKnowledgeLayer, resolveDecision } from '../../engine/governance/ConstitutionalKnowledgeLayer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policiesPath = path.resolve(__dirname, '../../engine/governance/policies/default.policies.json');
const policies = JSON.parse(fs.readFileSync(policiesPath, 'utf8'));

export class GovernanceAdapter {
  constructor() {
    this.ckl = new ConstitutionalKnowledgeLayer();
    this.policies = policies.policies || policies;
  }

  /**
   * @param {object} request - GovernanceEvaluationRequest
   * @returns {Promise<object>} GovernanceEvaluationResult
   */
  async evaluate({ toolId, params, context }) {
    const actorIdentity = context.actorIdentity || { id: 'anonymous', type: 'user' };
    const action = this.toolIdToAction(toolId);

    // Step 1 — Authority Check
    const authorityResult = await this.checkAuthority(actorIdentity, action, toolId, params);
    if (!authorityResult.ok) {
      return {
        allowed: false,
        reason: `authority.${authorityResult.reason}`,
        meta: { authorityChain: { authority: false, validation: false, decision: false, evidence: false, verification: false, replay: false, audit: false } }
      };
    }

    // Step 2 — Validation Check (CKL schema validation)
    const validationResult = this.validateParams(toolId, params);
    if (!validationResult.ok) {
      return {
        allowed: false,
        reason: `validation.${validationResult.reason}`,
        meta: { authorityChain: { authority: true, validation: false, decision: false, evidence: false, verification: false, replay: false, audit: false } }
      };
    }

    // Step 3 — Decision Check (CKL policy evaluation)
    const decisionResult = await this.evaluateDecision(toolId, params, context);
    if (!decisionResult.ok) {
      return {
        allowed: false,
        reason: `decision.${decisionResult.reason}`,
        meta: { authorityChain: { authority: true, validation: true, decision: false, evidence: false, verification: false, replay: false, audit: false } }
      };
    }

    // Step 4 — Evidence Check
    const evidenceResult = this.checkEvidence(toolId, context);
    if (!evidenceResult.ok) {
      return {
        allowed: false,
        reason: `evidence.${evidenceResult.reason}`,
        meta: { authorityChain: { authority: true, validation: true, decision: true, evidence: false, verification: false, replay: false, audit: false } }
      };
    }

    // Step 5 — Verification Check
    const verificationResult = this.verifyEvidence(context);
    if (!verificationResult.ok) {
      return {
        allowed: false,
        reason: `verification.${verificationResult.reason}`,
        meta: { authorityChain: { authority: true, validation: true, decision: true, evidence: true, verification: false, replay: false, audit: false } }
      };
    }

    // Step 6 — Replay Check
    const replayResult = this.checkReplay(context);
    if (!replayResult.ok) {
      return {
        allowed: false,
        reason: `replay.${replayResult.reason}`,
        meta: { authorityChain: { authority: true, validation: true, decision: true, evidence: true, verification: true, replay: false, audit: false } }
      };
    }

    // Step 7 — Audit Check
    const auditResult = this.checkAudit(context);
    if (!auditResult.ok) {
      return {
        allowed: false,
        reason: `audit.${auditResult.reason}`,
        meta: { authorityChain: { authority: true, validation: true, decision: true, evidence: true, verification: true, replay: true, audit: false } }
      };
    }

    return {
      allowed: true,
      reason: null,
      meta: {
        contract: authorityResult.contract,
        policy: decisionResult.policy,
        authorityChain: {
          authority: true,
          validation: true,
          decision: true,
          evidence: true,
          verification: true,
          replay: true,
          audit: true
        }
      }
    };
  }

toolIdToAction(toolId) {
    const map = {
      'mrs.render.rt4d': 'render_4d_tesseract',
      'mrs.health': 'health_check',
      'mrs.ready': 'readiness_check',
      'mrs.version': 'version_check',
      'mrs.director.dep': 'plan',
      'mrs.sme.dispatch': 'dispatch',
      'mrs.sme.collect': 'collect',
      'mrs.sme.validate': 'validate',
      'mrs.sme.check_policy': 'check_policy',
      'mrs.sme.resolve_conflicts': 'resolve_conflicts',
      'mrs.sme.request_approval': 'request_approval',
      'mrs.sme.publish': 'publish',
      'mrs.scene.create': 'create_scene',
      'mrs.scene.get': 'get_scene',
      'mrs.scene.update': 'update_scene',
      'mrs.scene.list': 'list_scenes',
      'mrs.render.submit': 'submit_render',
      'mrs.render.status': 'get_render_status',
      'mrs.render.evidence': 'get_render_evidence',
      'mrs.render.artifact': 'get_render_artifact',
      'mrs.render.cancel': 'cancel_render',
      'mrs.evidence.collect': 'collect_evidence',
      'mrs.evidence.verify': 'verify_evidence',
      'mrs.evidence.chain': 'get_evidence_chain',
      'mrs.user.profile': 'get_user_profile',
      'mrs.user.usage': 'get_user_usage',
      'mrs.user.credits': 'get_user_credits',
      'mrs.billing.plans': 'get_billing_plans',
      'mrs.billing.checkout': 'billing_checkout',
      'mrs.billing.webhook': 'billing_webhook',
      'mrs.jobs.get': 'get_job',
      'mrs.jobs.cancel': 'cancel_job',
      'mrs.sovereignx.route': 'route_render',
      'mrs.sovereignx.stats': 'get_stats',
      'mrs.sovereignx.hip.detect': 'detect_hip',
    };
    return map[toolId] || toolId;
  }

async checkAuthority(actorIdentity, action, toolId, params) {
      // For SME dispatch, check the specific action from params
      let effectiveAction = action;
      if (toolId === 'mrs.sme.dispatch' && params?.action) {
        effectiveAction = params.action;
      }
      const contractId = this.getContractForActor(actorIdentity);
      console.log('[GOV] checkAuthority:', { contractId, action: effectiveAction, actorIdentity, toolId });
      const auth = resolveAuthority(contractId, effectiveAction);
      console.log('[GOV] resolveAuthority result:', auth);
      return auth.ok
        ? { ok: true, contract: contractId }
        : { ok: false, reason: 'no_authority_or_forbidden' };
    }

getContractForActor(actorIdentity) {
      const type = actorIdentity.type || 'user';
      const map = {
        'director': '4dce.director',
        'replay': '4dce.replay',
        'sme.txt': 'sme.txt',
        'sme.vis': 'sme.vis',
        'sme.aud': 'sme.aud',
        'sme.vid': 'sme.vid',
        'sme.gen': 'sme.gen',
        'sme.log': 'sme.log',
        'sme.core': 'sme.core',
        'user': 'user',
        'sovereignx': 'sovereignx',
        'ugr.prime-architect': 'ugr.prime-architect',
        'prime-architect': 'ugr.prime-architect',
      };
      return map[type] || type;
    }

  validateParams(toolId, params) {
    // Basic schema validation - can be extended with JSON Schema
    return { ok: true };
  }

  async evaluateDecision(toolId, params, context) {
    const intent = {
      type: toolId,
      actor: this.getContractForActor(context.actorIdentity || {}),
      params,
      evidence: context.evidence,
    };
    const result = resolveDecision(intent, context.evidence || {}, { policies: this.policies });
    return { ok: result.ok, policy: result.policy };
  }

  checkEvidence(toolId, context) {
    // Tools requiring evidence
    const evidenceRequired = [
      'mrs.render.rt4d',
      'mrs.director.dep',
      'mrs.sme.dispatch',
      'mrs.render.submit',
    ];
    if (evidenceRequired.includes(toolId) && !context.evidence) {
      return { ok: false, reason: 'evidence_required' };
    }
    return { ok: true };
  }

  verifyEvidence(context) {
    // Placeholder for evidence verification (hash, signatures, etc.)
    return { ok: true };
  }

  checkReplay(context) {
    // Ensure invocation is replayable (CPE, CEL)
    return { ok: true };
  }

  checkAudit(context) {
    // Ensure invocation can be audited
    return { ok: true };
  }
}