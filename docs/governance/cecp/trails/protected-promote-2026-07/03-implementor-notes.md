# 03 — Implementor notes

**Trail:** `protected-promote-2026-07`  
**Role:** Implementor  
**Date:** 2026-07-28

## Changes landed

### Protected

1. **`AGENTS.md`** — §I distinguishes agent norms vs charter.js status (P1–P3 **enforced**, P4 **partial**, P5 **declared**). §II lists actual severities (critical/high/medium). Acknowledgment updated.
2. **`constitution/CHARTER.md`** — ISL organ + scripting → **partial**; Unity/Unreal CSSV/movie/scaffold → **skeleton**; cinematic host path **skeleton**; browser host tag Drive-G-1; authority evidence cites CKL contract check.
3. **`engine/constitution/status.md`** — Drive-G-1 tags only; GPU **68** tests / **12** modules; GPU Assist **partial**; hosts **skeleton**.
4. **`engine/governance/policies/default.policies.json`** — authority message clarifies registered contract (severity unchanged).

### Non-protected (required for evidence)

5. **`ConstitutionalKnowledgeLayer.js`** — `actor_has_contract` uses `CONTRACTS` existence; when `intent.action` / `authorizedAction` set, calls `resolveAuthority`.
6. **`ckl.test.js`** — unknown actor deny; unauthorized/authorized action cases.
7. **`BrowserRuntimeAdapter.js`** — probe actor `runtime.browser` → `4dce.renderer` so CKL contract check passes 16/16.

### Not modified (already aligned)

- `engine/constitution/charter.js` (ISL organ already **partial**; P1–P3/P4/P5 correct)
- `engine/constitution/contracts.js`
- `engine/conformance/default.conformance-profile.json`

## Tests run

- `npm run test:governance` → 166 pass / 0 fail
- `npm run test:conformance` → 16/16
- GPU unit suite → 68 pass
- ConstitutionalLinter → 0 issues
