/**
 * Constitutional Reasoning Engine (CRE)
 * 
 * The core reasoning engine for Phase D+ that implements evidence-backed,
 * replay-verifiable, lineage-tracked reasoning with Blind-Spot Zero compliance.
 * 
 * Status: **enforced** - All reasoning must pass through CRE
 * Gaps: Full Blind-Spot Zero compliance declared; Arena certification integration declared
 */

import { createHash } from "node:crypto";
import { constitutionalInferenceContract, REASONING_STATUS } from "../constitution/contracts/ConstitutionalInferenceContract.js";
import { constitutionalContinuityContract, CONTINUITY_VERDICTS } from "../constitution/contracts/ConstitutionalContinuityContract.js";
import { intentLifecycleContract, INTENT_STATES, INTENT_CATEGORIES, INTENT_PRIORITIES } from "../constitution/contracts/IntentLifecycleContract.js";
import { constitutionalEvidenceRoot } from "../constitution/ConstitutionalEvidenceRoot.js";

export const REASONING_MODES = Object.freeze({
  FAST: "fast",           // Quick inference, lower confidence
  DELIBERATE: "deliberate", // Thorough reasoning, high confidence
  CRITICAL: "critical",    // Maximum verification, constitutional review
  AUDIT: "audit"          // Full audit trail required
});

export const REASONING_QUALITIES = Object.freeze({
  RIGOR: "rigor",
  CONSISTENCY: "consistency",
  COMPLETENESS: "completeness",
  COHERENCE: "coherence",
  RELEVANCE: "relevance",
  SOUNDNESS: "soundness"
});

export class ConstitutionalReasoningEngine {
  #inferences;
  #reasoningChains;
  #reasoningQueue;
  #activeReasoning;
  #completedTasks;
  #qualityMetrics;
  #validators;
  #hooks;

  constructor() {
    this.#inferences = constitutionalInferenceContract;
    this.#reasoningChains = new Map();
    this.#reasoningQueue = [];
    this.#activeReasoning = new Map();
    this.#completedTasks = new Map();
    this.#validators = new Map();
    this.#hooks = new Map();
    this.#qualityMetrics = this.#initializeQualityMetrics();

    // Register default quality validators
    this.registerQualityValidator("evidence_coverage", validateEvidenceCoverage);
    this.registerQualityValidator("causal_completeness", validateCausalCompleteness);
    this.registerQualityValidator("dimensional_consistency", validateDimensionalConsistency);
    this.registerQualityValidator("temporal_consistency", validateTemporalConsistency);
    this.registerQualityValidator("constitutional_compliance", validateConstitutionalCompliance);
    this.registerQualityValidator("blind_spot_coverage", validateBlindSpotCoverage);
    this.registerQualityValidator("replay_verifiability", validateReplayVerifiability);

    // Register hooks
    this.#hooks.set("inference_started", []);
    this.#hooks.set("inference_completed", []);
    this.#hooks.set("inference_rejected", []);
    this.#hooks.set("inference_revised", []);
    this.#hooks.set("quality_threshold_breached", []);
    this.#hooks.set("blind_spot_detected", []);
  }

  /**
   * Submit a reasoning task for processing
   */
  async submitReasoningTask(task) {
    const taskId = this.#generateTaskId(task);

    const taskRecord = {
      id: taskId,
      task,
      status: "queued",
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      retries: 0,
      priority: task.priority ?? 0
    };

    this.#reasoningQueue.push(taskRecord);
    this.#reasoningQueue.sort((a, b) => b.priority - a.priority);

    return { taskId, status: "queued" };
  }

