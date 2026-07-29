# Interop matrix — governance dimensions

Legend: **E** enforced (tests/CI) · **P** partial · **D** declared/skeleton · **B** blocked · **—** not applicable

| System | Intent | Plan | Evidence | Conformance | Notes |
|--------|--------|------|----------|-------------|-------|
| **MRS / 4DCE (Node browser host)** | E | P | P | E | 16/16 via `test:conformance`; demo script adds package v1 |
| **Constitutional engine (`engine/`)** | E | P | P | E | 170+ governance tests; GK.cse store-only **P** |
| **Infinity Director / IDAC** | P | P | P | P | Certification **false**; tile-faithful dispatch **E** @ a0ccfe4 |
| **Genblaze Media** | P | D | P | P | prompt-to-scene **E**; path_trace/501 honesty **E** |
| **Memoryboard** | D | D | D | — | No shared package in this repo; align on `mrs-evidence-package` v1 shape |
| **Mandala (browser demos)** | P | D | P | E | `examples/web-demo` render only; no full CSR loop in UI |
| **Sovereign X / router** | P | D | P | P | `test:sovereign-x-router`; GPU ≠ print |
| **StoryForge / Infinity lane** | P | D | P | — | Optional `PYTHONPATH`; bridge fallback **E** |
| **Unity host** | D | D | D | P | ExecutionOrchestrator **skeleton**; solid smoke via Node substitute |
| **Unreal host** | D | D | D | P | Same as Unity |
| **C# GovernedWorldLoader** | P | D | P | — | Parity work in tree; CI **skeleton** |

## Shared evidence package shape (target)

All systems **may** emit `kind: mrs-evidence-package`, `version: 1` with:

- `phases[]`, `governance`, `provenance`, `replay`, `conformance`
- `render.printSoT: cpu.rt4d` when claiming print evidence

Cross-repo systems (Memoryboard, external StoryForge deploys) should map local receipts into this envelope without claiming certification until conformance probes pass.
