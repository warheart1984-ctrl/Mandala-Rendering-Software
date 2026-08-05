# CDU Reference Architecture (CDU-RA) v0.1

| Field | Value |
|-------|-------|
| **Document ID** | CDU-RA-v0.1 |
| **Version** | 0.1 |
| **Status** | **skeleton** / **declared** |
| **Date** | 2026-08-03 |
| **Authority** | Engineering blueprint documentation — **not** a host-repo constitutional SoT |

> **Evidence-bound notice (Drive-G-1):** This document **declares** an architecture. It does **not** claim runtime enforcement, shipping completeness, or that CIEMS / JCR / MRS / CRE implement these contracts. Where sibling systems exist, treat them as **related** surfaces that may later align — not as proof of CDU-RA enforcement.

---

## 1. Mission & Scope

### 1.1 Mission

**CDU-RA** is the **implementation-agnostic engineering blueprint** for the **Constitutional Discipline Universe (CDU)**. It defines layered responsibilities, constitutional contracts, Mirror subsystem roles, and runtime-governance *requirements* so prose, film, interactive, simulation, games, and education products can share discipline without sharing a single stack.

### 1.2 In scope (v0.1 skeleton)

- Layered architecture naming and responsibility boundaries
- Constitutional contract *shapes* (Identity, Authority, Evidence, Decision, Memory)
- Mirror subsystem role specification (declared)
- Runtime governance requirements (declared — enforcement is a future evidenced claim)
- Medium-agnostic and stack-agnostic requirements

### 1.3 Out of scope (v0.1)

- Binding host-repo charters (`constitution/`, MRS `AGENTS.md`, engine policies)
- Concrete APIs, schemas as SoT, or wire formats
- Claiming CIEMS, JCR, MRS, or CRE *enforce* CDU-RA
- Commercial packaging, pricing, or operator runbooks

### 1.4 Positioning vs related systems

| System | Role relative to CDU-RA |
|--------|-------------------------|
| **CDU-RA** | Broader Discipline Universe **blueprint** (this document) |
| **CCALF** | Learning / competency stewardship framework — related, not identical |
| **MRS / 4DCE / 4DRS** | Rendering + constitutional engine lineage — related; host law remains binding in MRS |
| **CIEMS** | Institutional / product surface — related; may align later |
| **JCR** | Continuity / journal substrate where present — related |
| **CRE** | Reality-engine scaffold where present — related |

Conflicts between CDU-RA and a host charter are **documented, not silently merged**. Host protected paths win for that repository's agents and runtime until an explicit, evidenced supersession decision exists.

---

## 2. Layered Architecture

Layers are **logical**. Implementations may collapse or split modules so long as contracts and evidence boundaries remain auditable.

| Layer | Intent (declared) | Typical concerns |
|-------|-------------------|------------------|
| **Constitutional** | Principles, non-negotiables, charter-level constraints | Law, scope of authority, amendment discipline |
| **Governance** | Policy evaluation, allow/deny/modify, review cycles | Policies, severity, escalation |
| **Identity (CIP)** | Constitutional Identity Protocol — who/what may act | Actors, roles, credentials-as-claims (no secrets in docs) |
| **Evidence** | What counts as proof; dual-evidence and provenance shapes | Receipts, provenance fields, evidence IDs |
| **Decision** | Admissible outcomes given identity + evidence + policy | Verdicts, justifications, supersession |
| **Memory** | Durable continuity of decisions/evidence (not chat dumps) | Ledgers, conflict preservation, archive |
| **Runtime** | Execution under governance — gates before mutation | Intent, replay, deny paths |
| **Narrative Interface** | Human-legible consequences of governance | Story, film, UI, pedagogy — consequences made visible |

```text
Constitutional
      │
Governance ── Identity (CIP)
      │
 Evidence ── Decision ── Memory
      │
   Runtime
      │
Narrative Interface
```

**Status:** layer map is **skeleton**. No claim that any host implements all eight layers.

---

## 3. Constitutional Contracts

Contracts below are **declared shapes**. Field lists are illustrative minimums for future schemas — not ratified SoT.

### 3.1 Identity Contract

| Aspect | Declared requirement |
|--------|----------------------|
| Purpose | Bind every governed action to an actor identity under CIP |
| Must express | Actor id, role/class, authority scope claim, authenticity/provenance of identity assertion |
| Must not | Embed secrets; conflate narrative persona with runtime authority without explicit mapping |

### 3.2 Authority Contract

| Aspect | Declared requirement |
|--------|----------------------|
| Purpose | State what an identity is allowed to request or mutate |
| Must express | Allow-list or capability set; deny semantics; contract id / version |
| Must not | Grant authority from narrative alone; silently expand scope |

### 3.3 Evidence Contract

| Aspect | Declared requirement |
|--------|----------------------|
| Purpose | Make claims checkable |
| Must express | Evidence id(s), subject, source, status (`draft` / `verified` / `archived` or host-equivalent), links to prior evidence |
| Must not | Treat prose aspiration as verified evidence; merge unresolved conflicts |

### 3.4 Decision Contract

| Aspect | Declared requirement |
|--------|----------------------|
| Purpose | Record admissible outcomes |
| Must express | Decision id, inputs (identity + evidence + policy refs), outcome, justification, optional `supersedes` |
| Must not | Hide denials; claim enforcement without a runtime path |

### 3.5 Memory Contract

| Aspect | Declared requirement |
|--------|----------------------|
| Purpose | Preserve continuity of decisions and evidence across sessions/media |
| Must express | Append/retrieve semantics; conflict visibility; retention/archive rules |
| Must not | Replace evidence with chat dumps; adjudicate truth by overwrite |

