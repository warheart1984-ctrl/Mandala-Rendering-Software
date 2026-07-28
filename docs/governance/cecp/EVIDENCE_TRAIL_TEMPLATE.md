# CECP Evidence Trail Template

Copy this folder pattern to:

```text
docs/governance/cecp/trails/<trail-id>/
```

Fill every section with paths and commands. Prefer weaker verbs when evidence is incomplete (Drive-G-1).

**New trails** must include stage 06 (**ESFR**). Historical trails that closed at 05 are not rewritten unless an honest ESFR backfill is added.

ESFR package: `docs/governance/esfr/`.

---

## Trail metadata

| Field | Value |
|-------|-------|
| `trailId` | |
| `feature` | |
| `requestedBy` | |
| `started` | YYYY-MM-DD |
| `lineage` | Architecture → Build → Implementation → Review → Inspection → ESFR |
| `overallStatus` | **partial** / **enforced** / **declared** (pick one; justify) |
| `protocol` | `docs/governance/CECP_OMEGA_PROTOCOL.md` |
| `cognitive-profile` | (optional) primary Profile from `COGNITIVE_ECOLOGY.md` |
| `cognitive-switches` | (optional) logged Profile switches + evidence cites |
| `mode` / `lens` | (optional) wave 1–2 crew Mode |
| `actorMode` | (optional) Wave 3 Actor Mode (`CECP_ACTOR_MODES.md`) |
| `softwareCreationMode` | (optional) Wave 4 Software-Creation Mode (`SOFTWARE_CREATION_MODES.md`) |

---

## Stage checklist

- [ ] `01-architect-adr.md`
- [ ] `02-builder-scaffold-manifest.md`
- [ ] `03-implementor-notes.md`
- [ ] `04-reviewer-conformance.md`
- [ ] `05-inspector-acceptance.md`
- [ ] `06-engineer-standards.md` (ESFR — required for new trails)
- [ ] `lineage.json` (optional)
- [ ] `README.md` (index)

---

## 01 — Architect (ADR + boundary)

**File:** `01-architect-adr.md`

Required headings:

1. Intent (what / why)
2. ADR decision (context, decision, consequences)
3. Interface specification (inputs, outputs, schemas, env, bans)
4. Constitutional boundary analysis (in-scope / out-of-scope / protected paths)
5. File manifest (path × action × owner role)
6. Acceptance criteria (testable)
7. Handoff to Builder

**Optional Architect Sage (Sage mode):** same stage-01 artifact — not a seventh
crew stage. When `mode: sage`, also include Anti-overclaim, Sage counsel,
Cross-reference ledger (§9), and Risks to sovereignty / determinism. See
`docs/governance/cecp/SAGE_MODE.md` and `.cursor/skills/mrs-architect/SAGE.md`
(capability **partial**). Optional Sage applies similarly to stages 02–06.

**Optional crew mode suite:** 20 lenses (Sage…Bard; Oracle…Visionary) plus
Wave 3 Actor Modes (Navigator…Mythweaver) plus Wave 4 Software-Creation Modes
(Compiler…Constructor) — **60** total — may apply to any stage role without
adding stages — `docs/governance/cecp/CREW_MODES.md` +
`docs/governance/cecp/CECP_ACTOR_MODES.md` +
`docs/governance/cecp/SOFTWARE_CREATION_MODES.md` (**partial**).

**Optional Cognitive Ecology Profile:** Tier I/II profiles
(`docs/governance/cecp/COGNITIVE_ECOLOGY.md`, **partial** docs/skills) answer
“how should I think?” alongside Role responsibility. Precedence:
role bans > Constitution > Evidence > Profile > Mode. Record
`cognitive-profile` / `cognitive-switches` / `actorMode` /
`softwareCreationMode` when used (see lineage schema).

---

## 02 — Builder (scaffold)

**File:** `02-builder-scaffold-manifest.md`

Required headings:

1. Intent (cite Architect ADR)
2. Scaffold manifest (created paths)
3. Dependency graph (modules / packages / subprocess boundaries)
4. Build artifacts inventory (stubs labeled **skeleton** / **declared**)
5. Test placeholders created
6. Handoff to Implementor

---

## 03 — Implementor (production notes)

**File:** `03-implementor-notes.md`

Required headings:

1. Intent fulfilled
2. Files touched (real paths)
3. Unit / integration test inventory (names + what they enforce — do not invent counts)
4. Commands run + results
5. Status tag updates
6. Remaining gaps
7. Handoff to Reviewer

---

## 04 — Reviewer (conformance)

**File:** `04-reviewer-conformance.md`

Required headings:

1. Scope reviewed
2. Principles P1–P5 findings
3. Policy / ban / boundary findings
4. Constitutional / contract findings (lawbook focus; leave ship-quality to stage 06 / ESFR)
5. Violations (or “none found” with evidence)
6. Boundary verdict (e.g. Boundary OK)
7. Handoff to Inspector

---

## 05 — Inspector (acceptance)

**File:** `05-inspector-acceptance.md`

Required headings:

1. Verdict: `PASS` | `PASS_WITH_GAPS` | `FAIL`
2. Claim ↔ evidence table
3. Commands / probes run
4. Replay / determinism notes (if applicable)
5. Gaps for Implementor
6. Claim wording to downgrade (if any)
7. **Acceptance** — accepted / rejected as governed integration point; list gaps honestly
8. Handoff to ESFR (new trails)

---

## 06 — ESFR (Engineer Standards Final Reviewer / ship gate)

**File:** `06-engineer-standards.md`

Required headings:

1. ESFRVerdict: `PASS` | `PASS_WITH_GAPS` | `HOLD` | `REJECT`
2. PromotionEligibility: `PROMOTE` | `PROMOTE_WITH_GAPS` | `HOLD` | `REJECT` (cite promotion rules 01–06)
3. **Test matrix** — full table from `docs/governance/esfr/test-matrix.esfr.md` (all six categories)
4. **Evidence probes** — probes 01–08 from `docs/governance/esfr/probes.esfr.md` with citations
5. Standards checklist (coding/API, Drive-G-1, Drive-G-2, CI/tests, Docker/ops notes, deps/license, no drive-by scope)
6. Findings (blocking vs gaps)
7. Evidence alignment with Inspector (no override)
8. Ship gate / promotion decision
9. Distinct from Reviewer — do not re-litigate P1–P5 unless a standards finding depends on it

CHEA / CCR / CDGF matrix rows and probes 03–05: evaluate **declared** layers until registries exist.

---

## Acceptance block (canonical)

```markdown
## Acceptance

**Decision:** Accepted as governed integration point with gaps | Rejected | Deferred

**Enforced today:** …
**Partial / skeleton gaps:** …
**Declared non-goals:** …
**ESFR (stage 06):** PASS | PASS_WITH_GAPS | HOLD | REJECT | N/A (historical trail)
**PromotionEligibility:** PROMOTE | PROMOTE_WITH_GAPS | HOLD | REJECT | N/A
```
