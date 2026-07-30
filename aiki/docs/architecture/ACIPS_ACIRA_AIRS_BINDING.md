# Binding near-term guidance — ACIPS / ACIRA / AIRS / AIKI Studio

**Status:** **declared** (Drive-G-1) — architectural agreement captured as binding guidance; not runtime-enforced.  
**Date:** 2026-07-30  
**Source:** Alignment thread (Dar-z Morris ↔ Jon Halstead) on AIKI architectural framing.  
**Mode:** evidence-strict — this document must not outrun implementation evidence.

This file is **near-term binding** for AIKI work: it freezes vocabulary, layer separation, Formation, and the v1.0 milestone scope. It does **not** invent a full ecosystem, registry, federation, or hardware/quantum claims.

---

## 1. Layer separation (implementation-independent)

| Layer | Name | Role | Status (2026-07-30) |
|-------|------|------|---------------------|
| **ACIPS** | Constitutional IP Standard | Normative specification for governed IP / creative constitution | **declared** |
| **ACIRA** | Reference Architecture | Architecture that realizes ACIPS without prescribing one engine | **declared** |
| **AIRS** | Runtime Specification | Runtime contracts for generation, validation, provenance, publication | **declared** / **roadmap** (spec text not yet frozen as a standalone artifact) |
| **AIKI Studio** | Reference implementation | One concrete implementation of ACIRA + AIRS; not the only permitted implementation | **skeleton** (existing CKO pipeline / CLI under `aiki/`; not the full v1.0 constitutional creative runtime) |

Rules:

1. Specs (ACIPS) are independent of any one studio, model, or host OS.
2. Architecture (ACIRA) may cite runtimes without requiring them.
3. Runtime (AIRS) must stay **engine- and model-interchangeable**.
4. Studio is a **reference**, not the standard.

Related existing surfaces in this tree (do not conflate with full ACIPS/ACIRA/AIRS freeze):

- Constitution v0.1 — **declared** — `docs/charter/CONSTITUTION.md`
- Inference Provider Interface — **declared** / **skeleton** — `docs/architecture/INFERENCE_PROVIDER_INTERFACE.md`
- CKO Phase 1 schema — **declared** / **partial** — `docs/schemas/CKO_PHASE1.md` + `pipeline/` validators

---

## 2. Universe lifecycle — Formation phase

Canonical phase order (guidance):

> Idea → Evidence → **Formation** → Constitution → Ontology → Profiles → Genomes → Knowledge Graph → Generation → Validation → Publication → Evolution

**Formation** sits **before** anything becomes canonical. No Constitution, ontology, profile, genome, or published artifact may be treated as canonical without a Formation Record (or an explicit, versioned exemption recorded with provenance).

### Formation Record

A **Formation Record** is the permanent origin record for a universe / constitutional creative domain. Minimum fields (normative intent — schema freeze still **roadmap**):

| Field | Intent |
|-------|--------|
| Purpose | Why this universe exists |
| Scope | What is in / out |
| Stewardship | Who may evolve it |
| Evidence | What justified formation |
| Provenance | How the record itself was authored and linked |

Stub for this project: [`../formation/AIKI_FORMATION_RECORD.md`](../formation/AIKI_FORMATION_RECORD.md) (**declared**).

---

## 3. Standing principles

| Principle | Meaning | Status |
|-----------|---------|--------|
| Composable profiles / extensions | Profiles and extensions compose; core stays small | **declared** |
| Conformance as differentiator | Canon, identity, relationships, provenance, continuity, publication | **roadmap** (suite not built) |
| Runtime independence | Models and engines are interchangeable behind AIRS | **declared** (IPI stubs exist; no live multi-provider enforcement) |
| Long-term aim | Constitutional infrastructure for governed IP | **roadmap** |

---

## 4. Immediate roadmap (priority order unchanged)

| # | Work item | Status |
|---|-----------|--------|
| 1 | Freeze constitutional core | **declared** / in progress (Constitution v0.1 exists; ACIPS freeze not done) |
| 2 | Freeze reference architecture | **declared** (this layer model; ACIRA doc freeze not done) |
| 3 | Build reference runtime | **skeleton** / **roadmap** |
| 4 | Ship first end-to-end demonstrator | **roadmap** (CKO-0001 scaffold ≠ v1.0 constitutional demonstrator) |
| 5 | Validate / refine ACIPS, ACIRA, AIRS from that implementation | **roadmap** |
| 6 | Later incremental: conformance suite, registry, federation | **roadmap** |

Do **not** expand item 6 into current scope.

---

## 5. AIKI v1.0 milestone (narrow)

See [`../vision/AIKI_V1.0_MILESTONE.md`](../vision/AIKI_V1.0_MILESTONE.md).

**Title:** The First Constitutional Creative Runtime  
**Scope:** exactly one of each — core, ontology, profile, genome, knowledge graph, generator, validator, provenance record, published artifact.  
**Non-scope:** multi-universe federation, full conformance suite, commercial SaaS, hardware TFLOPs claims.

---

## 6. Relationship to other Drive-G projects

| Project | Relationship |
|---------|----------------|
| **Sovereign X Constitutional Compute** (`G:\Sovereign-X-Constitutional-Compute`) | Sibling constitutional *patterns* (intent → authority → provenance → ledger). Cross-reference only — **do not merge** products or claim CCS implements ACIPS. |
| **Mythar** (`G:\mythar`) | Adjacent creative / reconstruction stack; not AIKI Studio. |
| **Mandala Rendering Software** (host repo) | AIKI lives under `aiki/`; MRS protected paths (`constitution/`, `engine/constitution/`, etc.) are **out of scope** for AIKI doc work. |
| **LineageStudio** (`G:\LineageStudio`) | Preferred agent/skills/modes protocol for AIKI work (`ls-*`), not Mandala `mrs-crew`. |

---

## 7. Non-claims

- ACIPS / ACIRA / AIRS are **not** published standards with conformance tests.
- AIKI Studio is **not** a complete constitutional creative runtime.
- CKO-0001 reproducibility is **not** **enforced** until publish freeze (see RBC-0001).
- No GPU / photonic / quantum enforcement is claimed here.
