/* CommandProposalProtocol.test.js
 * Real tests (not placeholders). Guarantees:
 *  1. Proposal Validity (CPP must validate: authority, capability, policy, evidence)
 *  2. Constitutional Rejection (invalid proposals must be rejected with explanation)
 *  3. Replayable Proposal (CPP must produce identical proposals under replay)
 */

import { CommandProposalProtocol, IntentContractBuilder, ConstitutionalPackagingEngine, DomainValidator, ConstraintValidator, AuthorityRequestInterface, ExecutionHandoffInterface } from "../../../../..";
import { DeterminismClass } from "../../../../../convergence_verifier/convergence_verifier.js";

describe("Proposal Validity", () => {
  test("CPP validates authority", () => {
    const cpp = new CommandProposalProtocol();

    const validProposal = {
      authorityId: "mandala-renderer",
      capability: "gpu.compute.amd.legacy_efficient",
      policy: "render_4d_tesseract",
      evidence: {
        intentId: "test-intent",
        worldId: "world-test",
        timelineId: "timeline-test",
        timeSeconds: 1.0,
        parameters: { samplesPerPixel: 4 },
      },
    };

    const result = cpp.validateProposal(validProposal);
    expect(result.valid).toBe(true);
    expect(result.authorityOk).toBe(true);
  });

  test("CPP rejects authority validation", () => {
    const cpp = new CommandProposalProtocol();

    const invalidProposal = {
      authorityId: "unknown-actor",
      capability: "gpu.compute.amd.legacy_efficient",
      policy: "render_4d_tesseract",
      evidence: {
        intentId: "test-intent",
        worldId: "world-test",
        timelineId: "timeline-test",
        timeSeconds: 1.0,
        parameters: { samplesPerPixel: 4 },
      },
    };

    const result = cpp.validateProposal(invalidProposal);
    expect(result.valid).toBe(false);
    expect(result.authorityOk).toBe(false);
    expect(result.rejectionReason).toBeDefined();
  });

  test("CPP validates capability", () => {
    const cpp = new CommandProposalProtocol();

    const validProposal = {
      authorityId: "mandala-renderer",
      capability: "gpu.compute.amd.legacy_efficient",
      policy: "render_4d_tesseract",
      evidence: {
        intentId: "test-intent",
        worldId: "world-test",
        timelineId: "timeline-test",
        timeSeconds: 1.0,
        parameters: { samplesPerPixel: 4 },
      },
    };

    const result = cpp.validateProposal(validProposal);
    expect(result.capabilityOk).toBe(true);
  });

  test("CPP rejects unknown capability", () => {
    const cpp = new CommandProposalProtocol();

    const invalidProposal = {
      authorityId: "mandala-renderer",
      capability: "unknown-capability",
      policy: "render_4d_tesseract",
      evidence: {
        intentId: "test-intent",
        worldId: "world-test",
        timelineId: "timeline-test",
        timeSeconds: 1.0,
        parameters: { samplesPerPixel: 4 },
      },
    };

    const result = cpp.validateProposal(invalidProposal);
    expect(result.capabilityOk).toBe(false);
    expect(result.rejectionReason).toContain("capability");
  });

  test("CPP validates policy", () => {
    const cpp = new CommandProposalProtocol();

    const validProposal = {
      authorityId: "mandala-renderer",
      capability: "gpu.compute.amd.legacy_efficient",
      policy: "render_4d_tesseract",
      evidence: {
        intentId: "test-intent",
        worldId: "world-test",
        timelineId: "timeline-test",
        timeSeconds: 1.0,
        parameters: { samplesPerPixel: 4 },
      },
    };

    const result = cpp.validateProposal(validProposal);
    expect(result.policyOk).toBe(true);
  });

  test("CPP rejects prohibited policy", () => {
    const cpp = new CommandProposalProtocol();

    const invalidProposal = {
      authorityId: "mandala-renderer",
      capability: "gpu.compute.amd.legacy_efficient",
      policy: "prohibited_operation",
      evidence: {
        intentId: "test-intent",
        worldId: "world-test",
        timelineId: "timeline-test",
        timeSeconds: 1.0,
        parameters: { samplesPerPixel: 4 },
      },
    };

    const result = cpp.validateProposal(invalidProposal);
    expect(result.policyOk).toBe(false);
    expect(result.rejectionReason).toContain("policy");
  });

  test("CPP validates evidence", () => {
    const cpp = new CommandProposalProtocol();

    const validProposal = {
      authorityId: "mandala-renderer",
      capability: "gpu.compute.amd.legacy_efficient",
      policy: "render_4d_tesseract",
      evidence: {
        intentId: "test-intent",
        worldId: "world-test",
        timelineId: "timeline-test",
        timeSeconds: 1.0,
        parameters: { samplesPerPixel: 4 },
      },
    };

    const result = cpp.validateProposal(validProposal);
    expect(result.evidenceOk).toBe(true);
  });

  test("CPP rejects insufficient evidence", () => {
    const cpp = new CommandProposalProtocol();

    const invalidProposal = {
      authorityId: "mandala-renderer",
      capability: "gpu.compute.amd.legacy_efficient",
      policy: "render_4d_tesseract",
      evidence: {
        intentId: "test-intent",
        // Missing worldId, timelineId, timeSeconds, parameters
      },
    };

    const result = cpp.validateProposal(invalidProposal);
    expect(result.evidenceOk).toBe(false);
    expect(result.rejectionReason).toContain("evidence");
  });
});

