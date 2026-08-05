/**
 * Constitutional Enforcement Node (CEN) — enforcement receipts.
 * Ported from @sovereign-x/constitutional-compute (src/enforcement/index.js) to CJS.
 * Evaluates transitions against resource-floor invariants and issues hash-chained receipts.
 */

const { createHash } = require('crypto');

const AUTHORITY_TOKEN_DOMAIN = 'MANDALA-CEN-AUTHORITY-TOKEN-v1';

function createResourceFloorInvariant(dimension, floor) {
  return {
    invariantId: `resource-floor:${dimension}:min:${floor}`,
    evaluate(transition) {
      const proposed = readProposedScore(transition, dimension);
      const passed = proposed >= floor;
      return {
        invariantId: `resource-floor:${dimension}:min:${floor}`,
        passed,
        message: passed
          ? `${dimension} satisfies floor ${floor}`
          : `${dimension} ${proposed} fell below constitutional floor ${floor}`,
        action: passed ? 'ALLOW' : 'DENY',
      };
    },
  };
}

function compileInvariantDsl(source) {
  const match = /^require\s+(continuity|governance|memory|coordination|confidence)\s*>=\s*(\d+(?:\.\d+)?)$/i.exec(source.trim());
  if (!match) {
    throw new Error(`unsupported invariant DSL: ${source}`);
  }
  const dimension = match[1];
  const floor = Number(match[2]);
  return {
    ...createResourceFloorInvariant(dimension, floor),
    invariantId: `idsl:${dimension}:min:${floor}`,
    evaluate(transition) {
      const proposed = readProposedScore(transition, dimension);
      const passed = proposed >= floor;
      return {
        invariantId: `idsl:${dimension}:min:${floor}`,
        passed,
        message: passed
          ? `${dimension} satisfies DSL floor ${floor}`
          : `${dimension} ${proposed} violated DSL floor ${floor}`,
        action: passed ? 'ALLOW' : 'DENY',
      };
    },
  };
}

function issueAuthorityToken(input) {
  const token = { ...input, issuedAt: input.issuedAt ?? new Date().toISOString(), signature: '' };
  return { ...token, signature: authorityTokenSignature(token) };
}

function verifyEnforcementReceipt(receipt) {
  return receipt.receiptHash === hashReceiptBase(receiptBaseFromReceipt(receipt));
}

class ConstitutionalEnforcementNode {
  constructor(options = {}) {
    this.invariants = options.invariants ? [...options.invariants] : [];
    this.issuedAt = options.issuedAt ?? (() => new Date().toISOString());
    this.stateStore = new Map();
    this.ledger = [];
    this.seenTransitions = new Set();
    this.usedAuthorityTokens = new Set();
  }

  intercept(transition) {
    return { stage: 'intercept', transition };
  }

  evaluate(intercepted) {
    const transition = intercepted.transition;
    const malformed = validateTransitionShape(transition);
    if (malformed) {
      return this.evaluated(transition, [], this.decision('DENY', 'DENY', 'MALFORMED_TRANSITION', malformed));
    }
    if (this.seenTransitions.has(transition.transitionId)) {
      return this.evaluated(transition, [], this.decision('DENY', 'DENY', 'REPLAY_DETECTED', 'transition replay detected'));
    }

    const capabilityDenied = transition.requestedCapabilities.find(
      (capability) => !transition.context.runtimeContext.capabilities.includes(capability),
    );
    if (capabilityDenied) {
      return this.evaluated(transition, [], this.decision('DENY', 'DENY', 'CAPABILITY_DENIED', `capability denied: ${capabilityDenied}`));
    }

    const tokenDecision = this.validateAuthorityToken(transition);
    if (tokenDecision) {
      return this.evaluated(transition, [], tokenDecision);
    }

    const evaluations = this.invariants.map((invariant) => invariant.evaluate(transition));
    const failed = evaluations.find((evaluation) => !evaluation.passed);
    if (failed) {
      return this.evaluated(transition, evaluations, this.decision('DENY', failed.action ?? 'DENY', 'INVARIANT_VIOLATION', failed.message));
    }

    return this.evaluated(transition, evaluations, this.decision('ALLOW', 'ALLOW', 'ALLOWED', 'transition admitted by CEN'));
  }

  allow(evaluated) {
    return this.finish(evaluated, true);
  }

  deny(evaluated) {
    return this.finish(evaluated, false);
  }

  receipt(evaluated) {
    return this.createReceipt(evaluated.transition, evaluated.decision, evaluated.evaluations);
  }

  execute(transition) {
    const evaluated = this.evaluate(this.intercept(transition));
    return evaluated.decision.verdict === 'ALLOW' ? this.allow(evaluated) : this.deny(evaluated);
  }

  getState(transitionId) {
    return this.stateStore.get(transitionId);
  }

  receipts() {
    return [...this.ledger];
  }

