# FUNDINGOS — AGENTRI LAWBOOK

> **Constitutional Authority:** FundingOS v1.0 / MRS 4DCE v1.0
> **Source of Truth:** `constitution/CHARTER.md` · `engine/constitution/charter.js` · `engine/governance/policies/default.policies.json`
> **Enforcement:** This file is binding on every AI agent, assistant, copilot, and automated tool that scans, reads, modifies, or contributes to this repository.

---

## TABLE OF CONTENTS

- [Preamble](#preamble)
- [I. Core Principles (Mandatory)](#i-core-principles-mandatory)
- [II. Agent Divisions (25 Agents)](#ii-agent-divisions-25-agents)
- [III. MRS Crew Integration](#iii-mrs-crew-integration)
- [IV. Modes System](#iv-modes-system)
- [V. Vendor Skills](#v-vendor-skills)
- [VI. Policies (Enforced)](#vi-policies-enforced)
- [VII. Agent Rules](#vii-agent-rules)
- [VIII. Conformance Checks](#viii-conformance-checks)
- [IX. Evidence Requirements](#ix-evidence-requirements)
- [X. Protected Paths](#x-protected-paths)
- [XI. Enforcement](#xi-enforcement)
- [XII. Acknowledgment](#xii-acknowledgment)

---

## PREAMBLE

FundingOS is an AI-operated funding department governed by constitutional law. It integrates the Mandala Rendering System (MRS) Crew as internal capability agents for rendering, narrative generation, and audio production.

No agent may operate in FundingOS without acknowledging and following these rules.

---

## I. CORE PRINCIPLES (MANDATORY)

| # | Principle | Status | Rule |
|---|-----------|--------|------|
| **P1** | **No execution without intent** | enforced | Every operation originates from a declared intent record |
| **P2** | **No state change without evidence** | enforced | Every mutation backed by verifiable evidence |
| **P3** | **No authority without contract** | enforced | Every actor operates under a defined constitutional contract |
| **P4** | **Replayable reality** | partial | Significant decisions replayable via evidence |
| **P5** | **Sovereign independence** | declared | Platform-agnostic; no vendor lock-in without approval |
| **P6** | **Director coordination authority** | enforced | Director coordinates but never executes (from MRS) |
| **P7** | **MRS Crew integration** | declared | FundingOS may invoke MRS crew for rendering/narrative/audio |

---

## II. AGENT DIVISIONS (25 AGENTS)

### Discovery Division
| Agent | Contract | Authority | Role |
|-------|----------|-----------|------|
| `scout` | `contract.fundingos.scout.v1` | discover | Opportunity discovery |
| `market-intelligence` | `contract.fundingos.market-intelligence.v1` | analyze | Market analysis |
| `policy-watch` | `contract.fundingos.policy-watch.v1` | monitor | Regulatory monitoring |

### Strategy Division
| Agent | Contract | Authority | Role |
|-------|----------|-----------|------|
| `strategy` | `contract.fundingos.strategy.v1` | strategize | Funding strategy |
| `portfolio` | `contract.fundingos.portfolio.v1` | manage | Portfolio management |
| `priority` | `contract.fundingos.priority.v1` | rank | Priority ranking |

### Preparation Division
| Agent | Contract | Authority | Role |
|-------|----------|-----------|------|
| `proposal` | `contract.fundingos.proposal.v1` | write | Grant writing |
| `budget` | `contract.fundingos.budget.v1` | calculate | Budget construction |
| `documentation` | `contract.fundingos.documentation.v1` | assemble | Document assembly |

### Compliance Division
| Agent | Contract | Authority | Role |
|-------|----------|-----------|------|
| `eligibility` | `contract.fundingos.eligibility.v1` | verify | Eligibility checking |
| `compliance` | `contract.fundingos.compliance.v1` | check | Compliance verification |
| `audit` | `contract.fundingos.audit.v1` | audit | Audit preparation |

### Execution Division
| Agent | Contract | Authority | Role |
|-------|----------|-----------|------|
| `submission` | `contract.fundingos.submission.v1` | submit | Application submission |
| `calendar` | `contract.fundingos.calendar.v1` | track | Deadline tracking |
| `communication` | `contract.fundingos.communication.v1` | communicate | Stakeholder communication |

### Stewardship Division
| Agent | Contract | Authority | Role |
|-------|----------|-----------|------|
| `award` | `contract.fundingos.award.v1` | manage | Award management |
| `reporting` | `contract.fundingos.reporting.v1` | report | Progress reporting |
| `performance` | `contract.fundingos.performance.v1` | track | Performance tracking |

---

## III. MRS CREW INTEGRATION

The MRS Crew operates as **integrated capability agents** within FundingOS:

| Agent | Contract | Authority | MRS Capabilities |
|-------|----------|-----------|------------------|
| `mrs.director` | `contract.mrs.director.v1` | coordinate | All 7 MCP tools |
| `mrs.architect` | `contract.mrs.architect.v1` | design | query_knowledge_platform |
| `mrs.builder` | `contract.mrs.builder.v1` | scaffold | query_knowledge_platform |
| `mrs.implementor` | `contract.mrs.implementor.v1` | implement | query_knowledge_platform |
| `mrs.inspector` | `contract.mrs.inspector.v1` | inspect | query_knowledge_platform |
| `mrs.reviewer` | `contract.mrs.reviewer.v1` | audit | query_knowledge_platform |
| `mrs.engineer-standards` | `contract.mrs.engineer-standards.v1` | quality-gate | query_knowledge_platform |

### MRS Capabilities Available to FundingOS

| Capability | MCP Tool | Use Case |
|------------|----------|----------|
| 4D Rendering | `render_rt4d_preview` | Proposal visualizations, site renderings |
| Narrative Generation | `storyforge_build_narrative` | Grant narratives, project stories |
| Full Narrative Pipeline | `storyforge_full_pipeline` | Complete narrative → beats → audio |
| Beat Scoring | `beatbox_score_narrative` | Narrative beat analysis |
| Audio Mixing | `speakers_mix_audio` | Pitch presentations, audio narratives |
| Adaptive Scoring | `compute_engine_spiral_state` | Dynamic scoring for presentations |
| Knowledge Query | `query_knowledge_platform` | Grounded research for proposals |

### Integration Rules
1. MRS crew **must** be invoked through `MRSDirectorAdapter`
2. All MRS invocations **must** carry provenance
3. MRS agents **cannot** be invoked directly by FundingOS agents
4. Cross-domain operations require `funding-render-provenance` and `funding-narrative-evidence` policies

---

## IV. MODES SYSTEM

Each agent supports three operational modes:

| Mode | MRS Access | Vendor Skills | Sage Reasoning | Use Case |
|------|------------|---------------|----------------|----------|
| `standard` | ❌ | ❌ | ❌ | Normal operation |
| `sage` | ❌ | ❌ | ✅ | Elevated analysis |
| `full` | ✅ | All | ✅ | Maximum capabilities |

### Mode Switching
```bash
fundingos discover --query "AI grants" --mode full
fundingos prepare --topic "Research" --mrs-crew
```

---

## V. VENDOR SKILLS

All 25+ skills from `.opencode/skill/` are available:

**AWS Skills:** amazon-bedrock, aws-blocks, aws-cdk, aws-cloudformation, aws-compute, aws-containers, aws-deployment, aws-messaging-and-streaming, aws-observability, aws-sdk-js-v3-usage, aws-sdk-python-usage, aws-sdk-swift-usage, aws-serverless, aws-billing-and-cost-management, signing-in-to-aws, launch-with-aws

**GPU Skills:** nvidia-gpu-assist, hip-rocm, rocm-setup, tao-run-inference-service, tao-run-on-docker, tao-setup-nvidia-gpu-host, tilegym-cutile-python

**Other:** dynamo-troubleshoot, omniverse-usd-performance-tuning, rag-blueprint, customize-opencode

Skills are loaded at startup and assigned to agents via `SkillRegistry`.

---

## VI. POLICIES (ENFORCED)

| Policy ID | Scope | Severity | Rule |
|-----------|-------|----------|------|
| `policy-fundingos-no-execution-without-intent` | runtime | critical | deny_if_false |
| `policy-fundingos-no-state-change-without-evidence` | state | high | deny_if_false |
| `policy-fundingos-no-authority-without-contract` | authority | critical | deny_if_false |
| `policy-fundingos-eligibility-required` | preparation | critical | deny_if_false |
| `policy-fundingos-compliance-before-submission` | execution | critical | deny_if_false |
| `policy-fundingos-deadline-enforcement` | execution | critical | deny_if_false |
| `policy-fundingos-budget-validation` | preparation | high | deny_if_false |
| `policy-fundingos-reporting-cadence` | stewardship | high | deny_if_false |
| `policy-fundingos-audit-trail-complete` | stewardship | critical | deny_if_false |
| `policy-fundingos-performance-measurement` | stewardship | high | deny_if_false |
| `policy-director-contract-required` | authority | critical | deny_if_false |
| `policy-director-no-execution` | execution | critical | deny_if_false |
| `policy-director-mcp-provenance` | render | high | attach_provenance |
| `policy-funding-render-provenance` | cross-domain | high | attach_provenance |
| `policy-funding-narrative-evidence` | cross-domain | critical | deny_if_false |
| `policy-mrs-crew-integration` | cross-domain | critical | deny_if_false |

---

## VII. AGENT RULES

### R1 — Declare Before You Act
Before any operation, state: **What**, **Why**, **Which files**, **What tests**.

### R2 — Never Modify Governance Files Without Authorization
Protected: `constitution/`, `engine/constitution/`, `engine/governance/policies/`, `engine/conformance/`, `AGENTS.md`

### R3 — Preserve Evidence Chains
All operations must produce: `intent_declaration`, `output_collection`, `policy_validation`, `approval_record`

### R4 — No Unverified Claims
Status tags must be accurate: `enforced`/`partial`/`declared`/`skeleton`

### R5 — MRS Crew Boundaries
- MRS Director coordinates only
- MRS agents never execute FundingOS specialist work
- All MRS invocations via `MRSDirectorAdapter`

### R6 — Test Before Commit
`npm run lint` && `npm run typecheck` && `npm run test` && `npm run test:conformance`

### R7 — Constitutional Structure
Preserve: `agents/`, `engine/`, `modes/`, `skills/`, `cli/`, `constitution/`

### R8 — No Secrets
Never commit credentials, keys, or secrets.

### R9 — License Compliance
MIT compatible only. No GPL/AGPL without approval.

### R10 — Sovereignty Over Convenience
Constitution wins over convenience.

---

## VIII. CONFORMANCE CHECKS (~30)

| Domain | Check ID | Severity |
|--------|----------|----------|
| binding | `binding.fundingos-contract-exists` | critical |
| binding | `binding.mrs-contract-exists` | critical |
| binding | `binding.director-contract-exists` | critical |
| binding | `binding.resolver-exists` | high |
| authority | `authority.fundingos-chain-valid` | critical |
| authority | `authority.strategy-chain-valid` | critical |
| authority | `authority.portfolio-chain-valid` | critical |
| authority | `authority.priority-chain-valid` | critical |
| authority | `authority.chain-valid` | critical |
| governance | `governance.fundingos-no-implicit-escalation` | critical |
| governance | `governance.no-implicit-escalation` | critical |
| execution | `execution.fundingos-no-cross-layer-mutation` | critical |
| execution | `execution.no-cross-layer-mutation` | critical |
| evidence | `evidence.discovery-chain-complete` | high |
| evidence | `evidence.analysis-chain-complete` | high |
| evidence | `evidence.monitoring-chain-complete` | high |
| evidence | `evidence.proposal-chain-complete` | critical |
| evidence | `evidence.budget-chain-complete` | critical |
| evidence | `evidence.documentation-chain-complete` | high |
| evidence | `evidence.eligibility-chain-complete` | critical |
| evidence | `evidence.compliance-chain-complete` | critical |
| evidence | `evidence.audit-chain-complete` | critical |
| evidence | `evidence.submission-chain-complete` | critical |
| evidence | `evidence.calendar-chain-complete` | high |
| evidence | `evidence.communication-chain-complete` | high |
| evidence | `evidence.award-chain-complete` | critical |
| evidence | `evidence.reporting-chain-complete` | critical |
| evidence | `evidence.performance-chain-complete` | critical |
| cross-domain | `funding-render-provenance` | high |
| cross-domain | `funding-narrative-evidence` | critical |
| cross-domain | `mrs-crew-integration` | critical |
| ckl | `ckl.policy-load` | critical |
| ckl | `ckl.deny-without-intent` | critical |
| provenance | `provenance.recorder-exists` | critical |

---

## IX. EVIDENCE REQUIREMENTS

Every agent operation must produce:
1. **Intent declaration** — what and why
2. **Output collection** — results with provenance
3. **Policy validation** — CKL decision record
4. **Approval record** — human approval if required

Cross-domain (MRS) operations add:
5. **MRS provenance** — frame records from MRS Director
6. **Cross-domain evidence** — linked funding + rendering evidence

---

## X. PROTECTED PATHS

```
constitution/
engine/constitution/
engine/governance/policies/
engine/conformance/
AGENTS.md
```

---

## XI. ENFORCEMENT

1. OpenCode permissions restrict file operations
2. CI: `npm test` && `npm run test:conformance` must pass
3. Code review for constitutional changes
4. Provenance recorded for all changes

---

## XII. ACKNOWLEDGMENT

By operating in this repository, you acknowledge:
1. You have read and understood this lawbook
2. You will follow all principles (P1–P7)
3. You will obey all 16 policies at stated severities
4. You will produce evidence for every change
5. You will respect MRS crew integration boundaries
6. You understand critical/high policy violations are blocked

---

> **"No action without evidence. No claim without proof. No funding without governance."**
> — FundingOS Constitutional Charter v1.0