describe("Constitutional Rejection", () => {
  test("rejects proposal missing authorityId", () => {
    const cpp = new CommandProposalProtocol();

    const proposal = {
      capability: "gpu.compute.amd.legacy_efficient",
      policy: "render_4d_tesseract",
      evidence: {
        intentId: "test-intent",
        worldId: "world-test",
        timelineId: "timeline-test",
        timeSeconds: 1.0,
        parameters: { samplesPerPixel: 4 },
      },
    };

    const result = cpp.validateProposal(proposal);
    expect(result.valid).toBe(false);
    expect(result.rejectionExplanation).toBeDefined();
    expect(result.rejectionExplanation).toContain("authority");
  });

  test("rejects proposal missing capability", () => {
    const cpp = new CommandProposalProtocol();

    const proposal = {
      authorityId: "mandala-renderer",
      policy: "render_4d_tesseract",
      evidence: {
        intentId: "test-intent",
        worldId: "world-test",
        timelineId: "timeline-test",
        timeSeconds: 1.0,
        parameters: { samplesPerPixel: 4 },
      },
    };

    const result = cpp.validateProposal(proposal);
    expect(result.valid).toBe(false);
    expect(result.rejectionExplanation).toBeDefined();
  });

  test("rejects proposal missing policy", () => {
    const cpp = new CommandProposalProtocol();

    const proposal = {
      authorityId: "mandala-renderer",
      capability: "gpu.compute.amd.legacy_efficient",
      evidence: {
        intentId: "test-intent",
        worldId: "world-test",
        timelineId: "timeline-test",
        timeSeconds: 1.0,
        parameters: { samplesPerPixel: 4 },
      },
    };

    const result = cpp.validateProposal(proposal);
    expect(result.valid).toBe(false);
    expect(result.rejectionExplanation).toBeDefined();
  });

  test("rejects proposal missing evidence", () => {
    const cpp = new CommandProposalProtocol();

    const proposal = {
      authorityId: "mandala-renderer",
      capability: "gpu.compute.amd.legacy_efficient",
      policy: "render_4d_tesseract",
    };

    const result = cpp.validateProposal(proposal);
    expect(result.valid).toBe(false);
    expect(result.rejectionExplanation).toBeDefined();
    expect(result.rejectionExplanation).toContain("evidence");
  });

  test("rejects proposal with invalid evidenceIds", () => {
    const cpp = new CommandProposalProtocol();

    const proposal = {
      authorityId: "mandala-renderer",
      capability: "gpu.compute.amd.legacy_efficient",
      policy: "render_4d_tesseract",
      evidence: {
        intentId: "test-intent",
        worldId: "world-test",
        // Missing timelineId and timeSeconds
      },
    };

    const result = cpp.validateProposal(proposal);
    expect(result.valid).toBe(false);
    expect(result.rejectionExplanation).toContain("evidence");
  });

  test("provides detailed rejection reasoning", () => {
    const cpp = new CommandProposalProtocol();

    const partialProposal = {
      authorityId: "mandala-renderer",
      capability: "gpu.compute.amd.legacy_efficient",
      policy: "render_4d_tesseract",
      evidence: {},
    };

    const result = cpp.validateProposal(partialProposal);
    expect(result.rejectionExplanation).toBeDefined();
    expect(typeof result.rejectionExplanation).toBe("string");
    // Should mention which field(s) failed
    expect(result.rejectionExplanation.length).toBeGreaterThan(0);
  });
});

