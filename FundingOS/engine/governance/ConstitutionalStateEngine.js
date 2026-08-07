/**
 * FundingOS Constitutional State Engine — State transitions with evidence.
 */

export class ConstitutionalStateEngine {
  constructor() {
    this.state = new Map();
    this.history = [];
  }

  async transition(intent, context, decision) {
    const stateKey = `${context.actorId}:${intent.id}`;
    const previousState = this.state.get(stateKey);

    const newState = {
      actorId: context.actorId,
      intentId: intent.id,
      action: intent.action,
      status: decision.verdict === "allow" ? "completed" : "denied",
      previousState,
      decision: {
        verdict: decision.verdict,
        policiesApplied: decision.policiesApplied,
        paramAdjust: decision.paramAdjust
      },
      timestamp: Date.now(),
      evidence: intent.evidence || []
    };

    this.state.set(stateKey, newState);
    this.history.push(newState);

    return { ok: true, state: newState };
  }

  getState(actorId, intentId) {
    return this.state.get(`${actorId}:${intentId}`);
  }

  getHistory(actorId) {
    return this.history.filter(h => h.actorId === actorId);
  }

  getAllHistory() {
    return [...this.history];
  }

  clear() {
    this.state.clear();
    this.history = [];
  }
}

export function createCSE() {
  return new ConstitutionalStateEngine();
}