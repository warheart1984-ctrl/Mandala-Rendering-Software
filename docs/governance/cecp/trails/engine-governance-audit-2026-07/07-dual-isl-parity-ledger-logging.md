# 07 — Dual ISL, multihost parity, ledger browser guard, logging

**Trail:** `engine-governance-audit-2026-07`  
**Date:** 2026-07-29  
**Roles:** Architect (ADR closure) · Implementor · Reviewer · Inspector · ESFR

## 1. Gap status matrix

| Gap | Before | After | Evidence |
| --- | --- | --- | --- |
| **G1 Dual ISL (JS vs C#)** | Informational only (`INVENTORY_AUDIT` M3) | **Closed (SoT documented + fixture parity)** | `ISL_SOT.md`, `isl-canonical-fixtures.json`, `isl-canonical-parity.test.js`; C# remains **partial** mirror (`IslEngine.cs` + `IslEngineTests.cs`) |
| **G2 Unity/Unreal governance parity** | Mixed README claims | **Closed (matrix only — no fake enforced)** | Matrix §2; JS CKL/GK **enforced** in Node; Unity/Unreal CKL **partial** (Play Mode / PIE not in CI) |
| **G3 Browser `loadLedger()` / Node APIs** | Dynamic import in monolithic `ledger.js`; CssvRegistry static-imported ledger | **Closed (split + lazy persist)** | `ledgerPaths.js`, `ledgerNode.js`, `CssvRegistry` lazy import; `ledger.browser.test.js`; browser uses `persist:false` + export/sync |
| **G4 Structured governance/CSSV logging** | `console.warn` on NDJSON skip in ledger | **Closed (partial — injectable, default no-op)** | `engine/logging/injectableLogger.js`; `ledgerNode` uses `logStructured`; governance hot path still has **no** console |

## 2. Unity / Unreal governance parity (honest matrix)

| Capability | Browser JS adapter | Node governance tests | Unity plugin | Unreal plugin |
| --- | --- | --- | --- | --- |
| Load `default.policies.json` | **enforced** (fetch / file URL) | **enforced** | **partial** (StreamingAssets / repo path) | **partial** (embedded + file) |
| CKL evaluate (7 policies) | **enforced** | **enforced** | **partial** (mirror, manual Play Mode) | **partial** |
| GK execute pipeline | **enforced** | **enforced** | **partial** | **partial** |
| ISL → intent | **enforced** (IslParser/Interpreter) | **enforced** | **partial** (IslEngine subset) | **partial** (FIslEngine) |
| 16/16 conformance profile | **enforced** (`test:conformance`) | **enforced** | **skeleton** (UnityRuntimeAdapter exists; no CI) | **skeleton** (UnrealRuntimeAdapter; no CI) |
| HostConstitutionalRouter | **enforced** (JS bridges + tests) | **enforced** | **skeleton** (`HostConstitutionalBridge`) | **skeleton** |
| CSSV ledger persist | **partial** (export/download/sync) | **enforced** (Node ledger) | **partial** (C# registry) | **partial** |
| GPU print / Genblaze flags | **enforced** deny assist-only | **enforced** | **partial** (mirror stubs) | **partial** |

**Promotion rule:** Unity/Unreal stay **partial** or **skeleton** until Play Mode / PIE conformance runs in CI with the same 16 checks as `scripts/test-conformance.mjs`.

## 3. ADR — ISL SoT

- **Decision:** JS `IslParser.js` + `IslInterpreter.js` + `scripts/*.isl.js` are the only ISL SoT.
- **Consequence:** C#/C++ parsers are fixture-aligned **partial** mirrors; no AST codegen in this pass.
- **Won't-fix:** Auto-sync Unity `IslEngine.cs` copy (namespaces differ); manual mirror when engine C# changes.

## 4. ADR — CSSV ledger split

- **Decision:** `ledgerPaths.js` (browser-safe) + `ledgerNode.js` (Node-only, guarded) + `ledger.js` barrel for Node scripts.
- **Consequence:** `CssvRegistry` never static-imports Node persistence; `loadLedger()` throws outside Node with actionable message.

## 5. Files touched (implementor manifest)

| File | Change |
| --- | --- |
| `engine/cssv/ledgerPaths.js` | **added** — pure paths |
| `engine/cssv/ledgerNode.js` | **added** — Node ops + guard |
| `engine/cssv/ledger.js` | **refactor** — re-export barrel |
| `engine/cssv/CssvRegistry.js` | lazy `ledgerNode` for persist |
| `engine/logging/injectableLogger.js` | **added** |
| `engine/scripting/ISL_SOT.md` | **added** |
| `engine/scripting/isl-canonical-fixtures.json` | **added** |
| `engine/scripting/ISL_V2_GRAMMAR.md` | SoT cross-link |
| `engine/scripting/test/isl-canonical-parity.test.js` | **added** |
| `engine/cssv/test/ledger.browser.test.js` | **added** |
| `engine/logging/test/injectableLogger.test.js` | **added** |

Protected paths: **unchanged** (`constitution/`, `AGENTS.md`, policies, conformance profile).

## 6. Test plan (executed by foreman)

```text
node --test engine/governance/test/*.test.js
node --test engine/scripting/test/isl-canonical-parity.test.js
node --test engine/cssv/test/ledger.browser.test.js
node --test engine/logging/test/injectableLogger.test.js
npm run test:conformance
```

## 7. Reviewer / conformance

- No policy JSON edits; CKL behavior unchanged except ledger logging path.
- Conformance 16/16 required post-change.

## 8. Inspector acceptance

- [x] SoT documented with tests
- [x] Browser boot path (`js/engine/boot.js`) unchanged API; CssvRegistry `persist: false`
- [x] No new “enforced” labels on Unity/Unreal hosts

## 9. ESFR — PromotionEligibility

**PROMOTE_WITH_GAPS**

| Dimension | Note |
| --- | --- |
| Constitutional model | SoT + fixtures align with Drive-G-1 |
| Governance methodology | CECP trail complete through 07 |
| Reference implementation | JS **enforced**; multihost **partial** |
| Platform engineering | Ledger split reduces bundler risk |
| Commercial operations | N/A |

**Residual gaps:** Unity/Unreal CI conformance; optional dotnet ISL fixture runner wired to same JSON; Camera4D stray `createIslEngine` not removed (documented only).
