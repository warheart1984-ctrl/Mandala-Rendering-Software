/**
 * Explanation Engine - Constitutional Explanation Engine
 * Status: partial
 * Module: MODULE_10_EXPLANATION (Section 3)
 */

export class ExplanationEngine {
  constructor() {
    this.eventInterpreter = new EventInterpreter();
    this.constitutionalReasoner = new ConstitutionalReasoner();
    this.evidenceReferencer = new EvidenceReferencer();
    this.continuityAnalyzer = new ContinuityAnalyzer();
    this.anomalyInterpreter = new AnomalyInterpreter();
    this.recommendationGenerator = new RecommendationGenerator();
  }

  explain(input) {
    const whatHappened = this.eventInterpreter.interpret(input.event);
    const whyItHappened = this.constitutionalReasoner.reason(input.constitutionalDecision);
    const evidenceReference = this.evidenceReferencer.reference(input.evidence);
    const continuityReference = this.continuityAnalyzer.analyze(input.continuity);
    const anomalies = input.anomalies.map(a => this.anomalyInterpreter.interpret(a));
    const recommendedNextStep = this.recommendationGenerator.generate({
      event: input.event,
      decision: input.constitutionalDecision,
      anomalies
    });

    return {
      explanations: [{
        whatHappened,
        whyItHappened,
        constitutionalBasis: whyItHappened,
        evidenceReference,
        continuityReference,
        anomalies,
        recommendedNextStep,
        intentId: input.intentId,
        worldId: input.worldId,
        timelineId: input.timelineId,
        timeSeconds: input.timeSeconds,
        parameters: input.parameters
      }],
      recommendations: [recommendedNextStep],
      intentId: input.intentId,
      worldId: input.worldId,
      timelineId: input.timelineId,
      timeSeconds: input.timeSeconds,
      parameters: input.parameters
    };
  }
}

export class EventInterpreter {
  interpret(event) {
    const e = event;
    return {
      action: e.action || e.type || "unknown",
      domain: e.domain || "default",
      timestamp: e.timestamp || Date.now(),
      description: `Executed ${e.action || e.type} in domain ${e.domain || "default"}`
    };
  }
}

export class ConstitutionalReasoner {
  reason(decision) {
    const d = decision;
    return {
      decision: d.decision || "unknown",
      authority: d.authorityToken ? "valid" : "none",
      constraints: d.evidenceRequirements || {},
      reasoning: d.decision === "authorize"
        ? "Command authorized under constitutional authority with valid evidence requirements"
        : d.decision === "conditional"
          ? "Command conditionally authorized pending additional evidence"
          : "Command denied due to constitutional violation"
    };
  }
}

export class EvidenceReferencer {
  reference(evidence) {
    const e = evidence;
    return {
      ledgerIndex: e.ledgerIndex || "latest",
      evidenceHash: e.evidenceEntry?.hash || "none",
      domainSignature: e.domainSignature || "none",
      authorityToken: e.authorityToken || "none"
    };
  }
}

export class ContinuityAnalyzer {
  analyze(continuity) {
    const c = continuity;
    return {
      chainValid: c.chainValid || false,
      breakpoints: c.breakpoints || [],
      alignment: c.constitutionalAlignment || "unknown",
      replayLink: c.replayLink || "none"
    };
  }
}

export class AnomalyInterpreter {
  interpret(anomaly) {
    const a = anomaly;
    return {
      type: a.type || "unknown",
      severity: a.severity || "unknown",
      location: a.location || "unknown",
      impact: a.constitutionalImpact || "unknown",
      recommendedAction: a.recommendedAction || {}
    };
  }
}

export class RecommendationGenerator {
  generate(analysis) {
    const a = analysis;
    const recommendations = [];

    if (a.anomalies?.length > 0) {
      recommendations.push("Investigate detected anomalies");
    }

    if (a.decision?.decision === "deny") {
      recommendations.push("Revise command to meet constitutional requirements");
    }

    if (a.event?.action === "investigate_anomaly") {
      recommendations.push("Run continuity reconstruction");
    }

    recommendations.push("Maintain constitutional continuity");
    recommendations.push("Verify evidence chain integrity");

    return {
      immediate: recommendations.slice(0, 2),
      shortTerm: recommendations.slice(2, 4),
      longTerm: recommendations.slice(4),
      generatedAt: Date.now()
    };
  }
}