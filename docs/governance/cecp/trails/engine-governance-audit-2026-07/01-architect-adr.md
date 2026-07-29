# 01 — Architect ADR

**Trail:** `engine-governance-audit-2026-07`

## 1. Intent

Verify operator-supplied engine inventory audit (C1–L4), apply evidence-bound fixes, record CECP trail, run governance/conformance tests. Explicit authorization: **only** `charter.js` organ status fields for `ckl` / `governanceKernel` if evidence warrants.

## 2. ADR

**Context:** Pasted audit mixed stale line refs with real gaps (evalModifier, loadDefault override, Unity silent catch).

**Decision:** Fix provable JS governance bugs; reject mismatched charter version claim; retain organ `enforced` when 170 + 16/16 pass; document non-fixes with Drive-G-1.

**Consequences:** No charter version bump; no policy JSON / AGENTS / conformance profile edits.

## 3. Interface / boundary

- In scope: `engine/governance/`, `engine/world/GovernedWorldLoader.cs`, tests, CECP trail.
- Out of scope: `default.policies.json`, principles, AGENTS.md, conformance profile.
- Protected paths: untouched except authorized organ status review (no change required).

## 4. Acceptance criteria

- Governance tests pass after fixes.
- `npm run test:conformance` → 16/16.
- Trail documents verified vs rejected findings.

## 5. Handoff

Implementor applies H2/H4/C2 + tests; foreman writes trail stages 03–06.
