/** Evidence tests — EvidenceRecord, ProvenanceLedger. */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "../index.js";
import { createEvidenceRecord, evidenceAnswersWhy } from "../evidence/EvidenceRecord.js";
import { ProvenanceLedger } from "../evidence/ProvenanceLedger.js";

describe("SingularityTree Evidence", () => {
  let root;
  let ledger;

  beforeEach(() => {
    root = createRoot({});
    ledger = new ProvenanceLedger(root.config);
  });

  describe( "createEvidenceRecord", () => {
    it( "creates an evidence record with required fields", () => {
      const rec = createEvidenceRecord("genesis", "singularity-root", root.id, root.seed, 0);
      assert.ok(rec !== null);
      assert.ok(rec.id !== undefined);
    });

    it( "evidenceAnswersWhy returns the question", () => {
      const rec = createEvidenceRecord("test-reason", "rule-v1", "root", 1, 0);
      const answer = evidenceAnswersWhy(rec);
      assert.strictEqual(answer, "test-reason");
    });
  });

  describe( "ProvenanceLedger", () => {
    it( "records a genesis event", () => {
      const result = ledger.recordGenesis(root, root.config);
      assert.ok(result !== undefined);
    });

    it( "records a refinement event", () => {
      const result = ledger.recordRefinement(root, [], "branching.power-law.v1", root.seed, { differentiate: true });
      assert.ok(result !== undefined);
    });

    it( "configurationHash is computed", () => {
      const hash = ledger.configurationHash;
      assert.ok(typeof hash === "string" && hash.length > 0);
    });

    it( "evidence ids are trackable", () => {
      const evId1 = ledger.recordGenesis(root, root.config);
      const evId2 = ledger.recordRefinement(root, [], "test", root.seed, { differentiate: true });
      const ids = ledger.getEvidenceIds("root");
      assert.ok(Array.isArray(ids));
    });
  });
});