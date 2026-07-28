# CIEMS Lineage Tree — Vendor GPU / Sovereign X Router

**Status:** **declared** canonical lineage map (documentation)  
**Canonical location:** this file under `vendor-gpu-integration-2026-07`  
**Also indexed from:** `sx-router-vNext-2026-08`  
**Date:** 2026-07-28

```text
CIEMS / CECP Ω∞
│
├── sovereign-x-vendor-router-2026-07
│     └── capability ID registration (upstream assist)
│
├── sovereign-x-gpu-assist-2026-07
│     └── A–E assist module / LookDev / charter (declared/partial)
│
├── vendor-gpu-integration-2026-07  ★ Phase 1 Done
│     ├── specs A–E + sovereign-x/ SoT layout
│     ├── ESFR: PASS_WITH_GAPS / PROMOTE_WITH_GAPS
│     ├── ciems-v2-gpu-integration-diagram.md
│     └── ciems-lineage-tree-vendor-gpu.md  (this file)
│
├── sx-router-vNext-2026-08  ★ Roadmap trail
│     ├── Phase 1 → links vendor-gpu-integration-2026-07
│     ├── Phase 2 Draft — deterministic integrator prototype
│     ├── Phase 3 Draft — live assist + non-print plates
│     ├── Phase 4 Draft — determinism promotion hand-off
│     ├── announcement-pr83.md
│     ├── ciems-review-packet-vendor-gpu.md
│     └── sx-router-vNext-architecture-diagram.md
│
└── gpu-determinism-2026-09  ★ Determinism promotion plan (Draft)
      ├── Steps 1–5 (Draft)
      └── seed-contract.md (mulberry32 / stratified) — declared
```

## Authority invariant (all nodes)

```text
gpu.*  ──assistOnly──►  never Digital Printer SoT
cpu.rt4d.print  ──authoritative──►  print evidence chain
```

## Related PR

PR #83 — Phase 1 promotion packet acceptance with documented gaps.