**Status:** contracts are **declared** outlines. Schema ratification and tests are future work.

---

## 4. Mirror Subsystem Specification

The **Mirror** is the Discipline Universe component that reflects governance state into intelligible form — for operators, audiences, learners, or agents — without becoming an ungoverned authority source.

### 4.1 Role by layer (declared)

| Layer | Mirror role |
|-------|-------------|
| Constitutional | Reflect charter constraints in human-legible form; never invent new law |
| Governance | Surface policy outcomes (allow / deny / modify) and severity |
| Identity (CIP) | Show which identity is acting; distinguish persona vs authority |
| Evidence | Present evidence links and status honestly (draft vs verified) |
| Decision | Explain verdicts and supersession chains |
| Memory | Expose continuity without silently resolving conflicts |
| Runtime | Report gate results and replay handles |
| Narrative Interface | Make consequences visible in the chosen medium |

### 4.2 Formal Mirror Contract (skeleton)

| Clause | Declared requirement |
|--------|----------------------|
| **Fidelity** | Mirror output must be traceable to Decision + Evidence + Policy refs |
| **Non-authority** | Mirror MUST NOT grant authority; it reports |
| **Honesty** | Status tags (`skeleton` / `declared` / `partial` / `enforced`) must not be upgraded without evidence |
| **Medium neutrality** | Same contract applies to prose, film, interactive, sim, games, education |

### 4.3 Constraints

- No Mirror path that bypasses Identity or Authority contracts
- No silent omission of denials that affected the narrative outcome
- No fabrication of evidence to “make the story work”

### 4.4 Authority

Mirror is a **reporting and explainability surface**, not a policy engine. Authority remains with Constitutional + Governance + Identity contracts as implemented by a host.

### 4.5 Audit

Every Mirror emission that claims to explain a governed outcome SHOULD (declared) carry or link:

- Decision id
- Evidence id(s)
- Policy / contract version refs
- Runtime receipt or replay handle when a runtime exists

### 4.6 Explainability

Explainability is a first-class Mirror duty: humans and agents must be able to answer *why this happened* from linked contracts, not from aesthetics alone.

**Status:** Mirror specification is **skeleton**. No claim that MRS, CIEMS, or CRE ship a conforming Mirror.

---

## 5. Runtime Governance

### 5.1 Principle

Governance that exists only on paper is **insufficient** for CDU-RA alignment. Hosts that claim CDU-RA *runtime* alignment MUST enforce contracts at execution time — with evidence. Until then, wording remains **declared** / **skeleton**.

### 5.2 Declared runtime requirements

| Capability | Declared requirement |
|------------|----------------------|
| **Enforcement** | Deny or modify mutations when Identity / Authority / Evidence / Decision contracts fail |
| **Traceability** | Every governed action links intent → identity → evidence → decision → effect |
| **Replay** | Deterministic (or honestly bounded) reconstruction of governed runs where the medium allows |
| **Audit** | Durable, queryable records suitable for review |
| **Narrative-visible consequences** | Denials and modifications that change outcomes MUST be representable at the Narrative Interface (not only buried in logs) |

### 5.3 Honesty gate

| If the host… | Then claim at most… |
|--------------|---------------------|
| Has docs only | **declared** / **skeleton** |
| Has partial gates + tests | **partial** (cite tests) |
| Has enforced gates + CI evidence | **enforced** (cite checks) |

This v0.1 document itself remains **skeleton** / **declared**.

---

## 6. Implementation-Agnostic Requirements

### 6.1 Medium support (must not preclude)

CDU-RA-aligned designs **must support** (as architectural capability, not as a single product):

| Medium | Declared expectation |
|--------|----------------------|
| **Prose** | Decisions/evidence citeable in text |
| **Film** | Narrative-visible governance consequences in motion picture form |
| **Interactive** | Live gates with explainable outcomes |
| **Simulation** | Replayable governed state trajectories |
| **Games** | Rules-as-governance without bypassing Identity/Authority |
| **Education** | Learnable Mirror explanations and evidence trails (aligns with, does not replace, CCALF) |

### 6.2 Stack independence

| Requirement | Declared |
|-------------|----------|
| No mandatory language, framework, or cloud | Yes |
| No mandatory renderer or game engine | Yes |
| Hosts may use any stack that can express the contracts | Yes |
| Vendor lock-in must be explicit and justified if introduced | Yes (sovereignty preference) |

### 6.3 Cross-link discipline

When documenting alignment with CIEMS, JCR, MRS, CRE, or CCALF:

- Use verbs like **aligns with**, **related**, **prepares**, **declares**
- Avoid **implements / enforces / complete** unless tests and runtime evidence exist

---

## Appendix A — Status legend

| Tag | Meaning |
|-----|---------|
| **skeleton** | Structure present; not operationally proven |
| **declared** | Design intent stated |
| **partial** | Some implementation/tests exist (cite them) |
| **enforced** | Runtime + evidence (cite them) |

## Appendix B — Document control

| Version | Date | Change |
|---------|------|--------|
| 0.1 | 2026-08-03 | Initial skeleton specification |

## Appendix C — Related paths (this repo)

| Path | Note |
|------|------|
| [`docs/cdu-ra/README.md`](README.md) | Index / honesty banner |
| [`docs/ccalf/`](../ccalf/) | Related learning framework |
| [`docs/governance/cecp/trails/cdu-ra-v0.1-2026-08/`](../governance/cecp/trails/cdu-ra-v0.1-2026-08/) | CECP trail (architect ADR) |
| `constitution/`, `AGENTS.md`, engine policies | **Not modified** by CDU-RA v0.1 adoption |
