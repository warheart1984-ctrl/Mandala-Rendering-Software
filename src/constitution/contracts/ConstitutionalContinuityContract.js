/**
 * Constitutional Continuity Contract (CCC)
 * 
 * Governs temporal continuity and ensures continuity of state, identity, and causality
 * across frames, sessions, and temporal operations. Enforces continuity invariants.
 * 
 * Status: **enforced** - All temporal operations must pass through CCC
 * Gaps: Full causal/identity reconciliation declared
 */

import { createHash } from "node:crypto";

export const CONTINUITY_LEVELS = Object.freeze({
  PERFECT: "perfect",
  SUBSTRATE_VERIFIED: "substrate_verified",
  PARTIAL: "partial",
  DECLARED: "declared",
  BROKEN: "broken"
});

export const CONTINUITY_TYPES = Object.freeze({
  TEMPORAL: "temporal",
  SPATIAL: "spatial",
  CAUSAL: "causal",
  IDENTITY: "identity",
  METRIC: "metric",
  DIMENSIONAL: "dimensional"
});

export const CONTINUITY_VERDICTS = Object.freeze({
  PRESERVED: "preserved",
  DEGRADED: "degraded",
  BROKEN: "broken",
  DECLARED: "declared",
  UNEVALUATED: "unevaluated"
});

export class ConstitutionalContinuityContract {
  constructor() {
    this._continuityRecords = new Map();
    this._continuityChains = new Map();
    this._violations = [];
    this._validators = new Map();
    this._hooks = new Map();

    this.registerValidator("temporal", validateTemporalContinuity);
    this.registerValidator("spatial", validateSpatialContinuity);
    this.registerValidator("causal", validateCausalContinuity);
    this.registerValidator("identity", validateIdentityContinuity);
    this.registerValidator("metric", validateMetricContinuity);
    this.registerValidator("dimensional", validateDimensionalContinuity);

    this._hooks.set("continuity_preserved", []);
    this._hooks.set("continuity_degraded", []);
    this._hooks.set("continuity_broken", []);
    this._hooks.set("continuity_restored", []);
  }

  registerContinuity(continuity) {
    const continuityId = this._generateContinuityId(continuity);
    
    const record = {
      id: continuityId,
      declaration: continuity,
      type: continuity.type,
      level: continuity.level ?? "substrate_verified",
      status: "unevaluated",
      sourceState: continuity.sourceState,
      targetState: continuity.targetState,
      evidence: continuity.evidence ?? [],
      proof: continuity.proof ?? null,
      createdAt: new Date().toISOString(),
      verifiedAt: null,
      verifiedBy: null,
      continuityHash: this._computeContinuityHash(continuity),
      replayToken: null,
      lineage: {
        parentIds: continuity.parentIds ?? [],
        causalChain: continuity.causalChain ?? []
      }
    };

    this._continuityRecords.set(continuityId, record);
    this._triggerHooks("registered", { continuityId, record });
    
    return record;
  }

  async verifyContinuity(continuityId, verifier) {
    const record = this._continuityRecords.get(continuityId);
    if (!record) {
      return { 
        verified: false, 
        verdict: "unevaluated",
        reason: `Continuity record ${continuityId} not found`
      };
    }

    const errors = [];
    for (const [name, validator] of this._validators) {
      try {
        const result = await validator(record);
        if (!result.valid) {
          errors.push(...result.errors.map(e => `${name}: ${e}`));
        }
      } catch (e) {
        errors.push(`${name}: ${e.message}`);
      }
    }

    if (verifier) {
      try {
        const customResult = await verifier.verify(record);
        if (!customResult.valid) {
          errors.push(...customResult.errors);
        }
      } catch (e) {
        errors.push(`custom: ${e.message}`);
      }
    }

    const verdict = errors.length === 0 ? "preserved" : 
                   (errors.some(e => e.includes("degraded")) ? "degraded" : "broken");

    const verified = errors.length === 0;
    
    if (verified) {
      record.status = "preserved";
      record.verifiedAt = new Date().toISOString();
      this._triggerHooks("continuity_preserved", { continuityId, record });
    } else {
      record.status = verdict;
      this._violations.push({
        continuityId,
        errors,
        timestamp: new Date().toISOString(),
        severity: verdict === "broken" ? "critical" : "warning"
      });
      this._triggerHooks("continuity_broken", { continuityId, errors });
    }

    record.verifiedAt = new Date().toISOString();
    record.replayToken = this._computeReplayToken(continuityId);

    return {
      verified,
      verdict,
      errors,
      continuityId,
      replayToken: record.replayToken
    };
  }

