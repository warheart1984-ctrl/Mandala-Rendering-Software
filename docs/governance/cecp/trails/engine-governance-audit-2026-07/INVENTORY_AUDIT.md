# Engine inventory & governance audit — verification log

**Date:** 2026-07-29  
**Method:** Spot-check against live tree; do not trust pasted line counts alone.

## CRITICAL

### C1 — `cse.test.js` charterVersion vs `charter.js`

| Audit claim | Live evidence | Verdict |
|-------------|---------------|---------|
| Test expects wrong version; should be `1.1.0` | `engine/constitution/charter.js` → `version: "1.0.0"`; `cse.test.js` L335 → `"1.0.0"`; `charter.test.js` asserts `1.0.0` | **Rejected** — no drift; no `1.1.0` anywhere in charter SoT |

**Action:** None (changing to `1.1.0` would *introduce* mismatch).

## HIGH

### H1 — CKL organ status (`charter.js` → `organs.ckl`)

| Before | After | Evidence |
|--------|-------|----------|
| `enforced` | `enforced` (unchanged) | `npm run test:conformance` CKL checks pass; `engine/governance/test/ckl.test.js` + embedded conformance suites in governance tests |

JS CKL loads default policies, evaluates all 7 default policies, `modify_param`, `attach_provenance`, deny-without-intent.

### H1b — `governanceKernel` organ status

| Before | After | Evidence |
|--------|-------|----------|
| `enforced` | `enforced` (unchanged) | `governance-kernel.test.js`, integration “full governed cycle” tests green |

C# / Unity hosts remain **partial**/**skeleton** — charter organ status is **JS runtime** gate label only.

### H2 — CKL `loadDefault()` base path

| Audit claim | Live evidence | Verdict |
|-------------|---------------|---------|
| Hard-coded / cwd-relative path breaks Node | Already used `import.meta.url`; added `options.policiesBaseUrl`, trailing-slash normalization | **Fixed** + 2 tests in `ckl.test.js` |

Browser host: policies still fetched via HTTP `fetch` in browser adapter (`scripts/test-conformance.mjs` stubFetch unchanged).

### H3 — `engine/cssv/ledger.js` Node imports in browser

| Audit claim | Live evidence | Verdict |
|-------------|---------------|---------|
| Top-level `node:fs` crashes browser import | All fs/path/readline via dynamic `import()`; sync `ledgerPaths()` is pure | **Already mitigated** — no split file required |

| Residual: calling `loadLedger()` in browser throws with guard message (expected); import graph safe via `ledgerPaths.js` + lazy `ledgerNode` in `CssvRegistry`. |

### H4 — `evalModifier()` silent zero

| Audit claim | Live evidence | Verdict |
|-------------|---------------|---------|
| Unparseable modifier → `0` | Old code used `?? 0` on missing mul vars; fallback was `env.self ?? 1` | **Fixed** — passes `self: current`; unknown/unparseable returns unchanged; throws if no `self` |

Tests: `modify_param with unparseable modifier…`, `unknown multiplier variable…`.

## MEDIUM

### C2 — `GovernedWorldLoader.cs` empty catch

**Fixed:** `Debug.LogWarning` on `ParseConfig` failure (`engine/world/GovernedWorldLoader.cs`).

### M1 — Structured logging vs `console.warn` in governance

**Not reproduced:** no `console.warn` under `engine/governance/`. CSSV NDJSON skip uses `console.warn` in `engine/cssv/ledger.js` (acceptable **partial** host logging).

### M3 — Dual ISL SoT

**Informational:** Authoritative JS parser: `engine/scripting/IslParser.js` + `IslInterpreter.js`. C# pragmatic subset: `engine/scripting/IslEngine.cs`. Hosts must not treat C# as full v2 parity.

### M4 — C++ Contracts field

**Not found** in live tree grep (`Contracts` in `engine/**/*.cs,cpp,h` → no matches). Treat audit line as stale or out-of-repo; no code change.

## LOW (informational)

| ID | Topic | Note |
|----|-------|------|
| L1 | Render SoT path | Math/render SoT is `mrs/packages/renderer-core/` — not `engine/render/` |
| L2 | Multihost maturity | Unity/Unreal plugins **skeleton**; JS browser adapter **enforced** for conformance profile |
| L3 | CSSV write path | Node-only persistence; browser uses export/download APIs on registry |
| L4 | Policy JSON vs runtime | `default.policies.json` is SoT; CKL evaluation is **enforced** in JS tests only |