  finish(evaluated, requestedCommit) {
    const committed = requestedCommit && evaluated.decision.verdict === 'ALLOW';
    if (committed) {
      this.stateStore.set(evaluated.transition.transitionId, evaluated.transition.payload);
    }
    if (evaluated.transition.transitionId.trim()) {
      this.seenTransitions.add(evaluated.transition.transitionId);
    }
    if (evaluated.transition.authorityToken && evaluated.decision.reasonCode !== 'TOKEN_REPLAYED') {
      this.usedAuthorityTokens.add(evaluated.transition.authorityToken.tokenId);
    }
    const receipt = this.receipt(evaluated);
    this.ledger.push(receipt);
    return { decision: evaluated.decision, committed, receipt };
  }

  validateAuthorityToken(transition) {
    const token = transition.authorityToken;
    if (!token) { return undefined; }
    if (this.usedAuthorityTokens.has(token.tokenId)) {
      return this.decision('DENY', 'DENY', 'TOKEN_REPLAYED', 'authority token replayed');
    }
    if (token.signature !== authorityTokenSignature(token)) {
      return this.decision('DENY', 'DENY', 'TOKEN_INVALID_SIGNATURE', 'authority token signature invalid');
    }
    if (Date.parse(token.expiresAt) <= Date.now()) {
      return this.decision('DENY', 'DENY', 'TOKEN_EXPIRED', 'authority token expired');
    }
    if (token.transitionId !== transition.transitionId) {
      return this.decision('DENY', 'DENY', 'TOKEN_TRANSITION_MISMATCH', 'authority token transition mismatch');
    }
    const missingScope = transition.requestedCapabilities.find((capability) => !token.scope.includes(capability));
    if (missingScope) {
      return this.decision('DENY', 'DENY', 'TOKEN_SCOPE_DENIED', `authority token missing scope: ${missingScope}`);
    }
    return undefined;
  }

  createReceipt(transition, decision, evaluations) {
    const previousReceiptHash = this.ledger.at(-1)?.receiptHash ?? null;
    const issuedAt = this.issuedAt();
    const base = {
      transitionId: transition.transitionId,
      transitionType: transition.transitionType,
      actor: transition.context?.actor ?? 'unknown',
      verdict: decision.verdict,
      action: decision.action,
      reasonCode: decision.reasonCode,
      reasonDetail: decision.reasonDetail,
      category: categoryForDecision(decision),
      stage: 'receipt',
      evaluations,
      mriSnapshotHash: hashJson(transition.context?.mriSnapshot ?? {}),
      payloadHash: hashJson(transition.payload),
      authorityTokenId: transition.authorityToken?.tokenId,
      previousReceiptHash,
      issuedAt,
    };
    const receiptHash = hashReceiptBase(base);
    return {
      receiptId: `cen:${receiptHash.slice('sha3-256:'.length)}`,
      ...base,
      receiptHash,
    };
  }

  evaluated(transition, evaluations, decision) {
    return { stage: 'evaluate', transition, evaluations, decision };
  }

  decision(verdict, action, reasonCode, reasonDetail) {
    return { verdict, action, reasonCode, reasonDetail };
  }
}

function validateTransitionShape(transition) {
  if (!transition || typeof transition !== 'object') { return 'transition object is required'; }
  if (!transition.transitionId?.trim()) { return 'transitionId is required'; }
  if (!transition.transitionType) { return 'transitionType is required'; }
  if (!Array.isArray(transition.requestedCapabilities)) { return 'requestedCapabilities must be an array'; }
  if (!transition.context?.runtimeContext || !Array.isArray(transition.context.runtimeContext.capabilities)) {
    return 'runtimeContext capabilities are required';
  }
  if (transition.payload === null || typeof transition.payload === 'undefined') { return 'payload is required'; }
  return undefined;
}

function readProposedScore(transition, dimension) {
  if (isRecord(transition.payload) && typeof transition.payload[dimension] === 'number') {
    return transition.payload[dimension];
  }
  return transition.context.mriSnapshot[dimension];
}

function categoryForDecision(decision) {
  if (decision.verdict === 'ALLOW') { return 'allow'; }
  if (decision.reasonCode === 'REPLAY_DETECTED') { return 'replay'; }
  if (decision.reasonCode.startsWith('TOKEN_')) { return 'token_refusal'; }
  if (decision.reasonCode === 'MALFORMED_TRANSITION' || decision.reasonCode === 'INVALID_TRANSITION') { return 'anomaly'; }
  return 'deny';
}

function authorityTokenSignature(token) {
  return createHash('sha3-256')
    .update(
      [
        AUTHORITY_TOKEN_DOMAIN,
        token.tokenId,
        token.tokenType,
        token.scope.join(','),
        token.transitionId,
        token.issuedAt,
        token.expiresAt,
      ].join('|'),
      'utf8',
    )
    .digest('hex');
}

function receiptBaseFromReceipt(receipt) {
  const { receiptId, receiptHash, ...base } = receipt;
  return base;
}

function hashReceiptBase(base) {
  return hashJson(base);
}

function hashJson(value) {
  return `sha3-256:${createHash('sha3-256').update(stableStringify(value), 'utf8').digest('hex')}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => typeof value[key] !== 'undefined')
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

module.exports = {
  AUTHORITY_TOKEN_DOMAIN,
  ConstitutionalEnforcementNode,
  createResourceFloorInvariant,
  compileInvariantDsl,
  issueAuthorityToken,
  verifyEnforcementReceipt,
};