  async createContinuityChain(chainId, continuityIds) {
    const chain = {
      id: chainId,
      continuityIds,
      createdAt: new Date().toISOString(),
      status: "unevaluated",
      overallVerdict: "unevaluated",
      links: []
    };

    for (const id of continuityIds) {
      const record = this._continuityRecords.get(id);
      if (!record) {
        throw new Error(`Continuity ${id} not found in chain ${chainId}`);
      }
      
      const verification = await this.verifyContinuity(id);
      chain.links.push({ continuityId: id, ...verification });
    }

    const verdicts = chain.links.map(l => l.verdict);
    if (verdicts.includes("broken")) {
      chain.overallVerdict = "broken";
    } else if (verdicts.includes("degraded")) {
      chain.overallVerdict = "degraded";
    } else if (verdicts.every(v => v === "preserved")) {
      chain.overallVerdict = "preserved";
    } else {
      chain.overallVerdict = "declared";
    }

    chain.status = chain.overallVerdict;
    this._continuityChains.set(chainId, chain);
    return chain;
  }

  async detectViolations(chainId) {
    const chain = this._continuityChains.get(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`);
    }

    const violations = [];
    
    for (let i = 0; i < chain.links.length - 1; i++) {
      const current = chain.links[i];
      const next = chain.links[i + 1];
      
      if (current.verdict === "broken" || 
          next.verdict === "broken") {
        violations.push({
          type: "broken_continuity",
          from: current.continuityId,
          to: next.continuityId,
          severity: "critical"
        });
      } else if (current.verdict === "degraded" ||
                 next.verdict === "degraded") {
        violations.push({
          type: "degraded_continuity",
          from: current.continuityId,
          to: next.continuityId,
          severity: "warning"
        });
      }
    }

    return violations;
  }

  getContinuity(continuityId) {
    return this._continuityRecords.get(continuityId);
  }

  getChain(chainId) {
    return this._continuityChains.get(chainId);
  }

  getViolations() {
    return [...this._violations];
  }

  registerValidator(name, validator) {
    this._validators.set(name, validator);
  }

  registerHook(event, hook) {
    if (!this._hooks.has(event)) {
      this._hooks.set(event, []);
    }
    this._hooks.get(event).push(hook);
  }

  getStats() {
    const records = Array.from(this._continuityRecords.values());
    const chains = Array.from(this._continuityChains.values());
    
    return {
      totalRecords: this._continuityRecords.size,
      totalChains: this._continuityChains.size,
      totalViolations: this._violations.length,
      byVerdict: {
        preserved: this._continuityRecords.size - this._violations.length,
        degraded: this._violations.filter(v => v.severity === "warning").length,
        broken: this._violations.filter(v => v.severity === "critical").length,
        unevaluated: this._continuityRecords.size - this._violations.length
      },
      byType: this._groupByContinuityType(),
      criticalViolations: this._violations.filter(v => v.severity === "critical").length
    };
  }

  _generateContinuityId(continuity) {
    const payload = `${continuity.type}:${JSON.stringify(continuity.sourceState)}:${JSON.stringify(continuity.targetState)}:${Date.now()}`;
    return createHash("sha256").update(payload).digest("hex").slice(0, 16);
  }

  _computeContinuityHash(continuity) {
    const payload = JSON.stringify({
      type: continuity.type,
      sourceState: continuity.sourceState,
      targetState: continuity.targetState,
      level: continuity.level,
      evidence: continuity.evidence
    }, Object.keys(continuity).sort());
    
    return createHash("sha256").update(payload).digest("hex").slice(0, 16);
  }

  _computeReplayToken(continuityId) {
    const record = this._continuityRecords.get(continuityId);
    if (!record) return null;
    const material = {
      id: record.id,
      continuityHash: record.continuityHash,
      type: record.type,
      sourceState: record.sourceState,
      targetState: record.targetState
    };
    const json = JSON.stringify(material, Object.keys(material).sort());
    return createHash("sha256").update(json).digest("hex");
  }

  _triggerHooks(event, data) {
    const hooks = this._hooks.get(event) || [];
    for (const hook of hooks) {
      try {
        hook(data);
      } catch (e) {
        console.error(`Hook ${event} failed:`, e);
      }
    }
  }

  getContinuityRecords() {
    return new Map(this._continuityRecords);
  }

  getContinuityChains() {
    return new Map(this._continuityChains);
  }

  _groupByContinuityType() {
    const counts = {};
    for (const record of this._continuityRecords.values()) {
      const type = record.type || "unknown";
      counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
  }
}

async function validateTemporalContinuity(record) {
  const errors = [];
  
  if (record.declaration.sourceState.timestamp && record.declaration.targetState.timestamp) {
    const sourceTime = new Date(record.declaration.sourceState.timestamp).getTime();
    const targetTime = new Date(record.declaration.targetState.timestamp).getTime();
    
    if (targetTime < sourceTime) {
      return { valid: false, errors: ["Temporal violation: target time precedes source time"] };
    }
  }

  if (record.declaration.maxTemporalGap) {
    const sourceTime = new Date(record.declaration.sourceState.timestamp).getTime();
    const targetTime = new Date(record.declaration.targetState.timestamp).getTime();
    const gap = targetTime - sourceTime;
    
    if (gap > record.declaration.maxTemporalGap) {
      return { 
        valid: false, 
        errors: [`Temporal gap ${gap}ms exceeds maximum allowed ${record.declaration.maxTemporalGap}ms`] 
      };
    }
  }

  return { valid: true, errors: [] };
}

async function validateSpatialContinuity(record) {
  const errors = [];
  
  if (record.declaration.sourceState.position && record.declaration.targetState.position) {
    const sourcePos = record.declaration.sourceState.position;
    const targetPos = record.declaration.targetState.position;
    
    if (sourcePos && targetPos) {
      const distance = Math.hypot(
        (targetPos.x || 0) - (sourcePos.x || 0),
        (targetPos.y || 0) - (sourcePos.y || 0),
        (targetPos.z || 0) - (sourcePos.z || 0),
        (targetPos.w || 0) - (sourcePos.w || 0)
      );
      
      if (record.declaration.maxSpatialJump && distance > record.declaration.maxSpatialJump) {
        return { 
          valid: false, 
          errors: [`Spatial jump ${distance} exceeds maximum allowed ${record.declaration.maxSpatialJump}`] 
        };
      }
    }
  }

  return { valid: true, errors: [] };
}

async function validateCausalContinuity(record) {
  const errors = [];
  
  if (record.declaration.causalChain && record.declaration.causalChain.length > 0) {
    for (let i = 0; i < record.declaration.causalChain.length - 1; i++) {
      const cause = record.declaration.causalChain[i];
      const effect = record.declaration.causalChain[i + 1];
      
      if (cause.timestamp >= effect.timestamp) {
        return { 
          valid: false, 
          errors: [`Causal violation at index ${i}: cause timestamp >= effect timestamp`] 
        };
      }
    }
  }

  return { valid: true, errors: [] };
}

async function validateIdentityContinuity(record) {
  const errors = [];
  
  if (record.declaration.sourceState.identity && record.declaration.targetState.identity) {
    if (record.declaration.sourceState.identity !== record.declaration.targetState.identity) {
      if (!record.declaration.identityTransform) {
        return { 
          valid: false, 
          errors: ["Identity changed without valid transformation"] 
        };
      }
    }
  }

  return { valid: true, errors: [] };
}

async function validateMetricContinuity(record) {
  const errors = [];
  
  if (record.declaration.sourceState.metric && record.declaration.targetState.metric) {
    const sourceMetric = record.declaration.sourceState.metric;
    const targetMetric = record.declaration.targetState.metric;
    
    if (JSON.stringify(sourceMetric) !== JSON.stringify(targetMetric)) {
      if (!record.declaration.metricEvolution) {
        return {
          valid: false,
          errors: ["Metric tensor changed without valid evolution"]
        };
      }
    }
  }
  
  return { valid: true, errors: [] };
}

async function validateDimensionalContinuity(record) {
  const errors = [];
  
  const sourceDims = record.declaration.sourceState.dimensions;
  const targetDims = record.declaration.targetState.dimensions;
  
  if (sourceDims && targetDims) {
    if (sourceDims.length !== targetDims.length) {
      errors.push("Dimensional mismatch: source and target have different dimensionality");
    }
  }
  
  return { valid: errors.length === 0, errors };
}

export const constitutionalContinuityContract = new ConstitutionalContinuityContract();