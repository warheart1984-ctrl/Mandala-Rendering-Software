/**
 * Machine-readable FundingOS Constitutional Charter (FundingOS v1.0).
 * SoT under engine/constitution/charter.js
 * Only fields marked status:"enforced" are runtime gates.
 */

export const CHARTER = Object.freeze({
  id: "charter.fundingos.v1",
  version: "1.0.0",
  name: "FundingOS — Constitutional Charter",
  purpose: [
    "Governed AI-operated funding department",
    "Evidence-bound state transitions for funding operations",
    "Session provenance for decisions, submissions, awards",
    "MRS Crew integration for rendering/narrative/audio capabilities"
  ],
  principles: Object.freeze([
    {
      id: "no-execution-without-intent",
      status: "enforced",
      text: "Every governed operation originates from a declared intent record."
    },
    {
      id: "no-state-change-without-evidence",
      status: "enforced",
      text: "Every governed mutation is backed by verifiable evidence."
    },
    {
      id: "no-authority-without-contract",
      status: "enforced",
      text: "Every actor operates under a defined constitutional contract."
    },
    {
      id: "replayable-reality",
      status: "partial",
      text: "Significant decisions and submissions are replayable via evidence."
    },
    {
      id: "sovereign-independence",
      status: "declared",
      text: "Platform-agnostic solutions; no vendor lock-in without explicit approval."
    },
    {
      id: "director-coordination-authority",
      status: "enforced",
      text: "A Director Agent may coordinate crew agents and invoke MCP tools but must never execute specialist work."
    },
    {
      id: "mrs-crew-integration",
      status: "declared",
      text: "FundingOS may invoke MRS crew for rendering, narrative, and audio capabilities via constitutional contracts."
    }
  ]),
  organs: Object.freeze({
    governanceKernel: { id: "organ.gk", status: "enforced" },
    ckl: { id: "organ.ckl", status: "enforced" },
    cse: { id: "organ.cse", status: "enforced" },
    evidenceLayer: { id: "organ.evidence", status: "partial" },
    mrsIntegrationLayer: { id: "organ.mrs-integration", status: "declared" }
  }),
  agentDivisions: Object.freeze({
    discovery: ["scout", "market-intelligence", "policy-watch"],
    strategy: ["strategy", "portfolio", "priority"],
    preparation: ["proposal", "budget", "documentation"],
    compliance: ["eligibility", "compliance", "audit"],
    execution: ["submission", "calendar", "communication"],
    stewardship: ["award", "reporting", "performance"],
    mrsCrew: ["director", "architect", "builder", "implementor", "inspector", "reviewer", "engineer-standards"]
  }),
  mrsCapabilities: Object.freeze([
    "render_rt4d_preview",
    "storyforge_build_narrative",
    "storyforge_full_pipeline",
    "beatbox_score_narrative",
    "speakers_mix_audio",
    "compute_engine_spiral_state",
    "query_knowledge_platform"
  ]),
  modes: Object.freeze(["standard", "sage", "full"])
});

export function enforcedPrinciples() {
  return CHARTER.principles.filter((p) => p.status === "enforced");
}

export function getAgentDivision(agentType) {
  for (const [division, agents] of Object.entries(CHARTER.agentDivisions)) {
    if (agents.includes(agentType)) return division;
  }
  return undefined;
}