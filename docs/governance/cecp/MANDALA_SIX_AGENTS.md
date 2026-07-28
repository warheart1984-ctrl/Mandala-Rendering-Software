# Mandala Six Operational Agents

> **Status:** **declared** / **partial** — operational Cursor agents folding the 14-agent corpus.
> Skill catalogs are checklists (see `mandala-agent-pack/manifests/skills.json`), **not** 312 executable `SKILL.md` files.
> Does **not** amend `AGENTS.md` or constitutional SoT without explicit authorization.

## Sources of truth

| Artifact | Role |
|----------|------|
| `mandala-agent-pack/manifests/skills.json` | Landed skill ID corpus (user paste) |
| `mandala-agent-pack/manifests/agents.yaml` | 14-agent YAML descriptions |
| `docs/governance/AGENT_SKILL_SPEC.md` | Declared 14×312 inventory (may be fuller than JSON paste) |
| `mandala-agent-pack/manifests/personality.json` | Exact personality object |
| `mandala-agent-pack/manifests/mandala-mode.yaml` | Mandala Mode toggle |
| `.cursor/agents/*.md` | Six operational agents |
| Crew modes | `docs/governance/cecp/CREW_MODES.md`, `CECP_ACTOR_MODES.md`, `SOFTWARE_CREATION_MODES.md` |

**Skill count honesty:** landed `skills.json` currently enumerates **173** skill IDs across 14 agents (truncated user paste). `AGENT_SKILL_SPEC.md` declares **312**. Treat JSON as operational catalog; SPEC as fuller declared inventory.

## 14 → 6 mapping

| # | Six agent (Cursor file) | Owns (14) | Approx. skill IDs in JSON |
|---|-------------------------|-----------|---------------------------|
| 1 | `constitutional-governance.md` | ConstitutionalGovernance + ConstitutionalCompliance | 32 + 8 |
| 2 | `gpu-webgpu-rendering.md` | GPUWebGPU (+ renderer GPU encode/mesh bits of RendererCore) | 26 (+ GPU-ish from RendererCore) |
| 3 | `security-genblaze-byok.md` | SecurityHardening + Genblaze | 16 + 15 |
| 4 | `conformance-replay-provenance.md` | Conformance + Replay + Provenance | 7 + 6 + 5 |
| 5 | `multihost-renderer-core.md` | RendererCore (non-GPU) + MultiHost | 14 + 7 |
| 6 | `docs-ci-quality-tests.md` | Documentation + CI + CodeQuality + TestGeneration (+ compliance test gen) | 10 + 7 + 8 + 12 |

CECP pipeline roles (Architect→ESFR) remain separate — see `.cursor/skills/mrs-crew/`. Modes are lenses on either CECP roles or these six domain agents.

## Mode matrix (recommended)

| Six agent | Crew modes | Actor modes | Software-Creation modes |
|-----------|------------|-------------|-------------------------|
| Constitutional Governance | Sage, Sentinel, Scholar | Anchor, Architect-Shadow | Runtime-Sage, Conformance, Schema-Artist |
| GPU / WebGPU | Physicist, Artisan, Researcher | Artisan-Logic, Frontier | Render-Physicist, Optimizer, Debugger |
| Security & Genblaze/BYOK | Trickster, Sentinel, Warrior | Mirror, Strategist | Boundary-Guardian, System-Sentinel, Runtime-Sage |
| Conformance · Replay · Provenance | Sentinel, Historian, Researcher | Librarian, Anchor | Conformance, Testwright, Code-Historian |
| Multi-Host · Renderer-Core | Cartographer, Diplomat, Monk | Navigator, Interface* | Integrator, Modularist, Boundary-Guardian, Protocol |
| Docs · CI · Quality · Tests | Scholar, Journalist, Bard | Librarian, Catalyst | Forge, Testwright, Pipeline-Conductor, Versioneer |

Compose: one primary mode (+ optional Sage). Precedence: **role bans > Constitution > Evidence > Personality > Mode**.

## Hand-off rules

1. Governance drift → Constitutional Governance
2. WebGPU/GPU flags → GPU / WebGPU (hand security findings to Security)
3. BYOK / Genblaze / XSS / keys → Security & Genblaze (never claim print SoT)
4. 16/16 checks, replay, provenance → Conformance · Replay · Provenance
5. Package seams / hosts / ESM → Multi-Host · Renderer-Core
6. Docs, CI workflows, tests → Docs · CI · Quality · Tests

## Tooling

Canonical SoT: **`mandala-agent-pack/`** (legacy `mandala-agent/` + `scripts/mandala-lint/` removed).

- Linter: `node mandala-agent-pack/lint/run-lint.js` (**partial**)
- Drift radar: `node mandala-agent-pack/drift-radar/generate-report.js`
- Auto-fix: `node mandala-agent-pack/auto-fix/auto-fix.js` (dry-run default; refuses protected paths)
- Additive CI: `.github/workflows/mandala-agent-ci.yml`
- Local Cursor agents: regenerate from pack — `mandala-agent-pack/docs/cursor-local-setup.md` (`.cursor/` is gitignored)