describe("Replayable Proposal", () => {
  test("CPP produces identical proposals under replay", () => {
    const cpp = new CommandProposalProtocol();

    const proposal1 = {
      authorityId: "mandala-renderer",
      capability: "gpu.compute.amd.legacy_efficient",
      policy: "render_4d_tesseract",
      evidence: {
        intentId: "replay-test",
        worldId: "world-test",
        timelineId: "timeline-test",
        timeSeconds: 1.0,
        parameters: { samplesPerPixel: 4 },
      },
    };

    const proposal2 = {
      authorityId: "mandala-renderer",
      capability: "gpu.compute.amd.legacy_efficient",
      policy: "render_4d_tesseract",
      evidence: {
        intentId: "replay-test",
        worldId: "world-test",
        timelineId: "timeline-test",
        timeSeconds: 1.0,
        parameters: { samplesPerPixel: 4 },
      },
    };

    const result1 = cpp.validateProposal(proposal1);
    const result2 = cpp.validateProposal(proposal2);

    // Valid proposals should have identical validation results
    expect(result1.valid).toBe(result2.valid);
    expect(result1.authorityOk).toBe(result2.authorityOk);
    expect(result1.capabilityOk).toBe(result2.capabilityOk);
    expect(result1.policyOk).toBe(result2.policyOk);
    expect(result1.evidenceOk).toBe(result2.evidenceOk);
  });

  test("CPP replay with same seed produces identical validation", () => {
    const cpp = new CommandProposalProtocol();

    const baseProposal = {
      authorityId: "mandala-renderer",
      capability: "gpu.compute.amd.legacy_efficient",
      policy: "render_4d_tesseract",
      evidence: {
        intentId: "seed-test",
        worldId: "w",
        timelineId: "t",
        timeSeconds: 1.0,
        parameters: { samplesPerPixel: 4 },
      },
    };

    // Validate twice with same input
    const v1 = cpp.validateProposal(baseProposal);
    const v2 = cpp.validateProposal(baseProposal);

    expect(v1.valid).toBe(v2.valid);
    expect(v1.authorityOk).toBe(v2.authorityOk);
    expect(v1.capabilityOk).toBe(v2.capabilityOk);
    expect(v1.policyOk).toBe(v2.policyOk);
    expect(v1.evidenceOk).toBe(v2.evidenceOk);
    expect(v1.rejectionReason).toBe(v2.rejectionReason);
  });

  test("replayable proposal maintains constitutional consistency", () => {
    const cpp = new CommandProposalProtocol();

    const consistentProposal = {
      authorityId: "mandala-renderer",
      capability: "gpu.compute.amd.legacy_efficient",
      policy: "render_4d_tesseract",
      evidence: {
        intentId: "consistency-test",
        worldId: "world-v1",
        timelineId: "timeline-v1",
        timeSeconds: 2.0,
        parameters: { samplesPerPixel: 4, maxDepth: 5 },
      },
    };

    const v1 = cpp.validateProposal(consistentProposal);
    const v2 = cpp.validateProposal(consistentProposal);

    // Both validations should agree on constitutional status
    expect(v1.valid).toBe(v2.valid);
    // Same reasoning should apply
    expect(v1.rejectionReason).toBe(v2.rejectionReason);
  });
});