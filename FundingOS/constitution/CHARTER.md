# FundingOS Constitutional Charter v1.0

**Constitutional Authority:** FundingOS v1.0 / MRS 4DCE v1.0
**Source of Truth:** `constitution/CHARTER.md` · `engine/constitution/charter.js` · `engine/governance/policies/default.policies.json`
**Enforcement:** This charter governs all agents operating within FundingOS.

---

## PREAMBLE

FundingOS is an AI-operated funding department governed by constitutional law. It integrates the Mandala Rendering System (MRS) Crew as internal capability agents for rendering, narrative, and audio production.

No agent may operate in FundingOS without acknowledging and following these rules.

---

## I. CORE PRINCIPLES (MANDATORY)

| # | Principle | Status | Rule |
|---|-----------|--------|------|
| **P1** | **No execution without intent** | enforced | Every operation originates from a declared intent record |
| **P2** | **No state change without evidence** | enforced | Every mutation backed by verifiable evidence |
| **P3** | **No authority without contract** | enforced | Every actor operates under a defined constitutional contract |
| **P4** | **Replayable reality** | partial | Significant decisions replayable via evidence |
| **P5** | **Sovereign independence** | declared | Platform-agnostic, no vendor lock-in without approval |
| **P6** | **Director coordination authority** | enforced | Director coordinates but never executes (from MRS) |
| **P7** | **MRS Crew integration** | declared | FundingOS may invoke MRS crew for rendering/narrative/audio capabilities |

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

### MRS Crew (Integrated Capability Agents)
| Agent | Contract | Authority | Role |
|-------|----------|-----------|------|
| `mrs.director` | `contract.mrs.director.v1` | coordinate | Constitutional orchestrator |
| `mrs.architect` | `contract.mrs.architect.v1` | design | Design-only |
| `mrs.builder` | `contract.mrs.builder.v1` | scaffold | Scaffolding |
| `mrs.implementor` | `contract.mrs.implementor.v1` | implement | Implementation |
| `mrs.inspector` | `contract.mrs.inspector.v1` | inspect | Evidence inspection |
| `mrs.reviewer` | `contract.mrs.reviewer.v1` | audit | Constitutional audit |
| `mrs.engineer-standards` | `contract.mrs.engineer-standards.v1` | quality-gate | ESFR final gate |

---

## III. MRS CREW CAPABILITIES

The MRS Crew provides these capabilities to FundingOS agents:

| Capability | MCP Tool | Use Case |
|------------|----------|----------|
| 4D Rendering | `render_rt4d_preview` | Proposal visualizations, site renderings |
| Narrative Generation | `storyforge_build_narrative` | Grant narratives, project stories |
| Full Narrative Pipeline | `storyforge_full_pipeline` | Complete narrative → beats → audio |
| Beat Scoring | `beatbox_score_narrative` | Narrative beat analysis |
| Audio Mixing | `speakers_mix_audio` | Pitch presentations, audio narratives |
| Adaptive Scoring | `compute_engine_spiral_state` | Dynamic scoring for presentations |
| Knowledge Query | `query_knowledge_platform` | Grounded research for proposals |

---

## IV. MODES SYSTEM

Each agent supports three operational modes:

| Mode | Description | Capabilities |
|------|-------------|--------------|
| `standard` | Normal operation | Basic agent functions |
| `sage` | Elevated reasoning | Extended analysis, deeper reasoning (Architect Sage, Builder Sage, etc.) |
| `full` | All capabilities | All vendor skills + MRS crew access |

---

## V. VENDOR SKILLS

All skills from `.opencode/skill/` are available to all 25 agents:
- AWS skills (Bedrock, Blocks, CDK, CloudFormation, Compute, Containers, Deployment, Messaging, Observability, SDKs, Serverless, Billing, Signing)
- GPU skills (NVIDIA, HIP/ROCm, TAO, cuTile)
- Other (Amazon Bedrock, Dynamo, Launch with AWS, Omniverse, RAG Blueprint, TileGym, Customize OpenCode)

---

## VI. GOVERNANCE

- **GovernanceKernel** — Decision pipeline
- **ConstitutionalKnowledgeLayer (CKL)** — Policy evaluation
- **ConstitutionalStateEngine (CSE)** — State transitions
- **ProvenanceRecorder** — Frame recording
- **EvidenceLayer** — Evidence chains

---

## VII. CONFORMANCE

~24 checks across: funding operations, MRS crew integration, cross-domain provenance, evidence chains.

---

## VIII. ENFORCEMENT

1. OpenCode permissions restrict file operations
2. CI checks: `npm test` and `npm run test:conformance` must pass
3. Code review for constitutional changes
4. Provenance recorded for all changes

---

> **"No action without evidence. No claim without proof. No funding without governance."**
> — FundingOS Constitutional Charter v1.0