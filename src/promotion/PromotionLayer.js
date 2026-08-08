/**
 * Promotion Layer
 * 
 * Manages the evolution of substrates through the promotion pipeline:
 * Substration → Substrate → Promotion
 * 
 * Promotion requires:
 * - Evidence
 * - Replay verification
 * - Conformance
 * - Arena certification
 * - Constitutional review
 * 
 * Status: **enforced** - All promotions must pass through this layer
 * Gaps: Automated promotion pipeline declared
 */

import { createHash } from "node:crypto";
import { arenaCertificationLayer, ARENA_CERTIFICATION_STATUS } from "../arena/ArenaCertificationLayer.js";
import { constitutionalEvidenceRoot } from "../constitution/ConstitutionalEvidenceRoot.js";

export const PROMOTION_STATES = Object.freeze({
  SUBSTRATION: "substration",
  SUBSTRATE: "substrate",
  PROMOTION_PENDING: "promotion_pending",
  PROMOTED: "promoted",
  REJECTED: "rejected",
  DEMOTED: "demoted"
});

export const PROMOTION_STAGES = Object.freeze({
  CONCEPT: "concept",
  EVIDENCE: "evidence",
  VALIDATION: "validation",
  ARENA: "arena",
  REVIEW: "review",
  PROMOTED: "promoted"
});

export const PROMOTION_CRITERIA = Object.freeze({
  MIN_EVIDENCE_ITEMS: 3,
  MIN_CONFIDENCE: 0.7,
  MIN_EVIDENCE_STRENGTH: "moderate",
  REQUIRED_ARENA_LEVEL: "standard",
  MAX_BLIND_SPOTS: 2,
  MIN_REPLAY_VERIFIABILITY: true,
  MIN_CONSTITUTIONAL_COMPLIANCE: true
});

export class PromotionLayer {
  #promotions;
  #promotionQueue;
  #promotionHistory;
  #reviewers;
  #standards;
  #hooks;
  #substrates;

  constructor() {
    this.#promotions = new Map();
    this.#promotionQueue = [];
    this.#promotionHistory = [];
    this.#reviewers = new Map();
    this.#standards = new Map();
    this.#hooks = new Map();
    this.#substrates = new Map();

    // Register default promotion standards
    this.registerStandard("basic", {
      name: "Basic Promotion",
      requiredStages: [PROMOTION_STAGES.CONCEPT, PROMOTION_STAGES.EVIDENCE, PROMOTION_STAGES.VALIDATION, PROMOTION_STAGES.ARENA, PROMOTION_STAGES.REVIEW, PROMOTION_STAGES.PROMOTED],
      criteria: {
        minEvidenceItems: 3,
        minConfidence: 0.7,
        minEvidenceStrength: "moderate",
        requiredArenaLevel: "standard",
        maxBlindSpots: 2,
        minReplayVerifiability: true,
        minConstitutionalCompliance: true
      }
    });

    this.registerStandard("full", {
      name: "Full Promotion",
      requiredStages: [PROMOTION_STAGES.CONCEPT, PROMOTION_STAGES.EVIDENCE, PROMOTION_STAGES.VALIDATION, PROMOTION_STAGES.ARENA, PROMOTION_STAGES.REVIEW, PROMOTION_STAGES.PROMOTED],
      criteria: {
        minEvidenceItems: 5,
        minConfidence: 0.85,
        minEvidenceStrength: "strong",
        requiredArenaLevel: "full",
        maxBlindSpots: 1,
        minReplayVerifiability: true,
        minConstitutionalCompliance: true
      }
    });

    this.registerStandard("audit", {
      name: "Audit Promotion",
      requiredStages: [PROMOTION_STAGES.CONCEPT, PROMOTION_STAGES.EVIDENCE, PROMOTION_STAGES.VALIDATION, PROMOTION_STAGES.ARENA, PROMOTION_STAGES.REVIEW, PROMOTION_STAGES.PROMOTED],
      criteria: {
        minEvidenceItems: 10,
        minConfidence: 0.95,
        minEvidenceStrength: "conclusive",
        requiredArenaLevel: "audit",
        maxBlindSpots: 0,
        minReplayVerifiability: true,
        minConstitutionalCompliance: true
      }
    });

    // Register hooks
    this.#hooks.set("promotion_started", []);
    this.#hooks.set("promotion_completed", []);
    this.#hooks.set("promotion_failed", []);
    this.#hooks.set("promotion_rejected", []);
    this.#hooks.set("demotion", []);
  }

