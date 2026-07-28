# 01 — Architect ADR

**Trail:** `protected-promote-2026-07`  
**Role:** Architect (Sage · Guardian · Anchor)  
**Date:** 2026-07-28

## 1. Intent

Close remaining Drive-G-1 / governance **honesty** gaps so ESFR can issue **PROMOTE** with empty *claim/evidence* residuals. Do not fake Unity/Unreal or live WebGPU maturity — label them **skeleton** / **partial**.

**Authorization:** Operator explicitly authorized protected-path edits (see README).

## 2. ADR

| | |
|---|---|
| **Context** | `e2e-close-gaps-2026-07` left PROMOTE_WITH_GAPS because protected docs overclaimed (AGENTS “all P1–P5 enforced”, “all 7 critical”, CHARTER ISL **enforced** vs charter.js **partial**, status.md non-Drive-G-1 tags + inflated GPU counts, CKL `actor_has_contract` only checked actor presence). |
| **Decision** | Align protected prose to `charter.js` / `default.policies.json` evidence; wire CKL to registered-contract + optional `resolveAuthority` when action set; keep action allow-list on CSE execute. |
| **Consequences** | Conformance probes must use contracted actors (`4dce.renderer`); unknown actors denied at CKL; docs stop overclaiming. |

## 3. Interface

- Inputs: prior audit gaps; machine SoT `charter.js`, policies JSON, contracts.
- Outputs: honest AGENTS/CHARTER/status; CKL contract check; CECP trail; ESFR PROMOTE.
- Bans: no fake hardware/host maturity; no commit/push unless asked; no CHEA/CCR/CDGF “enforced” claims.

## 4. Constitutional boundary

| In scope | Out of scope |
|----------|--------------|
| Protected docs listed in auth | Expanding Unity/Unreal beyond labels |
| CKL + conformance probe actor | Live WebGPU adapter hardware CI |
| CECP trail under `docs/governance/cecp/trails/` | charter.js organ/principle status changes (already correct) |

## 5. File manifest

| Path | Action | Role |
|------|--------|------|
| `AGENTS.md` | Align P1–P5 + policy severities | Implementor |
| `constitution/CHARTER.md` | ISL→partial; Unity/Unreal honesty | Implementor |
| `engine/constitution/status.md` | Drive-G-1 tags; real GPU counts | Implementor |
| `engine/governance/policies/default.policies.json` | Message clarity only | Implementor |
| `engine/governance/ConstitutionalKnowledgeLayer.js` | Real contract check | Implementor |
| `engine/governance/test/ckl.test.js` | New contract tests | Implementor |
| `engine/conformance/BrowserRuntimeAdapter.js` | Contracted actor | Implementor |
| CECP trail files | Create | Foreman / Governance |

## 6. Acceptance criteria

1. AGENTS does not call all five principles charter-**enforced**.
2. AGENTS cites mixed policy severities from JSON.
3. CHARTER ISL organ/subsystem = **partial** (matches charter.js).
4. status.md uses only enforced/partial/declared/skeleton; GPU counts match files.
5. CKL denies unknown actors; optional action uses `resolveAuthority`.
6. `npm run test:governance` pass; `npm run test:conformance` 16/16.
7. ESFR irreducible honesty list empty; hardware/skeleton listed as non-gaps.

## 7. Handoff to Builder

Scaffold trail folder + confirm no charter.js principle/organ edits required.
