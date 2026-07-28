# Cursor local setup (from pack)

**Shared agent SoT:** `mandala-agent-pack/` (tracked in git).  
**Local IDE config:** `.cursor/` (gitignored — not shared SoT).

## Why

Operators prefer not to track IDE-local Cursor config. Mandala Mode agents/skills that previously lived under `.cursor/` are regenerated from the pack (and MRS crew skills under `.cursor/skills/` remain local copies).

## Regenerate operational six agents

1. Read the 14→6 map: `docs/governance/cecp/MANDALA_SIX_AGENTS.md`
2. Copy or symlink pack prompts into local Cursor agents as needed:

```text
mandala-agent-pack/prompts/agent-role-prompts/*.txt
  → .cursor/agents/<six-agent-name>.md   (operator-local)
```

3. Optional Mandala Mode rule (local only):

```text
Copy guidance from docs/governance/cecp/MANDALA_SIX_AGENTS.md
  → .cursor/rules/mandala-mode.mdc
```

4. MRS crew skills (architect…ESFR) are local Cursor skills; keep copies under `.cursor/skills/` if you use Mandala Mode crew lenses. They are **not** required in git.

## Tooling (not under `.cursor/`)

| Tool | Canonical path |
|------|----------------|
| Constitutional linter | `mandala-agent-pack/lint/run-lint.js` |
| Drift radar | `mandala-agent-pack/drift-radar/generate-report.js` |
| Auto-fix | `mandala-agent-pack/auto-fix/auto-fix.js` |

Legacy `mandala-agent/` and `scripts/mandala-lint/` are removed; do not resurrect dual roots.
