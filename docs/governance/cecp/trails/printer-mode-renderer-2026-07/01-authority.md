# 01 — Authority

**Trail:** `printer-mode-renderer-2026-07`  
**Status:** **declared** (authority resolution documentary; no charter.js edits)

## Authority sources

| Source | Role | Tag |
|--------|------|-----|
| `constitution/CHARTER.md` / `engine/constitution/charter.js` | Constitutional SoT | frozen — **not modified** this trail |
| `mrs/adapters/storyforge-boundary/CONTRACT_DIGITAL_PRINT.md` | Print operator contract | **partial** → intake **enforced** |
| `mrs/adapters/storyforge-boundary/governance/surface_contract.json` | PrintSurfaceContract | **enforced** |
| `docs/governance/cecp/DIGITAL_PRINTER_DEPLOYMENT_CHARTER_v1.0.md` | Deployment Charter | **declared** |
| CECP Ω∞ + ESFR protocol | Crew / promotion gate | **partial** (practice; not CI-gated) |

## Invariants (binding for printer)

1. No execution without intent  
2. No state change without evidence  
3. No authority without contract  
4. No rendering without declared surfaces  
5. No print without lineage  

## Boundary

StoryForge Story→PromptSpec remains **SF-owned / declared** — never executed
inside Genblaze or the printer package.
