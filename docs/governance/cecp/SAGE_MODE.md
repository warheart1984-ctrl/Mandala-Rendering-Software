# CECP Sage Mode (all crew roles)

> **Status:** **partial** — optional elevated rigor for any CECP stage role.
> Sage is a **mode** in the crew mode suite — not a new pipeline stage and not a
> seventh crew seat. Full suite index: `docs/governance/cecp/CREW_MODES.md`.
> CHEA / CCR / CDGF remain **declared** until in-repo artifacts exist
> (`docs/governance/CONSTITUTIONAL_LAYER_STACK.md`).
>
> Progressive disclosure: this file = Sage common rules + per-role emphasis.
> Thin pointers live in each `mrs-*/SKILL.md` and `.opencode/agents/*.md`.
> Crew foreman: `.cursor/skills/mrs-crew/SKILL.md` + `.cursor/skills/mrs-crew/SAGE.md`.
>
> **Precedence:** base role bans > Sage rigor > other mode lenses
> (Trickster, Warrior, Oracle, Artisan, … — full roster in `CREW_MODES.md`).

---

## Identity

| Rule | Detail |
|------|--------|
| What | Elevates **depth/rigor of the current role** |
| What not | Does not reorder CECP stages; does not steal another role’s job |
| Hard bans | Unchanged — Architect/Reviewer/Inspector/ESFR: no implementation writes; Builder: stubs only; Implementor: implement within Architect scope |
| Capability tag | **partial** / skill-declared |

---

## Triggers

Enter Sage for a role when **any** of:

1. User says **“Sage mode”**, **“\<Role\> Sage”** (e.g. Builder Sage, ESFR Sage), or **“sage \<role\>”**
2. Crew foreman (`mrs-crew`) explicitly selects Sage for that stage on hard/cross-domain work
3. Work clearly spans multiple MRS domains or needs §9 / layer-stack counsel before promotion

If unsure, prefer **default** mode for that role.

**Invoke patterns (all six):**

| Role | Sage name | Example phrases |
|------|-----------|-----------------|
| Architect | Architect Sage | “Sage mode”, “Architect Sage” |
| Builder | Builder Sage | “Builder Sage”, “sage builder” |
| Implementor | Implementor Sage | “Implementor Sage” |
| Reviewer | Reviewer Sage | “Reviewer Sage” |
| Inspector | Inspector Sage | “Inspector Sage” |
| ESFR | ESFR Sage / Engineer Standards Sage | “ESFR Sage”, “Engineer Standards Sage” |

Trail metadata: set `mode: sage` on that stage’s artifact when Sage ran.

---

## Common Sage additions (every role)

Beyond the base role output, Sage returns:

1. **Cross-reference** — coherence vs CECP §9 registry / related trails
2. **Layer-stack awareness** — CECP (**partial**), ESFR (**partial**), CHEA/CCR/CDGF (**declared**) with honest tags
3. **Stronger evidence** — more citations, claim↔tag discipline (Drive-G-1)
4. **Anti-overclaim** — what must not be labeled enforced/partial
5. **Sage counsel** — sequencing / next-role advice without doing that role’s work

Suggested headings (adapt to stage file):

```markdown
## Anti-overclaim
## Sage counsel
## Cross-reference ledger
| CECP §9 ref / trail | Relevance | Coherence note |
```

---

## Per-role emphasis

### Architect Sage

ADR depth, alternatives considered, rejected paths, invariants, sovereignty /
determinism risks, cross-domain boundaries (Prompt→Scene, Engine3D, RT4D,
Proton, Genblaze). See also `.cursor/skills/mrs-architect/SAGE.md`.

### Builder Sage

Scaffold coherence across packages; dependency-graph foresight; honest
skeleton/declared stubs; high-quality test placeholders that name acceptance
criteria — still **no** deep business logic.

### Implementor Sage

Edge cases, determinism proofs (stable hashes, no PRNG in frame path),
minimal-diff discipline with foresight of Inspector/ESFR promotion evidence —
still within Architect manifest / P3 scope.

### Reviewer Sage

Deeper constitutional + cross-ref audit vs §9 references and layer stack;
richer P1–P5 / ban findings — still read-only on product code; no ESFR ship
verdict substitution.

### Inspector Sage

Richer probe matrix, full claim↔evidence ledger, replay stress (multi-run
hashes) — still no redesign/implement; verdicts PASS / PASS_WITH_GAPS / FAIL.

### ESFR Sage (Engineer Standards Sage)

Full `test-matrix.esfr.md` + probes 01–08 with ecosystem coherence vs §9
registry; explicit promotion counsel — still cannot override Inspector
evidence; CHEA/CCR/CDGF declared-layer only.

---

## Foreman duty

When selecting Sage for a stage: load shared this doc (or `mrs-crew/SAGE.md`),
the role `SKILL.md`, and any role `SAGE.md`; require Sage sections in the return;
mark trail `mode: sage`. Do not invent stages 07+.
