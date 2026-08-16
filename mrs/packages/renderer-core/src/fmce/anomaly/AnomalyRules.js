/**
 * Anomaly Rules - drift detection, classification, constitutional escalation.
 * Status: canonical
 */

export class TemporalBreakDetector {}
export class TemporalLoopDetector {}
export class GeometricDistortionDetector {}
export class DomainViolationDetector {}
export class ConstitutionalViolationDetector {}
export class EvidenceContradictionDetector {}

export class AnomalyRules {
  constructor() {
    this.temporalBreakDetector = new TemporalBreakDetector();
    this.temporalLoopDetector = new TemporalLoopDetector();
    this.geometricDistortionDetector = new GeometricDistortionDetector();
    this.domainViolationDetector = new DomainViolationDetector();
    this.constitutionalViolationDetector = new ConstitutionalViolationDetector();
    this.evidenceContradictionDetector = new EvidenceContradictionDetector();
  }

  detectNumericalDrift(data = {}) {
    const driftDetected =
      data.maxAbsoluteError > 1e-4 || data.maxRelativeError > 1e-3 || data.rmse > 1e-4;
    return { driftDetected, determinismClass: "D2_NUMERICAL" };
  }

  detectSemanticDrift(data = {}) {
    const invariants = data.semanticInvariants || [];
    const invariantFailed = invariants.some((inv) => inv && inv.passed === false);
    const driftDetected =
      data.meanDifference > 0.01 ||
      data.maxError > 0.05 ||
      data.hashMatch === false ||
      invariantFailed;
    return { driftDetected, determinismClass: "D3_SEMANTIC" };
  }

  detectStatisticalDrift(data = {}) {
    const driftDetected =
      data.varianceAcrossSamples > 0.01 || data.hashMatchAcrossSamples === false;
    return { driftDetected, determinismClass: "D4_STATISTICAL" };
  }

  detectAllDrifts(data = {}) {
    const numerical = this.detectNumericalDrift(data);
    const semantic = this.detectSemanticDrift(data);
    const statistical = this.detectStatisticalDrift(data);
    return {
      numericalDrift: numerical.driftDetected,
      semanticDrift: semantic.driftDetected,
      statisticalDrift: statistical.driftDetected,
      overallDrift: numerical.driftDetected || semantic.driftDetected || statistical.driftDetected,
      numerical,
      semantic,
      statistical,
    };
  }

  classifyNumerical(data = {}) {
    return this.detectNumericalDrift(data).driftDetected ? "D2" : "D2";
  }

  classifySemantic(data = {}) {
    return this.detectSemanticDrift(data).driftDetected ? "D3" : "D3";
  }

  classifyStatistical(data = {}) {
    return this.detectStatisticalDrift(data).driftDetected ? "D4" : "D4";
  }

  escalateToEvidenceChain(data = {}, evidenceChain) {
    const drift = this.detectAllDrifts(data);

    if (drift.overallDrift) {
      const evidence = {
        intentId: "anomaly.intent",
        worldId: "anomaly.world",
        timelineId: "anomaly.timeline",
        timeSeconds: 0,
        parameters: { source: "anomaly_rules", ...data },
      };
      if (evidenceChain && typeof evidenceChain.addEvidence === "function") {
        evidenceChain.addEvidence(evidence);
      }
      return { escalated: true, evidence, ...drift };
    }

    return { escalated: false, ...drift };
  }
}
