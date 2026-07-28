# CECP Trail: genblaze-byok-session-2026-07

**Status:** Review → **PROMOTE_WITH_GAPS**  
**Author:** MRS Crew (Architect Sage/Strategist · Builder Constructor · Implementor Compiler · Reviewer Boundary-Guardian · Inspector Sentinel · ESFR Anchor)  
**Domain:** Genblaze Media — local-first BYOK (stills + assist)  
**Config:** `1A session-only`, stills+assist, hosted BYOK off unless `GENBLAZE_ALLOW_BYOK=1`

## Modes applied (representative; full 60 consulted)

| Stage | Modes |
|-------|--------|
| Architect | Sage + Strategist + Boundary-Guardian |
| Builder | Constructor + Blueprint |
| Implementor | Compiler + Integrator |
| Reviewer | Scholar + Conformance |
| Inspector | Sentinel + Testwright |
| ESFR | Anchor |

Vendor skills consulted for honesty: `nvidia-gpu-assist`, `nvidia-skill-finder` (catalog), `dynamo-troubleshoot` layering — **no live CUDA/HIP claims**.

## Artifacts

| Path | Role |
|------|------|
| `mrs/apps/genblaze-media/app/byok.py` | Policy + request settings resolve |
| `mrs/apps/genblaze-media/app/config.py` | `allow_byok` / `GENBLAZE_ALLOW_BYOK` |
| `mrs/apps/genblaze-media/app/main.py` | Wire stills + assist; reject video BYOK |
| `mrs/apps/genblaze-media/app/static/index.html` | Settings panel + sessionStorage |
| `mrs/apps/genblaze-media/tests/test_byok.py` | 7 tests |
| `01`–`06` stage notes below |

## Constitutional guarantees

- Keys: browser `sessionStorage` only (client); server never persists BYOK keys.
- Hosted Render: BYOK denied unless `GENBLAZE_ALLOW_BYOK=1`.
- Scope: stills + assist (`/api/generate`, image-to-scene, rt4d-to-nvidia, face-creation-assist).
- Video / polish: BYOK headers rejected.
- Never attach keys to Digital Printer / `cpu.rt4d.print` evidence.
- UI adapted to existing static Genblaze SPA (not a separate React app).

## Gaps

- Face Creation UI visualizer / CharacterSpec panel not fully rebuilt as React components (static HTML settings + existing assist API).
- Paid model catalog is a datalist hint only — access depends on the user's key.
- No XSS hardening beyond sessionStorage warning (local trusted machine assumed).

## Related Genblaze docs

- [`docs/genblaze/security/byok-security-charter.md`](../../../genblaze/security/byok-security-charter.md)
- [`docs/genblaze/security/byok-threat-model.md`](../../../genblaze/security/byok-threat-model.md)
- [`docs/genblaze/security/byok-audit-checklist.md`](../../../genblaze/security/byok-audit-checklist.md)
- [`docs/genblaze/security/genblaze-security-whitepaper.md`](../../../genblaze/security/genblaze-security-whitepaper.md)
- [`docs/genblaze/pipeline/byok-assisted-pipeline.md`](../../../genblaze/pipeline/byok-assisted-pipeline.md)
- [`docs/genblaze/capabilities/nim-capability-charter.md`](../../../genblaze/capabilities/nim-capability-charter.md)
- [`docs/genblaze/operators/operator-handbook.md`](../../../genblaze/operators/operator-handbook.md)
- [`docs/genblaze/governance/genblaze-governance-constitution.md`](../../../genblaze/governance/genblaze-governance-constitution.md)
- Lineage: `sovereign-x/lineage/sceneSpecLineageTracker.js`
- CLI: `npm run sx:capabilities -- inspect-nim`

## ESFR

**PASS_WITH_GAPS** / **PROMOTE_WITH_GAPS** — BYOK policy enforced in tests; security charter + threat model + operator handbook landed; live NIM with user key remains operator-verified.

