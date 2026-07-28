# Mandala Agent Pack

> **Status:** **declared** / **partial** — Cursor-ready corpus + operational six-agent fold.
> **Skills are catalogs/checklists for agents — not 312 executable `SKILL.md` files** unless thin wrappers are added later.

## Layout

```
mandala-agent-pack/
├── agents/           # 14 agent folders (skills.json + thin rules stubs)
├── manifests/
│   ├── skills.json           # landed mandalaAgents skill IDs
│   ├── agents.yaml           # 14-agent YAML
│   ├── personality.json      # MandalaAgentPersonality
│   ├── mandala-mode.yaml     # Mandala Mode toggle
│   └── six-agent-personality.md
├── prompts/
│   ├── activate-all-agents.txt
│   ├── activate-six-agents.txt
│   ├── activate-mandala-mode.txt
│   └── agent-role-prompts/
└── docs/             # thin pointers to real repo docs (Drive-G-1)
```

## Operational six agents

**Shared SoT is this pack** (`mandala-agent-pack/`).  
`.cursor/` is **local-only** (gitignored). Regenerate agents/rules from the pack — see [`docs/cursor-local-setup.md`](docs/cursor-local-setup.md).

Map + mode matrix: `docs/governance/cecp/MANDALA_SIX_AGENTS.md`  
Optional local rule: `.cursor/rules/mandala-mode.mdc` (does **not** edit `AGENTS.md`)

## Skill count honesty

| Source | Count |
|--------|-------|
| Landed `manifests/skills.json` | **173** skill IDs / 14 agents (user paste) |
| `docs/governance/AGENT_SKILL_SPEC.md` | **312** declared inventory |

Prefer JSON for IDs; SPEC for fuller declared checklist.

## Tooling (canonical — this pack)

| Tool | Path | Default safety |
|------|------|----------------|
| Constitutional linter | `mandala-agent-pack/lint/run-lint.js` | report-only heuristics (**partial**) |
| Drift radar | `mandala-agent-pack/drift-radar/generate-report.js` | writes JSON; dashboard needs local serve |
| Auto-fix | `mandala-agent-pack/auto-fix/auto-fix.js` | **dry-run**; refuses protected paths |
| Additive CI | `.github/workflows/mandala-agent-ci.yml` | never `--apply` auto-fix |

Legacy roots `mandala-agent/` and `scripts/mandala-lint/` are **removed** (optional thin wrappers may redirect here). Do not maintain dual copies.

Protected paths (`engine/constitution/`, policies, `AGENTS.md`, …) are **never** auto-written without explicit dangerous flags + human auth.

## Genblaze pointers

- Charter: `docs/genblaze/security/byok-security-charter.md`
- Onboarding: `docs/genblaze/operators/user-onboarding-guide.md`
- Training: `docs/genblaze/operators/operator-training-manual.md`
- UI host: `mrs/apps/genblaze-media/app/static/index.html`
