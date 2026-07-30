# Constitutional Boundary Clause

**Binding design law for CCS under `jarvis-memoryboard/`.**  
**Status: declared** — charter law for CCS design. Not promoted into repo constitution (`constitution/`, `AGENTS.md`, governance policies) unless the user later authorizes that explicitly.

**Root principle:** *Continuity unifies evidence, not domains.*

---

## Clause I — Continuity is a substrate, not a merger

One shared timeline; domains stay separate:

| Subsystem | Domain |
|-----------|--------|
| AIKI | Knowledge Domain |
| ARIS | Decision Domain |
| Sovereign X | Execution Domain |
| Lineage | Identity Domain |
| Mandala | Rendering Domain |

Continuity **binds evidence**; it does **not** collapse semantics.  
Prevents: epistemic fusion, authority recursion, domain bleed.

---

## Clause II — Evidence is universal; meaning is local

**Shared (continuity substrate):**

- Evidence format
- Provenance chain
- Replay contract
- Verification rules

**Local (each constitutional domain):** interpretation and meaning.

Prevents collapse of memory, identity, execution, and rendering into an undifferentiated mass.

**Named risk (clarify, do not medicalize):** historical notes may say “epdetispme” or “epidismic reaction.” Treat these as informal labels for **epistemic / domain collapse** — the failure mode where domain meanings fuse into one soup. Prefer the clear term *epistemic/domain collapse* in design docs.

---

## Clause III — Replay is unified; behavior is not

**Replay reconstructs:**

- What happened
- Order
- Authority
- Evidence

**Replay does NOT reconstruct:**

- AIKI knowledge semantics
- ARIS decision logic
- Sovereign X execution behavior
- Lineage identity meaning
- Mandala aesthetics

Cross-domain replay; domain logic stays sovereign.

---

## Clause IV — Identity is shared; authority is scoped

- Lineage = single identity root
- Authority chains remain domain-specific

Prevents: identity recursion, authority collapse, continuity corruption.

---

## Clause V — Memory is excluded from continuity

Continuity stores **evidence**, not:

- Memory (chat/context dumps)
- Emotion
- Transient state
- Ungoverned context

**Firewall:** Memory is local. Evidence is constitutional.

### Gap vs today (honest)

| Path | Status vs Clause V |
|------|--------------------|
| Ideal CCS write path | Evidence / decision / architecture records only — **declared** |
| `agent-hooks/jarvis_session_end.py` | Still may POST draft `type=fact` session-end notes or heuristic “decision” extracts — **transitional / partial** |
| Agent rule preferring `type=decision` | Guidance only — **partial** |
| Clause V enforcement at API | **Not enforced** — API still accepts general `fact`/`preference`/etc. content |

Do **not** claim Clause V is enforced while session hooks can write memory-like records. Migrate hooks toward decision/evidence CES-shaped writes, or keep transient session notes **outside** the constitutional CCS write path.

---

## Clause VI — Continuity binds systems without blending them

- Ledger = shared backbone
- Each subsystem remains sovereign: semantics, invariants, authority model, replay logic
- Continuity is the **bridge**, not the **fusion**

---

## Why it matters

These clauses prevent:

| Failure | What goes wrong |
|---------|-----------------|
| Epistemic collapse | Domains fuse; meaning becomes undifferentiated |
| Authority recursion | Cross-domain authority loops |
| Identity bleed | Lineage identity absorbs foreign domain meaning |
| Execution–decision fusion | SX and ARIS collapse into one logic |
| Rendering–knowledge confusion | Mandala aesthetics treated as AIKI knowledge (or vice versa) |
| Continuity overload | Ledger asked to hold memory/emotion/transient state |

---

## Cross-links

- SoC (preserve ≠ adjudicate truth): `CONTINUITY_LEDGER_SOC.md`
- CCS charter: `CCS_CHARTER.md`
- Ledger → CCS gaps: `LEDGER_TO_CCS_MAPPING.md`
- Consumer adapters: `ADAPTER_CONSUMERS.md`
