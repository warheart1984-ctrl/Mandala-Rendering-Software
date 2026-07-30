# AIKI Constitution v0.1

## The Foundational Charter of the AI Knowledge Infrastructure

**Status:** **declared** (Drive-G-1)  
**Version:** 0.1.0  
**Related:** [Reproducibility Charter (RBC-0001)](./REPRODUCIBILITY_CHARTER.md) · [Pedagogy Framework](../pedagogy/FRAMEWORK.md) · [IME / Math](../../math/README.md)

---

### Preamble

The AI Knowledge Infrastructure (AIKI) is established to create, preserve, and propagate understanding. It is a governed system for organizing evidence, knowledge, reasoning, and educational assets into canonical, reusable, and reproducible forms. This Constitution defines the mission, structure, guarantees, and evolution of AIKI.

---

### Article I — Mission: The Advancement of Understanding

#### Section 1. Purpose

AIKI exists to develop, refine, and distribute human and machine understanding across domains. Its mission is not merely to store information, but to cultivate structured comprehension.

#### Section 2. Principles of Understanding

AIKI shall prioritize:

- Clarity over complexity
- Intuition over memorization
- Evidence over assertion
- Reusability over one-off production
- Pedagogical integrity over convenience

#### Section 3. Interfaces

AIKI may deliver understanding through:

- Video
- Audio
- Text
- Interactive tutors
- Courses
- Knowledge engines

All interfaces derive from the same canonical knowledge base.

---

### Article II — Canonical Knowledge Objects (CKOs)

#### Section 1. Definition

A Canonical Knowledge Object (CKO) is the atomic unit of understanding in AIKI. A CKO encodes:

- Concepts
- Evidence
- Explanations
- Representations
- Pedagogical structure
- Derivations
- Reusable assets

#### Section 2. Requirements

Every CKO must:

- Be self-contained
- Declare learning objectives
- Provide multiple representations (when applicable to the domain)
- Link to evidence and references
- Support transformation into multiple formats
- Maintain a clear lifecycle state

#### Section 3. Permanence

CKOs are versioned, archived, and preserved. No CKO may be altered without maintaining lineage and provenance.

#### Section 4. Foundational Objects

Certain CKOs may be designated foundational (for example, **CKO-0001**) as anchors for reproducibility, pedagogy, or reasoning engines.

---

### Article III — The Reproducibility Contract

> Operational detail for this Article is expanded in [REPRODUCIBILITY_CHARTER.md](./REPRODUCIBILITY_CHARTER.md) (RBC-0001).

#### Section 1. Guarantee

Any published artifact derived from a CKO can be reproduced from the repository.

#### Section 2. Anchor Object

**CKO-0001** is the permanent reproducibility anchor. All system changes must answer:

> Can CKO-0001 still be reproduced from the repository?

#### Section 3. Deterministic Pipeline

AIKI shall maintain a deterministic or semantically deterministic pipeline capable of reconstructing:

- Scripts
- Narration (or narration plans)
- Visuals
- Metadata
- Final outputs

#### Section 4. Provenance Requirements

Every published artifact must include:

- Hashes of all inputs and outputs
- Pipeline version
- Evidence references
- Transformation logs (as available)

#### Section 5. Validation

No architectural change may be merged unless the CKO-0001 reproducibility test passes — once CKO-0001 is frozen after first publish. Until freeze, validators report **not frozen** and must not claim enforcement.

---

### Article IV — Educational Principles

#### Section 1. Pedagogical Integrity

AIKI education shall emphasize:

- Intuition before formalism
- Estimation before precision
- Multiple representations
- First-principles reasoning
- Pattern recognition
- Causal explanations
- Self-explanation loops

#### Section 2. Intuitive Reasoning Engines

AIKI may include domain-specific reasoning engines (for example, the Intuitive Mathematics Engine under `aiki/math/`) that encode:

- Numerical, geometric, algebraic, probabilistic, and physical-world intuition
- Verification and estimation strategies
- Self-explanation capabilities

Such engines must integrate with CKOs and support reproducibility.

#### Section 3. Series and Curricula

Educational series (Research Decoded, AI This Week, Math Intuition, Code With AI, Tool Lab, and successors) are derived from CKOs and must maintain consistent pedagogical structure.

---

### Article V — Governance

#### Section 1. Authority Structure

AIKI is governed by:

- This Constitution
- The Canonical Object Registry (`knowledge/objects/`)
- The Reproducibility Contract (RBC-0001)
- The Versioning System (`config/pipeline.yaml` and CKO lineage)
- The Archive (`archive/`)

#### Section 2. Decision Chain

All significant actions follow:

Authority → Validation → Decision → Evidence → Verification → Replay → Audit

#### Section 3. Change Control

Changes to CKOs, pipelines, templates, engines, or educational frameworks require:

- Review
- Validation
- Reproducibility testing (when the relevant anchor is frozen)
- Archival logging

#### Section 4. Stewardship

Stewards of AIKI are responsible for integrity, transparency, pedagogical quality, reproducibility, and long-term stability.

---

### Article VI — Evolution and Versioning

#### Section 1. Semantic Versioning

Constitutional and pipeline evolution shall use major / minor / patch semantic versioning.

#### Section 2. Promotion Model

AIKI follows a Substrate → Substration → Promotion model. Promotions require evidence, replay verification, conformance checks, and constitutional review.

#### Section 3. Historical Integrity

All evolution must preserve provenance, lineage, historical context, and reproducibility.

#### Section 4. Deprecation

Deprecation of any component requires migration paths, continued reproducibility guarantees for published anchors, and archive preservation.

---

### Article VII — Archives and Stewardship

#### Section 1. Immutable Archive

AIKI maintains an immutable archive of:

- CKOs
- Scripts
- Narration artifacts
- Visual plans
- Final outputs
- Provenance records
- Pipeline versions

#### Section 2. Replay Logs

Replay logs and reconstruction checklists shall be preserved to support long-term reproducibility.

#### Section 3. Steward Duties

Stewards shall:

- Maintain the archive
- Ensure reproducibility of foundational objects
- Uphold educational integrity
- Protect canonical objects
- Document evolution

---

### Closing Declaration

Understanding in AIKI is governed by evidence, reproducibility, and pedagogical integrity.

> **No claim without evidence. No artifact without provenance. No evolution without replay.**
