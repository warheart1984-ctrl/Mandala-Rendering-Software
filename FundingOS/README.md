# FundingOS — AI-Operated Funding Department

**Constitutional Authority:** FundingOS v1.0 / MRS 4DCE v1.0

FundingOS is an AI-operated funding department with integrated Mandala Rendering System (MRS) Crew capabilities for rendering, narrative generation, and audio production.

## Architecture

```
FundingOS/
├── constitution/           # Constitutional charter
├── engine/
│   ├── constitution/       # Machine-readable charter + 25 contracts
│   ├── governance/         # GK, CKL, CSE, ProvenanceRecorder, policies
│   ├── conformance/        # ~30 conformance checks
│   ├── mrs-crew/           # MRS Director Adapter + Registry + Capabilities
│   └── skills/             # Vendor skills loader + registry
├── agents/
│   ├── discovery/          # scout, market-intelligence, policy-watch
│   ├── strategy/           # strategy, portfolio, priority
│   ├── preparation/        # proposal, budget, documentation
│   ├── compliance/         # eligibility, compliance, audit
│   ├── execution/          # submission, calendar, communication
│   └── stewardship/        # award, reporting, performance
├── modes/                  # standard, sage, full
├── skills/                 # Skills system entry point
├── cli/                    # FundingOS CLI
└── test/                   # Conformance + integration tests
```

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run CLI
npm run fundingos -- discover --query "NSF AI grants"
npm run fundingos -- prepare --topic "AI Research" --mrs-crew
npm run fundingos -- mrs --full-pipeline "Grant Proposal"

# Run tests
npm run test
npm run test:conformance
```

## Modes

| Mode | MRS Crew | Vendor Skills | Sage Reasoning |
|------|----------|---------------|----------------|
| `standard` | ❌ | ❌ | ❌ |
| `sage` | ❌ | ❌ | ✅ |
| `full` | ✅ | All | ✅ |

```bash
# Use full mode with MRS crew
fundingos discover --query "AI grants" --mode full
fundingos prepare --topic "Research" --mrs-crew
```

## MRS Crew Capabilities

The MRS Crew provides 7 capabilities to FundingOS agents:

| Capability | MCP Tool | Description |
|------------|----------|-------------|
| 4D Rendering | `render_rt4d_preview` | Proposal visualizations |
| Narrative | `storyforge_build_narrative` | Grant narratives |
| Full Pipeline | `storyforge_full_pipeline` | Narrative → beats → audio |
| Beat Scoring | `beatbox_score_narrative` | Narrative analysis |
| Audio Mixing | `speakers_mix_audio` | Pitch presentations |
| Adaptive Scoring | `compute_engine_spiral_state` | Dynamic scoring |
| Knowledge Query | `query_knowledge_platform` | Grounded research |

## Agent Divisions (25 Total)

**FundingOS Agents (18):**
- Discovery: scout, market-intelligence, policy-watch
- Strategy: strategy, portfolio, priority
- Preparation: proposal, budget, documentation
- Compliance: eligibility, compliance, audit
- Execution: submission, calendar, communication
- Stewardship: award, reporting, performance

**MRS Crew Agents (7):**
- mrs.director, mrs.architect, mrs.builder, mrs.implementor, mrs.inspector, mrs.reviewer, mrs.engineer-standards

## Vendor Skills

All 25+ skills from `.opencode/skill/` loaded automatically:
- AWS: Bedrock, CDK, CloudFormation, Compute, Containers, Deployment, etc.
- GPU: NVIDIA, HIP/ROCm, TAO, cuTile
- Other: RAG Blueprint, Omniverse, Dynamo, Launch with AWS

## Constitutional Governance

- **7 Principles** (P1-P7)
- **16 Policies** (funding + MRS + cross-domain)
- **~30 Conformance Checks**
- **Complete Evidence Chains** for all operations
- **Provenance Recording** for funding + MRS operations

## Development

```bash
# Lint
npm run lint

# Type check
npm run typecheck

# Test
npm run test

# Conformance
npm run test:conformance
```

## License

MIT