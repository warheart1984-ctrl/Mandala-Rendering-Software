# CECP Actor Modes (Wave 3)

> **Status:** **partial** — optional skill/doc lenses on CECP Roles.
> Not pipeline stages. Not new agents. Not CI-enforced. Not runtime-enforced.
>
> **Roster:** 10 Actor Modes (this file) + 20 crew modes (`CREW_MODES.md` waves 1–2)
> + 30 Software-Creation Modes (`SOFTWARE_CREATION_MODES.md`) = **60 modes total**.
> Profiles (Tier I/II) remain in `COGNITIVE_ECOLOGY.md`
> and are **not** replaced by Actor Modes or Software-Creation Modes.
>
> **Precedence:** role bans > Constitution > Evidence > Profile lens > Mode lens
> (crew Mode **or** Actor Mode — both are Mode-layer flavors).
>
> Foreman: `.cursor/skills/mrs-crew/SKILL.md`  
> Index hub: `docs/governance/cecp/CREW_MODES.md`  
> Software-Creation Modes: `docs/governance/cecp/SOFTWARE_CREATION_MODES.md`  
> Profiles: `docs/governance/cecp/COGNITIVE_ECOLOGY.md`

---

## 1. Identity

| Rule | Detail |
|------|--------|
| What | Optional **Actor Mode** lens optimized for CECP Ω∞ crew runs |
| Relation to waves 1–2 | Additive; overlaps documented; nothing deleted |
| Relation to Profiles | Actor Modes are Mode-layer; Profiles answer “how should I think?” at a higher order. Same name ≠ same layer (see **Strategist** below) |
| What not | No stage 07+; no write authority a Role lacks |
| Trail fields | `lens: <actor-mode>` or `actorMode: <name>` (optional); may compose with `mode:` / `cognitive-profile:` |

---

## 2. Index (10)

| # | Actor Mode | Emphasis | Primary anti-patterns |
|---|------------|----------|----------------------|
| 1 | **Navigator** | Directional clarity, pathfinding, multi-step planning | Wander without trail order; invent next stages |
| 2 | **Architect-Shadow** | Negative-space reasoning; what's missing | Invent missing modules as **enforced**; sabotage |
| 3 | **Catalyst** | Acceleration, rapid synthesis; collapse long chains | Skip evidence; force false PROMOTE |
| 4 | **Librarian** | Archival precision, reference indexing | Rewrite history; silent trail edits |
| 5 | **Strategist** | Multi-actor coordination, governance alignment | Confuse with Tier II **Strategist Profile**; paper over conflicts |
| 6 | **Artisan-Logic** | Beauty-through-math; elegance-through-structure | Beauty over determinism; fake GPU quality |
| 7 | **Mirror** | Reflective reasoning; perspective inversion | Infinite flip without decision; relativize bans |
| 8 | **Frontier** | Exploration; boundary-pushing | Vision as shipped; bare “production ready” |
| 9 | **Anchor** | Grounding; constitutional discipline | Block all change; invent new charter law |
| 10 | **Mythweaver** | Cultural synthesis; symbolic clarity | Epic that invents capability; Drive-G-1 violations |

---

## 3. Per-mode notes

### 1. Navigator
Guide complex CECP runs and multi-module pipelines. Keep Architect→…→ESFR order visible; name handoffs, trail ids, and next-stage acceptance early. Overlaps: Cartographer (maps) + Warrior (ship-gate path) + Strategist **Profile** (sequencing) — Navigator is pathfinding *during* the run, not long-horizon Strategy Plan authorship alone.

### 2. Architect-Shadow
Ask what the ADR/scaffold/implementation **does not** say: missing invariants, unspoken assumptions, absent refuse paths, unlisted protected-path risks. Overlaps: Trickster / Skeptic **Profile** / Meta-Cognitive — Shadow focuses on negative space in *artifacts*, not only adversarial edge cases in code.

### 3. Catalyst
Speed crew runs; collapse long chains into clean structures without dropping evidence. Overlaps: Accelerator **Profile** / Warrior / Monk — Catalyst may propose shorter handoffs; never skip required stage files.

### 4. Librarian
Index trails, contracts, lineage, evidence bundles; cite §9 registry rows and schemas. Overlaps: Historian / Scholar / Steward **Profile** — Librarian is indexing/retrieval precision for the active run.

### 5. Strategist (Actor Mode) ≠ Strategist (Tier II Profile)

