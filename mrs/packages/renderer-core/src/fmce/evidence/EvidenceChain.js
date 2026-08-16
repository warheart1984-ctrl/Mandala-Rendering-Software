/**
 * Evidence Chain - append-only constitutional evidence ledger.
 * Status: canonical
 */

const REQUIRED_FIELDS = ["intentId", "worldId", "timelineId", "timeSeconds", "parameters"];

export class EvidenceCollector {
  collect(evidence) {
    return { collected: true, evidence };
  }
}

export class EvidenceNormalizer {
  normalize(evidence) {
    return { ...(evidence || {}) };
  }
}

export class EvidenceLedger {
  constructor() {
    this.entries = [];
  }
  append(entry) {
    this.entries.push(entry);
    return this.entries.length - 1;
  }
}

export class DomainSignatures {
  sign(evidence) {
    return { domain: (evidence && evidence.domain) || "default" };
  }
}

export class ConstitutionalProofs {
  prove(evidence) {
    return { proofed: true, evidence };
  }
}

export class ReplayAnchors {
  anchor(evidence) {
    return { anchored: true, evidence };
  }
}

export class EvidenceChain {
  constructor() {
    this.chain = [];
  }

  process(evidence) {
    return this.addEvidence(evidence);
  }

  addEvidence(evidence = {}) {
    const findings = [];
    for (const field of REQUIRED_FIELDS) {
      if (evidence[field] === undefined || evidence[field] === null) {
        findings.push(`missing ${field}`);
      }
    }

    if (evidence.index !== undefined && evidence.index !== null && evidence.index !== this.chain.length) {
      findings.push("duplicate or out-of-order index");
    }

    if (findings.length > 0) {
      return { ok: false, findings };
    }

    const entry = { ...evidence, index: this.chain.length };
    this.chain.push(entry);
    return { ok: true, index: entry.index, findings: [] };
  }

  insertAt(index, evidence) {
    return { ok: false, findings: ["append-only: insertion is not permitted"] };
  }

  getChainLength() {
    return this.chain.length;
  }

  getChain() {
    return this.chain.slice();
  }

  verifyReplayEquality(original, replay) {
    let matchCount = 0;
    for (const field of REQUIRED_FIELDS) {
      if (field === "parameters") {
        if (JSON.stringify(original[field]) === JSON.stringify(replay[field])) matchCount++;
      } else if (original[field] === replay[field]) {
        matchCount++;
      }
    }

    let determinismMatch = true;
    if (original.determinismClass !== undefined && replay.determinismClass !== undefined) {
      determinismMatch = original.determinismClass === replay.determinismClass;
    }

    let invariantMatch = true;
    if (original.invariantSurface !== undefined && replay.invariantSurface !== undefined) {
      invariantMatch = original.invariantSurface === replay.invariantSurface;
    }

    return {
      equivalent: matchCount === REQUIRED_FIELDS.length,
      matchCount,
      totalCount: REQUIRED_FIELDS.length,
      determinismMatch,
      invariantMatch,
    };
  }
}