  /**
   * Process reasoning queue
   */
  async processQueue(maxConcurrent = 3) {
    const active = Array.from(this.#activeReasoning.values());
    if (active.length >= maxConcurrent) return;

    const availableSlots = maxConcurrent - active.length;
    const readyTasks = this.#reasoningQueue
      .filter(t => t.status === "queued")
      .slice(0, availableSlots);

    for (const taskRecord of readyTasks) {
      taskRecord.status = "processing";
      taskRecord.startedAt = new Date().toISOString();
      this.#activeReasoning.set(taskRecord.id, taskRecord);
      this.#reasoningQueue = this.#reasoningQueue.filter(t => t.id !== taskRecord.id);

      // Process asynchronously
      this.#processReasoningTask(taskRecord).catch(e => {
        taskRecord.status = "failed";
        taskRecord.error = e.message;
        taskRecord.completedAt = new Date().toISOString();
        this.#activeReasoning.delete(taskRecord.id);
        this.#completedTasks.set(taskRecord.id, taskRecord);
      });
    }
  }

  /**
   * Execute a reasoning task
   */
  async #processReasoningTask(taskRecord) {
    const startTime = Date.now();
    const { task } = taskRecord;
    const { mode = REASONING_MODES.DELIBERATE, qualityThresholds } = task;

    let inferenceId = null;

    try {
      // Create inference record
      const inferenceRecord = constitutionalInferenceContract.createInference({
        type: task.type ?? "deductive",
        conclusion: task.conclusion,
        premiseIds: task.premiseIds ?? [],
        evidenceIds: task.evidenceIds ?? [],
        reasoningChain: task.reasoningChain ?? [],
        confidence: task.confidence ?? 0.5,
        evidenceStrength: task.evidenceStrength ?? "moderate"
      });
      inferenceId = inferenceRecord.id;

      this.#triggerHooks("inference_started", { inferenceId, task });

      // Apply reasoning mode
      const validated = await this.#applyReasoningMode(inferenceId, mode, qualityThresholds);

      if (!validated.valid) {
        throw new Error(`Reasoning validation failed: ${validated.errors.join(", ")}`);
      }

      // Run quality validators
      const qualityResult = await this.#runQualityValidators(inferenceId);
      if (!qualityResult.valid) {
        throw new Error(`Quality validation failed: ${qualityResult.errors.join(", ")}`);
      }

      // Check for blind spots
      const blindSpotReport = constitutionalInferenceContract.checkBlindSpots(inferenceId);
      if (blindSpotReport.hasBlindSpots) {
        this.#triggerHooks("blind_spot_detected", { inferenceId, report: blindSpotReport });
      }

      // Verify replay token
      const replayCheck = constitutionalInferenceContract.verifyReplayToken(inferenceId);
      if (!replayCheck.valid) {
        throw new Error(`Replay verification failed: ${replayCheck.reason}`);
      }

      // Verify continuity if applicable
      if (task.requireContinuity) {
        const continuityResult = await this.#verifyContinuity(inferenceId, task.continuitySpec);
        if (!continuityResult.verified) {
          throw new Error(`Continuity verification failed: ${continuityResult.errors.join(", ")}`);
        }
      }

      // Build reasoning chain
      const reasoningChain = this.#buildReasoningChain(inferenceId);

      // Generate constitutional frame record
      const frameRecord = await this.#createConstitutionalFrameRecord({
        inferenceId,
        task,
        reasoningChain,
        qualityMetrics: this.#computeQualityMetrics(inferenceId)
      });

      // Update quality metrics
      this.#updateQualityMetrics(inferenceId, Date.now() - startTime);

      taskRecord.status = "completed";
      taskRecord.completedAt = new Date().toISOString();
      taskRecord.result = {
        inferenceId,
        conclusion: inferenceRecord.conclusion,
        confidence: inferenceRecord.confidence,
        evidenceStrength: inferenceRecord.evidenceStrength,
        reasoningChain: inferenceRecord.reasoningChain,
        replayToken: inferenceRecord.replayToken,
        constitutionalFrame: frameRecord,
        qualityMetrics: this.#getQualityMetrics(inferenceId)
      };

      this.#triggerHooks("inference_completed", { inferenceId, result: taskRecord.result });

    } catch (error) {
      taskRecord.status = "failed";
      taskRecord.error = error.message;
      this.#triggerHooks("inference_rejected", { inferenceId, error: error.message });
      throw error;
    } finally {
      taskRecord.completedAt = new Date().toISOString();
      this.#activeReasoning.delete(taskRecord.id);
      this.#completedTasks.set(taskRecord.id, taskRecord);
    }
  }

  /**
   * Apply reasoning mode with quality thresholds
   */
  async #applyReasoningMode(inferenceId, mode, qualityThresholds) {
    const record = constitutionalInferenceContract.getInference(inferenceId);
    if (!record) {
      return { valid: false, errors: ["Inference not found"] };
    }

    const thresholds = this.#getQualityThresholds(mode, qualityThresholds);
    const errors = [];

    // Check confidence threshold
    if (record.confidence < thresholds.minConfidence) {
      errors.push(`Confidence ${record.confidence} below threshold ${thresholds.minConfidence}`);
    }

    // Check evidence strength
    const strengthOrder = ["conclusive", "strong", "moderate", "weak", "insufficient"];
    const currentStrengthIdx = strengthOrder.indexOf(record.evidenceStrength);
    const requiredStrengthIdx = strengthOrder.indexOf(thresholds.minEvidenceStrength);
    if (currentStrengthIdx > requiredStrengthIdx) {
      errors.push(`Evidence strength ${record.evidenceStrength} below threshold ${thresholds.minEvidenceStrength}`);
    }

    // Check blind spots
    const blindSpotReport = constitutionalInferenceContract.checkBlindSpots(inferenceId);
    if (blindSpotReport.hasBlindSpots && mode !== REASONING_MODES.FAST) {
      return { valid: false, errors: [`Blind spots detected: ${blindSpotReport.blindSpots.join(", ")}`] };
    }

    // Check blind spot threshold
    if (blindSpotReport.blindSpots.length > thresholds.maxBlindSpots) {
      errors.push(`Too many blind spots: ${blindSpotReport.blindSpots.length} > ${thresholds.maxBlindSpots}`);
    }

    // Check replay verifiability
    const replayCheck = constitutionalInferenceContract.verifyReplayToken(inferenceId);
    if (!replayCheck.valid) {
      errors.push(`Replay verification failed: ${replayCheck.reason}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Run quality validators on an inference
   */
  async #runQualityValidators(inferenceId) {
    const record = constitutionalInferenceContract.getInference(inferenceId);
    if (!record) return { valid: false, errors: ["Inference not found"] };

    const errors = [];
    for (const [name, validator] of this.#validators) {
      try {
        const result = await validator(inferenceId);
        if (!result.valid) {
          errors.push(...result.errors.map(e => `${name}: ${e}`));
        }
      } catch (e) {
        errors.push(`${name}: ${e.message}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Verify continuity for an inference
   */
  async #verifyContinuity(inferenceId, continuitySpec) {
    const now = new Date().toISOString();
    const sourceState = continuitySpec?.sourceState ?? { timestamp: now };
    const targetState = continuitySpec?.targetState ?? { timestamp: now };

    const continuityRecord = await constitutionalContinuityContract.registerContinuity({
      type: continuitySpec?.type ?? "temporal",
      sourceState,
      targetState,
      level: "substrate_verified",
      evidence: [],
      causalChain: []
    });

    return constitutionalContinuityContract.verifyContinuity(continuityRecord.id);
  }

  /**
   * Build reasoning chain from inference
   */
  #buildReasoningChain(inferenceId) {
    const chain = [];
    let current = constitutionalInferenceContract.getInference(inferenceId);

    while (current) {
      chain.unshift({
        id: current.id,
        type: current.type,
        conclusion: current.conclusion,
        premiseIds: current.premiseIds,
        evidenceIds: current.evidenceIds,
        reasoningChain: current.reasoningChain,
        confidence: current.confidence,
        evidenceStrength: current.evidenceStrength,
        status: current.status
      });

      if (current.revisedFrom) {
        current = constitutionalInferenceContract.getInference(current.revisedFrom);
      } else if (current.lineage.derivedFrom) {
        current = constitutionalInferenceContract.getInference(current.lineage.derivedFrom);
      } else {
        break;
      }
    }

    return chain;
  }

  /**
   * Create constitutional frame record
   */
  async #createConstitutionalFrameRecord({ inferenceId, task, reasoningChain, qualityMetrics }) {
    const frameId = `frame-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const rootInference = constitutionalInferenceContract.getInference(reasoningChain[0]?.id) ||
                          constitutionalInferenceContract.getInference(inferenceId);

    const frameRecord = {
      id: frameId,
      inferenceId,
      taskId: task.id ?? taskIdToSeed(task),
      createdAt: new Date().toISOString(),
      constitutionalHash: createHash("sha256").update(JSON.stringify({
        inferenceId,
        taskId: task.id,
        reasoningChainHash: createHash("sha256").update(JSON.stringify(reasoningChain)).digest("hex").slice(0, 16),
        qualityMetricsHash: createHash("sha256").update(JSON.stringify(qualityMetrics)).digest("hex").slice(0, 16)
      })).digest("hex"),
      evidenceChain: await this.#buildEvidenceChain(inferenceId),
      reasoningChain: rootInference?.reasoningChain ?? [],
      qualityMetrics,
      replayToken: rootInference?.replayToken ?? null,
      blindSpotCheck: rootInference ? constitutionalInferenceContract.checkBlindSpots(rootInference.id) : null
    };

    return frameRecord;
  }

  /**
   * Build complete evidence chain for an inference
   */
  async #buildEvidenceChain(inferenceId) {
    const chain = [];
    let current = constitutionalInferenceContract.getInference(inferenceId);

    while (current) {
      chain.unshift({
        inferenceId: current.id,
        evidenceIds: current.evidenceIds,
        premiseIds: current.premiseIds,
        conclusion: current.conclusion,
        evidenceStrength: current.evidenceStrength,
        confidence: current.confidence,
        constitutionalHash: current.constitutionalHash,
        replayToken: current.replayToken
      });

      if (current.revisedFrom) {
        current = constitutionalInferenceContract.getInference(current.revisedFrom);
      } else if (current.lineage.derivedFrom) {
        current = constitutionalInferenceContract.getInference(current.lineage.derivedFrom);
      } else {
        break;
      }
    }

    return chain;
  }

  /**
   * Compute quality metrics for an inference
   */
  #computeQualityMetrics(inferenceId) {
    const record = constitutionalInferenceContract.getInference(inferenceId);
    if (!record) return this.#getDefaultQualityMetrics();

    const blindSpotReport = constitutionalInferenceContract.checkBlindSpots(inferenceId);
    const replayCheck = constitutionalInferenceContract.verifyReplayToken(inferenceId);

    return {
      confidence: record.confidence,
      evidenceStrength: record.evidenceStrength,
      evidenceCount: record.evidenceIds.length,
      premiseCount: record.premiseIds.length,
      reasoningChainLength: record.reasoningChain.length,
      blindSpots: blindSpotReport.blindSpots.length,
      blindSpotDetails: blindSpotReport.blindSpots,
      blindSpotRecommendations: blindSpotReport.recommendations,
      replayVerifiable: replayCheck.valid,
      constitutionalCompliance: true,
      constitutionalHash: record.constitutionalHash,
      replayToken: record.replayToken
    };
  }

  #getDefaultQualityMetrics() {
    return {
      confidence: 0,
      evidenceStrength: "insufficient",
      evidenceCount: 0,
      premiseCount: 0,
      reasoningChainLength: 0,
      blindSpots: 0,
      blindSpotDetails: [],
      blindSpotRecommendations: [],
      replayVerifiable: false,
      constitutionalCompliance: false,
      constitutionalHash: "",
      replayToken: null
    };
  }

  #initializeQualityMetrics() {
    return {
      totalInferences: 0,
      validated: 0,
      rejected: 0,
      revised: 0,
      averageConfidence: 0,
      averageEvidenceStrength: 0,
      blindSpotRate: 0,
      averageReasoningTime: 0
    };
  }

  #getQualityThresholds(mode, customThresholds) {
    const defaults = {
      [REASONING_MODES.FAST]: { minConfidence: 0.3, minEvidenceStrength: "weak", maxBlindSpots: 5, requireContinuity: false },
      [REASONING_MODES.DELIBERATE]: { minConfidence: 0.6, minEvidenceStrength: "moderate", maxBlindSpots: 2, requireContinuity: true },
      [REASONING_MODES.CRITICAL]: { minConfidence: 0.85, minEvidenceStrength: "strong", maxBlindSpots: 0, requireContinuity: true },
      [REASONING_MODES.AUDIT]: { minConfidence: 0.95, minEvidenceStrength: "conclusive", maxBlindSpots: 0, requireContinuity: true }
    };

    return { ...defaults[mode], ...customThresholds };
  }

  #updateQualityMetrics(inferenceId, duration) {
    const record = constitutionalInferenceContract.getInference(inferenceId);
    if (!record) return;

    this.#qualityMetrics.totalInferences++;
    if (record.status === REASONING_STATUS.VALIDATED) this.#qualityMetrics.validated++;
    else if (record.status === REASONING_STATUS.REJECTED) this.#qualityMetrics.rejected++;
    else if (record.status === REASONING_STATUS.REVISED) this.#qualityMetrics.revised++;

    // Update running averages
    const n = this.#qualityMetrics.totalInferences;
    this.#qualityMetrics.averageConfidence = ((this.#qualityMetrics.averageConfidence * (n - 1)) + (record.confidence || 0)) / n;
    this.#qualityMetrics.averageReasoningTime = ((this.#qualityMetrics.averageReasoningTime * (n - 1)) + duration) / n;

    // Update blind spot rate
    const blindSpotReport = constitutionalInferenceContract.checkBlindSpots(inferenceId);
    if (blindSpotReport.hasBlindSpots) {
      this.#qualityMetrics.blindSpotRate = (this.#qualityMetrics.blindSpotRate * (this.#qualityMetrics.totalInferences - 1) + 1) / this.#qualityMetrics.totalInferences;
    } else {
      this.#qualityMetrics.blindSpotRate = (this.#qualityMetrics.blindSpotRate * (this.#qualityMetrics.totalInferences - 1)) / this.#qualityMetrics.totalInferences;
    }
  }

  #getQualityMetrics(inferenceId) {
    return this.#computeQualityMetrics(inferenceId);
  }

  #generateTaskId(task) {
    const payload = `${task.type}:${JSON.stringify(task.conclusion)}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    return createHash("sha256").update(payload).digest("hex").slice(0, 16);
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

  /**
   * Register a quality validator
   */
  registerQualityValidator(name, validator) {
    this.#validators.set(name, validator);
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

  /**
   * Get quality metrics
   */
  getQualityMetrics() {
    return { ...this.#qualityMetrics };
  }

  /**
   * Get inference by ID
   */
  getInference(inferenceId) {
    return constitutionalInferenceContract.getInference(inferenceId);
  }

  /**
   * Get all inferences matching filter
   */
  getInferences(filter) {
    return constitutionalInferenceContract.getInferences(filter);
  }

  /**
   * Get reasoning chain for an inference
   */
  getReasoningChain(inferenceId) {
    return this.#buildReasoningChain(inferenceId);
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId) {
    // Check queue
    const queued = this.#reasoningQueue.find(t => t.id === taskId);
    if (queued) return queued;

    // Check active
    const active = this.#activeReasoning.get(taskId);
    if (active) return active;

    // Check completed
    return this.#completedTasks.get(taskId);
  }

  /**
   * Get all queued tasks
   */
  getQueuedTasks() {
    return [...this.#reasoningQueue];
  }

  /**
   * Get active tasks
   */
  getActiveTasks() {
    return Array.from(this.#activeReasoning.values());
  }

  /**
   * Cancel a queued task
   */
  cancelTask(taskId) {
    const index = this.#reasoningQueue.findIndex(t => t.id === taskId);
    if (index !== -1) {
      this.#reasoningQueue.splice(index, 1);
      return true;
    }
    return false;
  }
}

// Quality Validators

async function validateEvidenceCoverage(inferenceId) {
  const record = constitutionalInferenceContract.getInference(inferenceId);
  if (!record) return { valid: false, errors: ["Inference not found"] };

  if (record.evidenceIds.length === 0) {
    return { valid: false, errors: ["No evidence provided"] };
  }

  return { valid: true, errors: [] };
}

async function validateCausalCompleteness(inferenceId) {
  const record = constitutionalInferenceContract.getInference(inferenceId);
  if (!record) return { valid: false, errors: ["Inference not found"] };

  if (record.type === "causal" && record.lineage.causalChain.length === 0) {
    return { valid: false, errors: ["Causal inference requires causal chain"] };
  }

  return { valid: true, errors: [] };
}

async function validateDimensionalConsistency(inferenceId) {
  const record = constitutionalInferenceContract.getInference(inferenceId);
  if (!record) return { valid: false, errors: ["Inference not found"] };

  if (record.type === "dimensional" && record.lineage.causalChain.length < 2) {
    return { valid: false, errors: ["Dimensional inference requires at least 2 reasoning steps"] };
  }

  return { valid: true, errors: [] };
}

async function validateTemporalConsistency(inferenceId) {
  const record = constitutionalInferenceContract.getInference(inferenceId);
  if (!record) return { valid: false, errors: ["Inference not found"] };

  if (record.type === "temporal" && record.lineage.causalChain.length < 1) {
    return { valid: false, errors: ["Temporal inference requires causal chain"] };
  }

  return { valid: true, errors: [] };
}

async function validateConstitutionalCompliance(inferenceId) {
  const record = constitutionalInferenceContract.getInference(inferenceId);
  if (!record) return { valid: false, errors: ["Inference not found"] };

  const errors = [];
  if (!record.constitutionalHash) errors.push("Missing constitutional hash");
  if (!record.replayToken) errors.push("Missing replay token");

  return { valid: errors.length === 0, errors };
}

async function validateBlindSpotCoverage(inferenceId) {
  const report = constitutionalInferenceContract.checkBlindSpots(inferenceId);

  if (report.hasBlindSpots) {
    return { valid: false, errors: [`Blind spots detected: ${report.blindSpots.join(", ")}`] };
  }

  return { valid: true, errors: [] };
}

async function validateReplayVerifiability(inferenceId) {
  const replayCheck = constitutionalInferenceContract.verifyReplayToken(inferenceId);

  if (!replayCheck.valid) {
    return { valid: false, errors: [replayCheck.reason || "Replay verification failed"] };
  }

  return { valid: true, errors: [] };
}

function taskIdToSeed(task) {
  return createHash("sha256").update(JSON.stringify(task)).digest("hex").slice(0, 16);
}

// Export singleton
export const constitutionalReasoningEngine = new ConstitutionalReasoningEngine();
