# AIKI v1.0 Milestone — The First Constitutional Creative Runtime

**Status:** **roadmap** (Drive-G-1)  
**Milestone name:** AIKI v1.0  
**Tagline:** The First Constitutional Creative Runtime  
**Binding:** [`../architecture/ACIPS_ACIRA_AIRS_BINDING.md`](../architecture/ACIPS_ACIRA_AIRS_BINDING.md)

---

## Narrow definition of done

v1.0 ships **exactly one** of each — no more required:

| # | Artifact | Count | Notes |
|---|----------|-------|-------|
| 1 | Constitutional core | **1** | Frozen ACIPS-aligned core (or explicitly mapped Constitution subset) |
| 2 | Ontology | **1** | Single domain ontology |
| 3 | Profile | **1** | One composable profile |
| 4 | Genome | **1** | One genome binding profile + ontology |
| 5 | Knowledge graph | **1** | One KG instance |
| 6 | Generator | **1** | One generator behind AIRS (model-swappable) |
| 7 | Validator | **1** | One validator path |
| 8 | Provenance record | **1** | One end-to-end provenance chain |
| 9 | Published artifact | **1** | One published output with lineage |

Anything beyond this table is **post-v1.0** unless demoted into this set by replacing an existing slot (still one of each).

---

## Explicit non-goals for v1.0

- Multi-universe / federation
- Conformance suite productization
- Registry network
- Commercial signup / billing
- Claiming **enforced** reproducibility without frozen hashes + tests
- Hardware performance claims
- Rewriting Mandala engine or merging Sovereign X CCS

---

## Relationship to current tree (honest)

| Existing piece | Maps to v1.0? | Evidence tag |
|----------------|---------------|--------------|
| Constitution v0.1 + mission lock | Candidate input to constitutional core — not frozen ACIPS | **declared** |
| CKO-0001 + replay/validators | Educational E2E scaffold — **not** the v1.0 constitutional creative demonstrator | **skeleton** / **partial** |
| IPI stubs | Directionally supports runtime independence | **skeleton** |
| ACIPS / ACIRA / AIRS standalone specs | Not yet written as frozen standards | **declared** / **roadmap** |
| Full Studio loop (ontology → genome → KG → generate → validate → publish) | **Not built** as one constitutional path | **roadmap** |

**Verdict:** v1.0 demonstrator is **docs-guided roadmap**. Pipeline code exists for CKO reproducibility scaffolding; it does **not** yet implement the nine-slot constitutional creative runtime.

---

## Acceptance mindset

Promote any slot from **roadmap** → **partial** → **enforced** only with tests and runtime gates in the same change (Drive-G-1).