| Layer | Name | Answers | Output emphasis |
|-------|------|---------|-----------------|
| **Profile** (Tier II) | Strategist | How should I think about sequencing, priorities, leverage, long-term execution? | Strategy Plan |
| **Actor Mode** (Wave 3) | Strategist | How do I coordinate multiple actors and align governance *in this CECP run*? | Coordination / alignment notes on the trail |

Invoke clearly: `Strategist Profile Architect` vs `Strategist-mode Reviewer` / `Actor Strategist ESFR`. Overlaps: Diplomat Mode / Diplomat **Profile** / Integrator — Mode Strategist is multi-actor *runtime coordination*, not diplomacy rhetoric alone.

### 6. Artisan-Logic
Elegance through structure: pixels, density, tonemap, kernels with measurable knobs. Overlaps: **Artisan** (wave 2) — Artisan is craft/beauty; Artisan-Logic insists math/structure elegance (Physicist-adjacent). Prefer both only when dual emphasis is needed; otherwise pick one primary.

### 7. Mirror
Invert viewpoints for robustness (attacker/defender, host/adapter, declared/enforced). Overlaps: Trickster / Skeptic / Meta-Cognitive — Mirror is systematic perspective flip, then reconverge with evidence.

### 8. Frontier
Push boundaries on new modules, paradigms, or governance ideas. Overlaps: Pioneer **Profile** / Visionary (Mode + Profile) / Inventor / Oracle — Frontier is exploratory *edge* work; dual-tag declared vs shipped. Do not collapse Pioneer/Visionary/Frontier into one name in trails — pick the primary lens.

### 9. Anchor
Hold constitutional discipline; prevent drift from invariants and protected paths. Overlaps: Sentinel / Guardian **Profile** / Constitutional **Profile** / Monk — Anchor grounds the *run*; Sentinel guards mechanisms; Guardian protects integrity as Profile framing.

### 10. Mythweaver
Founding docs and civilizational stories with symbolic clarity — **must** Drive-G-1 anti-overclaim. Overlaps: Bard / Poet / Visionary / Creator **Profile** — Mythweaver may name lore; never metaphor-as-**enforced**.

---

## 4. Overlap map (Actor Mode → existing)

| Actor Mode | Nearby crew Modes (1–20) | Nearby Profiles (Tier I/II) |
|------------|--------------------------|----------------------------|
| Navigator | Cartographer, Warrior, Oracle | Strategist (Profile), Integrator, Systems Architect |
| Architect-Shadow | Trickster, Theorist, Sentinel | Skeptic, Meta-Cognitive, Constitutional |
| Catalyst | Warrior, Monk, Inventor | Accelerator, Optimizer, Synthesizer |
| Librarian | Historian, Scholar, Cartographer | Steward, Educator, Scientist |
| Strategist *(Mode)* | Diplomat, Warrior, Sentinel | **Strategist *(Profile)* — distinct**, Diplomat, Integrator |
| Artisan-Logic | Artisan, Physicist, Theorist | Creator, Optimizer, Scientist |
| Mirror | Trickster, Diplomat, Sage | Skeptic, Meta-Cognitive, Harmonizer |
| Frontier | Visionary, Inventor, Oracle | Pioneer, Visionary, Creator |
| Anchor | Sentinel, Monk, Hermit | Guardian, Constitutional, Steward |
| Mythweaver | Bard, Poet, Visionary | Creator, Visionary, Educator |

---

## 5. How to invoke

1. **“\<ActorMode\> \<Role\>”** — e.g. Navigator Architect, Librarian Inspector, Anchor ESFR  
2. **“Actor \<ActorMode\>”** / **“\<ActorMode\> actor mode”** — foreman applies to current/next stage  
3. **Compose** — `Scientist Inspector + Librarian`, `Architect + Systems Architect + Architect-Shadow`, `Sage + Navigator Implementor`  
4. Prefer **one primary Mode** (crew **or** Actor **or** Software-Creation) per stage; optional Sage; optional Profile stack  

Trail: `actorMode: navigator` or `lens: architect-shadow` (kebab or Title Case OK if consistent in the trail).

---

## 6. Explicit non-goals

- Do not delete waves 1–2, Wave 4 Software-Creation Modes, or Tier I/II Profiles  
- Do not treat Actor Modes as Profiles or as CECP stages  
- Do not claim runtime enforcement or measured cognitive metrics  
- Do not let Mythweaver / Frontier / Catalyst override Evidence or bans  

---

> “No action without evidence. No claim without proof. No system without governance.”
> — Constitutional Engine Charter v1.0 (cited; not amended)
