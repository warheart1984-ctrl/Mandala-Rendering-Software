/**
 * Anomaly Rules - Constitutional Anomaly Detection Rules
 * Status: partial
 * Module: MODULE_10_ANOMALY (Section 2)
 */

export class AnomalyRules {
  constructor() {
    this.temporalBreak = new TemporalBreakDetector();
    this.temporalLoop = new TemporalLoopDetector();
    this.geometricDistortion = new GeometricDistortionDetector();
    this.domainViolation = new DomainViolationDetector();
    this.constitutionalViolation = new ConstitutionalViolationDetector();
    this.evidenceContradiction = new EvidenceContradictionDetector();
  }

  detect(input, intentId, worldId, timelineId, timeSeconds, parameters) {
    const reports = [];

    const breakReport = this.temporalBreak.detect(input.rt4dGeometry);
    if (breakReport.detected) reports.push(breakReport);

    const loopReport = this.temporalLoop.detect(input.rt4dGeometry);
    if (loopReport.detected) reports.push(loopReport);

    const distortionReport = this.geometricDistortion.detect(input.mandalaGeometry);
    if (distortionReport.detected) reports.push(distortionReport);

    const domainReport = this.domainViolation.detect(input.mandalaGeometry, input.domainSignatures);
    if (domainReport.detected) reports.push(domainReport);

    const constitutionalReport = this.constitutionalViolation.detect(input.mandalaGeometry, input.continuityProof);
    if (constitutionalReport.detected) reports.push(constitutionalReport);

    const evidenceReport = this.evidenceContradiction.detect(input.evidenceChain, input.rt4dGeometry);
    if (evidenceReport.detected) reports.push(evidenceReport);

    return {
anomalyReports: reports,
      anomalyDetection: {
        totalDetected: reports.length,
        byType: this.categorizeByType(reports),
        detectedAt: Date.now(),
      intentId: input.intentId,
      worldId: input.worldId,
      timelineId: input.timelineId,
      timeSeconds: input.timeSeconds,
      parameters: input.parameters
      }
    };
  }

  categorizeByType(reports) {
    const counts = {};
    for (const r of reports) {
      const type = r.type || "unknown";
      counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
  }
}

export class TemporalBreakDetector {
  detect(rt4d) {
    const r = rt4d;
    const coords = r.temporalGeometry?.coordinates || [];
    let detected = false;
    const breaks = [];

    for (let i = 1; i < coords.length; i++) {
      const dt = coords[i].t - coords[i-1].t;
      if (dt > 1000) {
        detected = true;
        breaks.push({ index: i, gap: dt });
      }
    }

    return {
type: "temporal_break",
      detected,
      breaks,
      severity: detected ? "high" : "none",
      constitutionalImpact: "Continuity chain broken",
      intentId: input.intentId,
      worldId: input.worldId,
      timelineId: input.timelineId,
      timeSeconds: input.timeSeconds,
      parameters: input.parameters
      };
  }
}

export class TemporalLoopDetector {
  detect(rt4d) {
    const r = rt4d;
    const coords = r.temporalGeometry?.coordinates || [];
    const seen = new Map();
    let detected = false;
    const loops = [];

    for (let i = 0; i < coords.length; i++) {
      const key = `${coords[i].x},${coords[i].y},${coords[i].z},${coords[i].w}`;
      if (seen.has(key)) {
        detected = true;
        loops.push({ first: seen.get(key), second: i });
      }
      seen.set(key, i);
    }

    return {
type: "temporal_loop",
      detected,
      loops,
      severity: detected ? "medium" : "none",
      constitutionalImpact: "Replay cycle detected",
      intentId: input.intentId,
      worldId: input.worldId,
      timelineId: input.timelineId,
      timeSeconds: input.timeSeconds,
      parameters: input.parameters
      };
  }
}

export class GeometricDistortionDetector {
  detect(mandala) {
    const m = mandala;
    const stateGeom = m.perceptualLattice?.layers?.state?.primitives;
    let detected = false;
    const distortions = [];

    if (stateGeom) {
      const nodes = stateGeom.nodes?.length || 0;
      const edges = stateGeom.edges?.length || 0;

      if (nodes > 0 && edges === 0) {
        detected = true;
        distortions.push({ type: "disconnected_nodes", nodes, edges });
      }
    }

    return {
type: "geometric_distortion",
      detected,
      distortions,
      severity: detected ? "medium" : "none",
      constitutionalImpact: "Geometry deviates from expected structure",
      intentId: input.intentId,
      worldId: input.worldId,
      timelineId: input.timelineId,
      timeSeconds: input.timeSeconds,
      parameters: input.parameters
      };
  }
}

export class DomainViolationDetector {
  detect(mandala, boundaries) {
    const m = mandala;
    const domainLayer = m.perceptualLattice?.layers?.domain;
    let detected = false;
    const violations = [];

    if (domainLayer?.boundaries) {
      for (const boundary of domainLayer.boundaries) {
        if (boundary.signature?.includes("forbidden")) {
          detected = true;
          violations.push({ boundary, reason: "Crossed into forbidden zone" });
        }
      }
    }

    return {
type: "domain_violation",
      detected,
      violations,
      severity: detected ? "high" : "none",
      constitutionalImpact: "Domain boundary improperly crossed",
      intentId: input.intentId,
      worldId: input.worldId,
      timelineId: input.timelineId,
      timeSeconds: input.timeSeconds,
      parameters: input.parameters
      };
  }
}

export class ConstitutionalViolationDetector {
  detect(mandala, continuity) {
    const m = mandala;
    const constitutionalLayer = m.perceptualLattice?.layers?.constitutional;
    let detected = false;
    const violations = [];

    if (constitutionalLayer?.forbiddenRegions?.length > 0) {
      detected = true;
      violations.push({ regions: constitutionalLayer.forbiddenRegions });
    }

    if (continuity && continuity.chainValid === false) {
      detected = true;
      violations.push({ reason: "Continuity chain invalid" });
    }

    return {
type: "constitutional_violation",
      detected,
      violations,
      severity: detected ? "high" : "none",
      constitutionalImpact: "Constitutional constraints violated",
      intentId: input.intentId,
      worldId: input.worldId,
      timelineId: input.timelineId,
      timeSeconds: input.timeSeconds,
      parameters: input.parameters
      };
  }
}

export class EvidenceContradictionDetector {
  detect(evidence, rt4d) {
    const e = evidence;
    const r = rt4d;
    let detected = false;
    const contradictions = [];

    const evidenceHash = e.evidenceEntry?.replayAnchor?.evidenceHash;
    const replayHash = r.temporalGeometry?.evidenceEmbedding;

    if (evidenceHash && replayHash && evidenceHash !== replayHash) {
      detected = true;
      contradictions.push({ evidenceHash, replayHash, reason: "Evidence lineage mismatch" });
    }

    return {
type: "evidence_contradiction",
      detected,
      contradictions,
      severity: detected ? "high" : "none",
      constitutionalImpact: "Lineage does not match replay or authority",
      intentId: input.intentId,
      worldId: input.worldId,
      timelineId: input.timelineId,
      timeSeconds: input.timeSeconds,
      parameters: input.parameters
      };
  }
}