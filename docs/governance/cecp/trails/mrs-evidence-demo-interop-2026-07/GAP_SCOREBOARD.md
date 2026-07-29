# Gap scoreboard (honest)

Source trails: `mrs-whole-gap-scan-2026-07`, `engine-governance-audit-2026-07`, `idac-stack-2026-07`, `mrs-blockers-clear-2026-07`.

| Area | Item | Status | Evidence |
|------|------|--------|----------|
| Demo | prompt→replay Node script | **enforced** | `npm run demo:evidence-pipeline` |
| CKL↔CSE | Orchestrator wires GK+CSE | **enforced** | `orchestrator.test.js` |
| CKL↔CSE | GK.evaluateIntent delegates to CSE | **partial** | `gk.cse` stored only |
| ExecutionOrchestrator | JS tests | **enforced** | new test file |
| ExecutionOrchestrator | C# Unity/Unreal | **skeleton** | `.cs`/`.cpp` mirrors |
| C# parity | GovernedWorldLoader, ISL | **partial** | uncommitted deltas in branch |
| Browser parity | Conformance 16/16 | **enforced** | `test:conformance` |
| CSSV ledger Node/browser split | ledgerPaths + ledgerNode | **partial** | audit H3 fixes in tree |
| IDAC certification | W-TILE-FAITHFUL operational | **partial** | dispatch committed; checklist false |
| Genblaze | HTTP full E2E in demo | **optional** | curl documented in DEMO.md |
| Interop | Shared evidence envelope | **partial** | v1 sample artifact |
| ISL dual SoT | JS vs C# | **partial** | fixtures + ISL_SOT.md in tree |

**Promotion signal (operator):** two runtimes producing equivalent `mrs-evidence-package` + passing the same conformance suite — today only the **Node/browser constitutional stack** meets that bar for governance replay; render hosts remain partial.
