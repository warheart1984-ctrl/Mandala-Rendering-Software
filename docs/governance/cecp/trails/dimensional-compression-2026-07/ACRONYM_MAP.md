# Acronym → Repo Map (Dimensional Compression Execution Layer)

| Field | Value |
|-------|-------|
| `trailId` | `dimensional-compression-2026-07` |
| `date` | 2026-07-31 |
| `status` | **partial** (maps evidence; does not invent expansions) |

Doctrine chain (Invariant Layer):

```text
Authority → Validation → Decision → Evidence → Verification → Replay → Audit
```

JACA governance layer tokens (from Genblaze / portfolio doctrine; not a charter amendment):

```text
JCK → JCR → CAR → CDR → CEL → CPE
```

Plus MRS execution organs commonly paired in practice: **CSE**, **CSR**, **CIC**, **CCC**.

Drive-G-1: if an expansion is not found in-repo, say so — do not invent.

---

## Map

| Token | Expansion (evidence-bound) | Closest MRS / portfolio path | Status |
|-------|----------------------------|------------------------------|--------|
| **JCK** | *No expansion found in MRS* — Sovereign X constitutional kernel half (paired with JCR in CRE) | Cited in `mrs/packages/renderer-core/src/gpu/constitution/SX-PTIG.md`, `G:\cre/docs/charter/CONSTITUTION.md` | **declared** token |
| **JCR** | *No formal expansion in MRS* — policy/runtime evaluation surface in Genblaze docs (“JCR evaluation before publish”) | `mrs/apps/genblaze-media/docs/constitutional/ACP-NIM-Cosmos-v1.0.md` (A3 **Not implemented**); CRE kernel pair | **declared** / **skeleton** |
| **CAR** | Constitutional Authority Record / authority binding (CEF usage) | CEF docs under `G:\project-infi/docs/release/cef/`; MRS analogue: `engine/constitution/contracts.js` + CKL `actor_has_contract` | **declared** (CAR name) · authority check **enforced** in browser under other names |
| **CDR** | Constitutional Decision Record | CRE: `G:\cre/docs/charter/CONSTITUTION.md` §4; MRS analogue: CKL/GK decision + CSR `governanceTrace` | CRE **skeleton** · MRS governanceTrace **enforced** on orchestrator path |
| **CEL** | Ambiguous: CEF “Linguistic / Constitutional Evidence” profile **or** Genblaze “conformance profile gate” **or** photoreal Phase-3 `cel.json` | Genblaze ACP A4 **Not implemented**; photoreal loads `cel.json` in `evaluateCertification.js` / dashboard — **no emitter found** this cycle | **declared** / **skeleton** |
| **CPE** | Artifact-class namespace for CIEMS photoreal evidence packets (`CPE-PHR-EVD`, `CPE-SCN-PRV`, …) | `docs/4d-engine/evidence/*_v1.md`, `schemas/ciems/` | Specs **declared** · emitters **partial** |
| **CSE** | Constitutional State Engine | `js/constitution/cse.js` · charter organ | **enforced** (browser governed path) |
| **CSR** | ConstitutionalStateRecord | `schemas/CSR.schema.json` · emitted by CSE / `ExecutionOrchestrator` | **enforced** (governanceTrace conformance) / **partial** elsewhere |
| **CIC** | Constitutional Intent Contract | CRE: `G:\cre/docs/charter/CONSTITUTION.md` §1; MRS thin CIR overlay: `mrs/packages/renderer-core/src/render/rt4d/proton/types.js` | CRE **declared** · CIR overlay **partial** |
| **CCC** | **Homonym — do not collapse** | See below | — |

### CCC disambiguation

| Sense | Expansion | Path | Status |
|-------|-----------|------|--------|
| **CCC-ImageGen** (MRS) | Constitutional Capability Contract (image.gen.provider) | `docs/4d-engine/CCC_IMAGE_GEN.md`, `sovereign-x/governance/ccc-image-gen.json` | **partial** |
| **CCC Continuity** (CRE) | Constitutional Continuity Contract | `G:\cre/docs/charter/CONSTITUTION.md` §2 | **declared** |

---

## Related organs (not in the JACA six, but Execution Layer)

| Token | Expansion | Path | Status |
|-------|-----------|------|--------|
| **CKL** | Constitutional Knowledge Layer | `engine/governance/ConstitutionalKnowledgeLayer.js` | **enforced** (browser) |
| **GK** | Governance Kernel | `engine/governance/GovernanceKernel.js` | **enforced** (browser) |
| **ISL** | Intent Specification Language | `engine/scripting/IslParser.js` | **partial** |
| **CIEMS** | Constitutional Intelligence Execution and Management System | `docs/4d-engine/engine3d/CIEMS_ENGINE3D_CONSTITUTION_v1.0.md` | **declared** (subsystem) |
| **CEC** | Constitutional Evidence Contract | `docs/4d-engine/evidence/CEC_v1.md` | **partial** emitters |
| **PEP / SPR** | Photoreal Evidence Packet / Scene Provenance Record | `docs/4d-engine/evidence/` | **partial** |
| **CIR** | Constitutional Intent Record (thin overlay on Intent) | proton `types.js` CirOverlay | **partial** |
| **IME** | Intuitive Mathematics Engine | `aiki/math/README.md` | **skeleton** |

---

## Compression reading

| Layer | Tokens |
|-------|--------|
| Arena | Unbounded reasoning / media / worlds before these artifacts exist |
| Invariant | Governing chain + JACA order + charter P1–P3 |
| Execution | Rows above that are **enforced** or **partial** — especially CSE/CSR/CKL/CCC-ImageGen/AnimeWorldProfile |
