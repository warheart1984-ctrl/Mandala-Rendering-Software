# Constitutional Continuity Service (CCS) — Charter

**Maturity of this document’s vision relative to runtime:** largely **declared / roadmap**.  
**What exists today:** Continuity Ledger v1 (`continuity-ledger-v1`) in this package with Continuity / Replay / Conflict **enforced** by tests; Drift **partial**.  

CCS, CES registration, unified provenance across AIKI/ARIS/SX/Lineage/Mandala, and ESFR promotion are **not** claimed implemented.

Reconcile with SoC (`CONTINUITY_LEDGER_SOC.md`): CCS/ledger **preserves continuity and enforces continuity invariants**. It does **not** become Evidence, Knowledge, or Understanding engines, and does **not** adjudicate epistemic truth.

**Constitutional Boundary Clause (declared):** *Continuity unifies evidence, not domains.* Full six clauses: `CONSTITUTIONAL_BOUNDARY_CLAUSE.md`. CCS is a substrate/bridge across AIKI, ARIS, Sovereign X, Lineage, and Mandala — not a merger of their semantics or authority models.

---

## 1. Constitutional Continuity Service (CCS)

### 1.1 Definition (**declared**)

CCS is the intended **root continuity authority** for Mandala Rendering Software ecosystems:

| Function | Intent | Status |
|----------|--------|--------|
| Record constitutional / continuity events | Append-only style history of what was claimed | **partial** via ledger POST |
| Store evidence objects | Typed, linked evidence | **partial** — `evidence[]` links only; no signed Evidence Objects |
| Lineage / provenance | Who/when/session/source | **enforced** on ledger records |
| Deterministic replay | Same retrieve → same provenance envelope | **enforced** for ledger retrieve |
| Enforce continuity invariants | Required fields, no silent merge, hash fidelity helpers | **enforced** / **partial** (Drift multi-day) |

“Invariants” here = continuity/governance invariants (immutability of recorded hashes, required provenance, conflict surfacing), **not** “deciding what is true.”

### 1.2 Ledger structure (**declared** target)

| Construct | Meaning | Today |
|-----------|---------|-------|
| **Continuity Blocks** | Immutable batches / blocks of continuity events | **declared** — current store is a flat JSON memory list |
| **Evidence Objects** | Typed, signed evidence payloads | **declared** — only `EvidenceLink` refs on records |
| **Replay Contracts** | Registered reconstruction rules (RC.*) | **declared** — stubs under `schemas/rc/` |
| **Provenance Chains** | Linked identity → intent → evidence → … → replay | **declared** — ledger has per-record provenance, not full chain |

---

## 2. Evidence Schema Registration (CES) — **declared**

Each subsystem **should** register a CES with CCS. Stubs: `schemas/ces/`. Registry: `schemas/registry.json`.

| CES ID | Domain | Status |
|--------|--------|--------|
| `CES.AIKI.KO.v1` | Knowledge Objects | **declared** |
| `CES.ARIS.Decision.v1` | Governed Decisions | **declared** |
| `CES.SX.Execution.v1` | Execution Records | **declared** |
| `CES.Lineage.Identity.v1` | Identity & Provenance | **declared** |
| `CES.Mandala.Render.v1` | Rendering Evidence | **declared** |

Required fields for each: see the matching JSON Schema stub (versioned IDs). Field lists are **declared stubs** pending formal CES ownership sign-off; they are not runtime-validated by the current ledger API.

---

## 3. Replay Contract Registration (RC) — **declared**

| RC ID | Consumer | Status |
|-------|----------|--------|
| `RC.AIKI.v1` | AIKI reconstruction rules | **declared** |
| `RC.ARIS.v1` | ARIS reconstruction rules | **declared** |
| `RC.SX.v1` | Sovereign X / SX reconstruction | **declared** |
| `RC.Lineage.v1` | Lineage reconstruction | **declared** |
| `RC.Mandala.v1` | Mandala render/replay | **declared** |

Stubs: `schemas/rc/`. Not executed by this service today.

---

## 4. Unified Provenance Model — **declared**

Intended chain:

`Root Authority → Identity → Intent → Evidence → Decision → Execution → Verification → Replay`

- Shared identity domain via Lineage — **declared**
- Shared evidence semantics (signature / authority / hash / verification rules) — **declared**

Today’s ledger supplies: `source_agent`, `session_id`, `created_at`, `evidence[]`, `content_sha256`, `supersedes`, `status`, `confidence` (caller-asserted).

---

## 5. Integration Rules — **declared** (target)

| Rule | Intent | Today |
|------|--------|-------|
| Single write path | All continuity writes through CCS | **partial** — this API is a write path; not yet sole path across products |
| Single read path | Retrieve via CCS / ledger retrieve | **partial** — retrieve API exists; not universal |
| Deterministic replay across consumers | Same RC + evidence → same reconstruction | **declared** for multi-product; **enforced** within ledger retrieve tests |
| Constitutional boundaries | No emotion / transient / ungoverned memory as continuity SoT | **partial** — hooks prefer decisions; chat dumps discouraged, not fully banned at API |

---

## 6. Promotion Criteria (checklist)

Promotable toward “CCS as infrastructure” when:

| # | Criterion | Current |
|---|-----------|---------|
| P1 | All CES.* registered (schemas + owners) | **gap** — stubs only |
| P2 | All RC.* registered | **gap** — stubs only |
| P3 | Replay deterministic across registered consumers | **gap** — ledger-only enforced |
| P4 | Evidence chains validate (signatures / hashes end-to-end) | **gap** — content hash only |
| P5 | Provenance unifies across AIKI/ARIS/SX/Lineage/Mandala | **gap** — declared model only |
| P6 | ESFR `PROMOTE_WITH_GAPS` or better for CCS milestone | **gap** — no CCS ESFR run recorded in this package |

---

## 7. Charter Outcome — **declared**

One constitutional continuity history across AIKI, ARIS, SX, Lineage, and Mandala — Continuity Ledger becomes **infrastructure, not mere storage**. Intended milestone; not present capability.

---

## Quote-ready SoC / CCS statement

The Continuity Ledger (and the declared Constitutional Continuity Service built around it) is continuity infrastructure: it records what was claimed, with required provenance, surfaces conflicts without merging, and supports deterministic replay of those records. It enforces continuity invariants — not epistemic truth. Evidence, Knowledge, and Understanding engines remain separate layers that may consume the ledger read-only and decide what to believe. Per the Constitutional Boundary Clause, continuity unifies evidence across domains without blending AIKI, ARIS, Sovereign X, Lineage, or Mandala into one semantics or authority model.
