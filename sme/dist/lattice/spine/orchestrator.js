/**
 * Constitutional Orchestrator — the "Runtime Gate" connecting the constitutional spine.
 *
 * Flow:
 *   Input Intent -> [MRI Measurement] -> [CEN Evaluation] -> [Lirl Law-Gate] -> [Durable Ledger] -> Dispatch
 *
 * Ported from @sovereign-x/constitutional-compute (src/constitutional-orchestrator.js) to CJS.
 */

const { runMRI } = require('./mri');
const { ConstitutionalEnforcementNode } = require('./cen');
const { LirlLawGate } = require('./lirl');
const { DurableContinuityLedger } = require('./ledger');

const DEFAULT_MRI_PROVIDER = (intent) => ({
  continuityInputs: {
    singlePointsOfFailure: 1, criticalRoles: 10, documentedKnowledge: 8,
    totalRequiredKnowledge: 10, clearGovernanceElements: 8,
    totalGovernanceElements: 10, medianDecisionTime: 2,
    expectedDecisionTime: 10, coordinationLoad: 4, coordinationCapacity: 10,
  },
  governanceInputs: { authorityClarity: 80, escalationClarity: 78, roleDefinitionQuality: 82, decisionTransparency: 76 },
  memoryInputs: { documentationCoverage: 80, artifactAccessibility: 78, successionReadiness: 72 },
  confidenceInputs: { observationCompleteness: 0.9, dataQuality: 0.85, sourceReliability: 0.9, temporalFreshness: 0.8 },
});

class ConstitutionalOrchestrator {
  constructor(opts = {}) {
    this.cen = opts.cen || new ConstitutionalEnforcementNode();
    this.lawGate = opts.lawGate || new LirlLawGate();
    this.ledger = opts.ledger || new DurableContinuityLedger({ inMemory: true });
    this.mriProvider = opts.mriProvider || DEFAULT_MRI_PROVIDER;
    this.cenInvariants = opts.cenInvariants || [];
  }

  /**
   * Measure current MRI snapshot from the provider.
   * @param {object} intent
   * @returns {object} snapshot { continuity, governance, memory, coordination, confidence }
   */
  measure(intent) {
    const measurement = this.mriProvider(intent);
    const mriResult = runMRI(measurement);
    return {
      continuity: mriResult.scores.continuity,
      governance: mriResult.scores.governance,
      memory: mriResult.scores.memory,
      coordination: mriResult.state.X,
      confidence: mriResult.scores.confidence,
      full: mriResult,
    };
  }

  /**
   * Executes the full constitutional spine check.
   * @param {object} intent - { id, action, arena, actorId, authoritySignature, ccr, params }
   * @returns {Promise<{ allowed, reason?, receipt?, verdict?, event?, mri }>}
   */
  async evaluateAndDispatch(intent, invariants = this.cenInvariants) {
    const mri = this.measure(intent);
    const snapshot = {
      continuity: mri.continuity,
      governance: mri.governance,
      memory: mri.memory,
      coordination: mri.coordination,
      confidence: mri.confidence,
    };

    const transition = {
      transitionId: `${intent.id}-cen`,
      transitionType: 'enforcement-check',
      requestedCapabilities: ['constitutional.verify'],
      context: {
        actor: intent.authorityId || intent.actorId || 'system',
        runtimeContext: { capabilities: ['constitutional.verify'] },
        mriSnapshot: snapshot,
      },
      payload: snapshot,
      authorityToken: intent.authorityToken ?? null,
    };

    const enforcement = this.cen.execute(transition);
    if (enforcement.decision.verdict === 'DENY') {
      return {
        allowed: false,
        reason: `CEN Deny: ${enforcement.decision.reasonDetail}`,
        receipt: enforcement.receipt,
        stage: 'cen',
        mri,
      };
    }

    const verdict = await this.lawGate.evaluate({
      id: intent.id,
      actorId: intent.actorId || intent.authorityId || 'system',
      action: intent.action,
      payload: intent.params ?? intent.payload ?? {},
      forceBypass: intent.forceBypass,
    });
    if (verdict.verdict === 'REJECT') {
      return {
        allowed: false,
        reason: `Lirl Deny: ${verdict.reasons.join(', ')}`,
        receipt: enforcement.receipt,
        verdict,
        stage: 'lirl',
        mri,
      };
    }

    const event = this.ledger.append({
      authoritySignature: intent.authoritySignature,
      dispatch: { intentId: intent.id, action: intent.action, arena: intent.arena },
      validation: {
        cen: enforcement.decision.verdict === 'ALLOW',
        lirl: verdict.verdict === 'ACCEPT',
        mriSnapshot: snapshot,
      },
      parentId: intent.ccr?.continuityParentId ?? null,
      status: 'committed',
      receipt: enforcement.receipt,
    });

    return {
      allowed: true,
      receipt: enforcement.receipt,
      verdict,
      event,
      stage: 'dispatch',
      mri,
    };
  }
}

module.exports = {
  ConstitutionalOrchestrator,
  DEFAULT_MRI_PROVIDER,
};
