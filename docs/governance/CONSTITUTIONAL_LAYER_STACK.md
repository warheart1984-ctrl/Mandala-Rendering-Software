# Constitutional Layer Stack (MRS framing)

> **Status:** Framing document. CECP row is **partial** in MRS (protocol + skills +
> reference trails). CHEA / CCR / CDGF are **declared** only — repo search (2026-07)
> found **no** CHEA, CCR, or CDGF specs, packages, or tests under this tree.
>
> **Authority:** Drive-G-1 (evidence-bound claims) · Drive-G-2 (maturity dimensions).
> This file does **not** amend `constitution/CHARTER.md` or `AGENTS.md`.

---

## Purpose

Record the emerging four-layer stack without inventing false enforcement. Layers
separate **how engineering is performed**, **where execution occurs**, **what
capabilities are legitimate**, and **operational legitimacy**.

Prefer accumulating evidence-backed CECP references (see
`docs/governance/CECP_OMEGA_PROTOCOL.md` §9) over one-off features.
`PASS_WITH_GAPS` is intended constitutional behavior: accept with listed gaps,
then promote via later trails. **ESFR** (CECP stage 06;
`docs/governance/esfr/`) gates promotion across this stack; CHEA / CCR / CDGF
checks remain **declared** until those layers have in-repo artifacts.

---

## Layer status table

| Layer | Concern | MRS status | Evidence in this repo |
|-------|---------|------------|------------------------|
| **CECP Ω∞** | *How* engineering is performed — six-role crew (incl. ESFR stage 06) + permanent evidence trails | **partial** | `docs/governance/CECP_OMEGA_PROTOCOL.md`; `docs/governance/esfr/`; `.cursor/skills/mrs-*`; trails under `docs/governance/cecp/trails/` (Prompt→Scene #1, Proton Raster #2, follow-ons) |
| **CHEA Ω∞** | *Where* execution occurs — execution / host / arena topology | **declared** | No CHEA-named docs or code found (2026-07 search) |
| **CCR** | *What* capabilities are legitimate — capability constitution / rights | **declared** | No CCR-named docs or code found |
| **CDGF** | Operational legitimacy — deployment / governance fabric for ops | **declared** | No CDGF-named docs or code found |

Do not claim CHEA / CCR / CDGF as **enforced** or **partial** until each has
in-repo artifacts (specs, tests, or trails) with claim↔evidence rows.

---

## Separation of concerns (declared shape)

```text
CECP Ω∞     crew workflow + evidence trails          (how we build)
    ↓ produces governed references / contracts
CHEA Ω∞     execution venue / host topology          (where it runs)     [declared]
    ↓ hosts capabilities under authority
CCR         legitimate capability surface            (what may run)      [declared]
    ↓ constrained by operational policy
CDGF        operational legitimacy / ops fabric      (how ops is lawful) [declared]
```

CECP does **not** replace CHEA/CCR/CDGF. Shipping a CECP trail does not imply
CHEA hosts, CCR rights, or CDGF ops gates exist.

---

## Relation to MRS constitutional engine

MRS already has charter / CKL / ProvenanceRecorder / conformance checks under
`constitution/` and `engine/` (**enforced** for those subsystems by their own
tests). That engine is **not** renamed CHEA/CCR/CDGF here. Mapping those names
onto existing engine modules is **declared** future work and must not overclaim.

---

## Dimensional Compression (companion methodology)

**Declared** compression law across Arena → Invariant → Execution layers:
[`DIMENSIONAL_COMPRESSION.md`](./DIMENSIONAL_COMPRESSION.md). It explains how
CIEMS / MRS reduce unbounded possibility without dropping trust invariants.
It is **not** a fifth stack organ and does **not** amend the charter. Applied
worksheets: `cecp/trails/dimensional-compression-2026-07/`.

---

## References

| Doc | Role |
|-----|------|
| `docs/governance/CECP_OMEGA_PROTOCOL.md` | CECP protocol + reference registry |
| `docs/governance/DIMENSIONAL_COMPRESSION.md` | Principle of Dimensional Compression (**declared**) |
| `docs/governance/esfr/` | ESFR ship gate (protocol, contract, promotion, pipeline v2, matrix, probes, lineage seed) |
| `docs/governance/esfr/pipeline.cecp-v2.md` | CECP v2.0 crew pipeline diagram (incl. ESFR) |
| `docs/governance/cecp/trails/prompt-scene-adapter-2026-07/` | CECP reference #1 |
| `docs/governance/cecp/trails/proton-raster-2026-07/` | CECP reference #2 |
| `docs/governance/cecp/trails/dimensional-compression-2026-07/` | Dimensional Compression trail + applied exercise |
| `docs/governance/cecp/EVIDENCE_TRAIL_TEMPLATE.md` | Trail template |
| `AGENTS.md` | Agent lawbook (P1–P5); not amended by this file |