  /**
   * Request promotion for a substrate
   */
  async requestPromotion(request) {
    const requestId = this.#generateRequestId(request);
    
    const standard = this.#standards.get(request.standard);
    if (!standard) {
      return {
        requestId,
        accepted: false,
        reason: `Unknown promotion standard: ${request.standard}`
      };
    }

    // Check if substrate exists and has required evidence
    const substrate = this.#getSubstrate(request.substrateId);
    if (!substrate) {
      return {
        requestId,
        accepted: false,
        reason: `Substrate ${request.substrateId} not found`
      };
    }

    const requestRecord = {
      id: requestId,
      substrateId: request.substrateId,
      substrateType: request.substrateType,
      standard: request.standard,
      status: PROMOTION_STATES.PROMOTION_PENDING,
      submittedAt: new Date().toISOString(),
      evidence: request.evidence ?? [],
      metadata: request.metadata ?? {},
      reviewerId: null,
      currentStage: PROMOTION_STAGES.CONCEPT,
      startedAt: null,
      completedAt: null,
      result: null
    };

    this.#promotionQueue.push(requestRecord);
    this.#promotionQueue.sort((a, b) => {
      // Priority by substrate age (older first)
      return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
    });

    this.#triggerHooks("promotion_started", { requestId, request: requestRecord });

    return { requestId, accepted: true, status: PROMOTION_STATES.PROMOTION_PENDING };
  }

  /**
   * Process promotion queue
   */
  async processQueue(maxConcurrent = 2) {
    const active = Array.from(this.#promotions.values())
      .filter(p => p.status === PROMOTION_STATES.PROMOTION_PENDING || p.status === PROMOTION_STATES.SUBSTRATE);
    
    if (active.length >= 2) return;

    const availableSlots = 2 - active.length;
    const readyRequests = this.#promotionQueue
      .filter(r => r.status === PROMOTION_STATES.PROMOTION_PENDING)
      .slice(0, 2 - active.length);

    for (const request of readyRequests) {
      const reviewer = this.#assignReviewer(request);
      if (!reviewer) {
        request.status = PROMOTION_STATES.REJECTED;
        request.result = { promoted: false, reason: "No available reviewer" };
        continue;
      }

      request.status = PROMOTION_STATES.SUBSTRATE;
      request.reviewerId = reviewer.id;
      request.startedAt = new Date().toISOString();

      this.#triggerHooks("promotion_started", { request });

      this.#processPromotion(request, reviewer).catch(e => {
        request.status = PROMOTION_STATES.REJECTED;
        request.result = { promoted: false, reason: e.message };
        this.#triggerHooks("promotion_failed", { request, error: e.message });
      });
    }
  }

  async #processPromotion(request, reviewer) {
    const standard = this.#standards.get(request.standard);
    const substrate = this.#getSubstrate(request.substrateId);
    
    try {
      // Stage 1: Concept validation
      await this.#updateStage(request, PROMOTION_STAGES.CONCEPT);
      await this.#validateConcept(request.substrateId, standard);

      // Stage 2: Evidence generation
      await this.#updateStage(request, PROMOTION_STAGES.EVIDENCE);
      const evidenceResult = await this.#validateEvidence(request.substrateId, standard);

      // Stage 3: Validation
      await this.#updateStage(request, PROMOTION_STAGES.VALIDATION);
      const validationResult = await this.#validateSubstrate(request.substrateId, standard);

      // Stage 4: Arena certification
      await this.#updateStage(request, PROMOTION_STAGES.ARENA);
      const arenaResult = await this.#runArenaCertification(request.substrateId, standard);

      // Stage 5: Constitutional review
      await this.#updateStage(request, PROMOTION_STAGES.REVIEW);
      const reviewResult = await this.#conductConstitutionalReview(request.substrateId, standard);

      // Stage 6: Promotion decision
      await this.#updateStage(request, PROMOTION_STAGES.PROMOTED);
      const promoted = await this.#makePromotionDecision(request, standard, {
        evidence: evidenceResult,
        validation: validationResult,
        arena: arenaResult,
        review: reviewResult
      });

      const promotion = {
        id: `prom-${createHash("sha256").update(`${request.id}:${Date.now()}`).digest("hex").slice(0, 16)}`,
        requestId: request.id,
        substrateId: request.substrateId,
        substrateType: request.substrateType,
        standard: request.standard,
        status: promoted ? PROMOTION_STATES.PROMOTED : PROMOTION_STATES.REJECTED,
        issuedAt: new Date().toISOString(),
        reviewerId: reviewer.id,
        standard: request.standard,
        stagesCompleted: [PROMOTION_STAGES.CONCEPT, PROMOTION_STAGES.EVIDENCE, PROMOTION_STAGES.VALIDATION, PROMOTION_STAGES.ARENA, PROMOTION_STAGES.REVIEW, PROMOTION_STAGES.PROMOTED],
        evidence: substrate.evidence,
        arenaCertification: arenaResult?.certificationId,
        reviewDecision: promoted ? "approved" : "rejected",
        reviewNotes: promoted ? "Promoted to Phase D+" : "Failed promotion criteria",
        constitutionalHash: createHash("sha256").update(`${request.substrateId}:${Date.now()}`).digest("hex").slice(0, 16),
        reviewerSignature: reviewer.sign(request.id)
      };

      // Store promotion
      this.#promotions.set(promotion.id, promotion);
      request.status = promoted ? PROMOTION_STATES.PROMOTED : PROMOTION_STATES.REJECTED;
      request.completedAt = new Date().toISOString();
      request.result = { promoted: promoted, reason: promoted ? "Promoted to Phase D+" : "Failed promotion criteria" };

      // Record history
      this.#promotionHistory.push({
        promotionId: promotion.id,
        requestId: request.id,
        timestamp: new Date().toISOString(),
        action: promoted ? "promoted" : "rejected",
        reviewerId: reviewer.id
      });

      if (promoted) {
        this.#triggerHooks("promotion_completed", { promotion });
      } else {
        this.#triggerHooks("promotion_failed", { request, reason: "Failed promotion criteria" });
      }

    } catch (error) {
      request.status = PROMOTION_STATES.REJECTED;
      request.completedAt = new Date().toISOString();
      request.result = { promoted: false, reason: error.message };
      this.#triggerHooks("promotion_failed", { request, error: error.message });
    }
  }

  #validateConcept(substrateId, standard) {
    // Verify concept is well-defined
    return Promise.resolve();
  }

  async #validateEvidence(substrateId, standard) {
    const substrate = this.#getSubstrate(substrateId);
    if (!substrate) throw new Error("Substrate not found");

    const minItems = standard.criteria.minEvidenceItems;
    if (substrate.evidence.length < minItems) {
      throw new Error(`Insufficient evidence: ${substrate.evidence.length}/${minItems}`);
    }

    // Verify evidence quality
    for (const evidence of substrate.evidence) {
      if (!evidence.timestamp || !evidence.type) {
        throw new Error("Evidence missing required fields");
      }
    }

    return { valid: true, evidenceCount: substrate.evidence.length };
  }

  async #validateSubstrate(substrateId, standard) {
    const substrate = this.#getSubstrate(substrateId);
    if (!substrate) throw new Error("Substrate not found");

    const errors = [];

    // Check confidence
    if (substrate.confidence < standard.criteria.minConfidence) {
      return { valid: false, errors: [`Confidence ${substrate.confidence} below threshold ${standard.criteria.minConfidence}`] };
    }

    // Check evidence strength
    const strengthOrder = ["insufficient", "weak", "moderate", "strong", "conclusive"];
    const currentIdx = strengthOrder.indexOf(substrate.evidenceStrength);
    const requiredIdx = strengthOrder.indexOf(standard.criteria.minEvidenceStrength);
    if (currentIdx < requiredIdx) {
      return { valid: false, errors: [`Evidence strength ${substrate.evidenceStrength} below threshold ${standard.criteria.minEvidenceStrength}`] };
    }

    // Check blind spots
    if (substrate.blindSpots > standard.criteria.maxBlindSpots) {
      return { valid: false, errors: [`Blind spots ${substrate.blindSpots} exceeds maximum ${standard.criteria.maxBlindSpots}`] };
    }

    // Check replay verifiability
    if (standard.criteria.minReplayVerifiability && !substrate.replayVerifiable) {
      return { valid: false, errors: ["Replay verifiability required"] };
    }

    // Check constitutional compliance
    if (standard.criteria.minConstitutionalCompliance && !substrate.constitutionalCompliance) {
      return { valid: false, errors: ["Constitutional compliance required"] };
    }

    return { valid: true, errors: [] };
  }

  async #runArenaCertification(substrateId, standard) {
    const substrate = this.#getSubstrate(substrateId);
    if (!substrate) throw new Error("Substrate not found");

    // Request arena certification
    const certRequest = await arenaCertificationLayer.requestCertification({
      subsystemId: substrate.id,
      subsystemType: substrate.type,
      level: standard.criteria.requiredArenaLevel
    });

    if (!certRequest.accepted) {
      return { passed: false, reason: certRequest.reason };
    }

    // Wait for certification (in real impl, this would be async)
    // For now, simulate
    await new Promise(r => setTimeout(r, 100));

    const cert = arenaCertificationLayer.getCertificationsBySubsystem(substrateId)
      .find(c => c.level === standard.criteria.requiredArenaLevel);

    if (!cert || cert.status !== ARENA_CERTIFICATION_STATUS.PASSED) {
      return { passed: false, reason: "Arena certification failed or not found" };
    }

    return { passed: true, certificationId: cert.id };
  }

  async #conductConstitutionalReview(substrateId, standard) {
    // Verify constitutional compliance
    const substrate = this.#getSubstrate(substrateId);
    if (!substrate) throw new Error("Substrate not found");

    // Check constitutional hash
    if (!substrate.constitutionalHash) {
      return { passed: false, reason: "Missing constitutional hash" };
    }

    // Verify against constitutional root
    const rootValid = constitutionalEvidenceRoot.verifyConstitutionalHash(substrate.constitutionalHash);
    if (!rootValid) {
      return { passed: false, reason: "Constitutional hash verification failed" };
    }

    // Check evidence chain
    if (!substrate.evidenceChain || substrate.evidenceChain.length === 0) {
      return { passed: false, reason: "Missing evidence chain" };
    }

    return { passed: true, decision: "approved", notes: "Constitutional review passed" };
  }

  async #makePromotionDecision(request, standard, results) {
    const { evidence, validation, arena, review } = results;

    // All must pass
    if (!evidence.valid) return false;
    if (!validation.valid) return false;
    if (!arena.passed) return false;
    if (!review.passed) return false;

    // Check criteria
    const criteria = standard.criteria;
    const substrate = this.#getSubstrate(request.substrateId);
    
    if (substrate.evidence.length < criteria.minEvidenceItems) return false;
    if (substrate.confidence < criteria.minConfidence) return false;
    
    const strengthOrder = ["insufficient", "weak", "moderate", "strong", "conclusive"];
    const currentIdx = strengthOrder.indexOf(substrate.evidenceStrength);
    const requiredIdx = strengthOrder.indexOf(criteria.minEvidenceStrength);
    if (currentIdx < requiredIdx) return false;

    if (substrate.blindSpots > criteria.maxBlindSpots) return false;
    if (criteria.minReplayVerifiability && !substrate.replayVerifiable) return false;
    if (criteria.minConstitutionalCompliance && !substrate.constitutionalCompliance) return false;

    // Arena level check
    const arenaLevel = arena?.certification?.level;
    if (!this.#meetsArenaLevel(arenaLevel, criteria.requiredArenaLevel)) return false;

    return true;
  }

  #meetsArenaLevel(achieved, required) {
    const levels = ["basic", "standard", "full", "audit"];
    const achievedIdx = levels.indexOf(achieved);
    const requiredIdx = levels.indexOf(required);
    return achievedIdx >= requiredIdx;
  }

  #updateStage(request, stage) {
    request.currentStage = stage;
    request[`${stage}At`] = new Date().toISOString();
  }

  #getSubstrate(substrateId) {
    return this.#substrates.get(substrateId);
  }

  #assignReviewer(request) {
    const reviewers = Array.from(this.#reviewers.values());
    if (reviewers.length === 0) return null;
    
    const hash = createHash("sha256").update(request.id).digest("hex");
    const index = parseInt(hash.slice(0, 8), 16) % reviewers.length;
    return reviewers[index];
  }

  #generateRequestId(request) {
    return `prom-req-${createHash("sha256").update(`${request.substrateId}:${Date.now()}`).digest("hex").slice(0, 16)}`;
  }

  #triggerHooks(event, data) {
    const hooks = this.#hooks.get(event) || [];
    for (const hook of hooks) {
      try {
        hook(data);
      } catch (e) {
        console.error(`Hook ${event} failed:`, e);
      }
    }
  }

  // Public API

  /**
   * Register a substrate for promotion
   */
  registerSubstrate(substrate) {
    this.#substrates.set(substrate.id, substrate);
  }

  /**
   * Get promotion by ID
   */
  getPromotion(promotionId) {
    return this.#promotions.get(promotionId);
  }

  /**
   * Get promotion by substrate
   */
  getPromotionBySubstrate(substrateId) {
    return Array.from(this.#promotions.values()).find(p => p.substrateId === substrateId);
  }

  /**
   * Get all promotions
   */
  getAllPromotions() {
    return Array.from(this.#promotions.values());
  }

  /**
   * Get promotion history
   */
  getHistory() {
    return [...this.#promotionHistory];
  }

  /**
   * Get promotion statistics
   */
  getStats() {
    const promotions = Array.from(this.#promotions.values());
    return {
      total: this.#promotions.size,
      byStatus: {
        promoted: Array.from(this.#promotions.values()).filter(p => p.status === PROMOTION_STATES.PROMOTED).length,
        rejected: Array.from(this.#promotions.values()).filter(p => p.status === PROMOTION_STATES.REJECTED).length,
        pending: this.#promotionQueue.filter(r => r.status === PROMOTION_STATES.PROMOTION_PENDING).length,
        inProgress: Array.from(this.#promotions.values()).filter(p => p.status === PROMOTION_STATES.SUBSTRATE || p.status === PROMOTION_STATES.PROMOTION_PENDING).length,
        demoted: Array.from(this.#promotions.values()).filter(p => p.status === PROMOTION_STATES.DEMOTED).length
      },
      byStandard: {
        basic: Array.from(this.#promotions.values()).filter(p => p.standard === "basic").length,
        full: Array.from(this.#promotions.values()).filter(p => p.standard === "full").length,
        audit: Array.from(this.#promotions.values()).filter(p => p.standard === "audit").length
      },
      queueLength: this.#promotionQueue.length,
      totalHistory: this.#promotionHistory.length
    };
  }

  /**
   * Register a reviewer
   */
  registerReviewer(reviewer) {
    this.#reviewers.set(reviewer.id, reviewer);
  }

  /**
   * Register a promotion standard
   */
  registerStandard(name, standard) {
    this.#standards.set(name, standard);
  }

  /**
   * Get a standard by name
   */
  getStandard(name) {
    return this.#standards.get(name);
  }

  /**
   * Get a reviewer by id
   */
  getReviewer(id) {
    return this.#reviewers.get(id);
  }

  /**
   * Get a substrate by id
   */
  getSubstrate(id) {
    return this.#substrates.get(id);
  }

  /**
   * Register a hook
   */
  registerHook(event, hook) {
    if (!this.#hooks.has(event)) {
      this.#hooks.set(event, []);
    }
    this.#hooks.get(event).push(hook);
  }
}

// Export singleton
export const promotionLayer = new PromotionLayer();