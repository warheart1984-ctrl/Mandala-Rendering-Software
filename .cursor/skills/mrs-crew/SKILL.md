---
name: mrs-crew
description: >-
  Orchestrates the local MRS six-role crew (architect, builder, implementor,
  reviewer, inspector, ESFR / engineer-standards). Use when the user asks to use
  the crew, subagents, or to design→build→implement→review→inspect→standards /
  ESFR a feature instead of doing all roles in one pass. Optional crew modes
  (Sage…Visionary + Actor Modes Navigator…Mythweaver + Software-Creation Modes
  Compiler…Constructor, 60 lenses) and Cognitive Ecology Profiles are flavors
  on roles — not new pipeline stages.
---

# MRS Crew Orchestrator

You are the **foreman**. Prefer dispatching role work over doing every role yourself.

## Roles (local)

| Role | OpenCode agent | Cursor skill | Writes code? |
|------|----------------|--------------|--------------|
| Architect | `.opencode/agents/architect.md` | `mrs-architect` | No |
| Builder | `.opencode/agents/builder.md` | `mrs-builder` | Stubs only |
| Implementor | `.opencode/agents/implementor.md` | `mrs-implementor` | Yes |
| Reviewer | `.opencode/agents/reviewer.md` | `mrs-reviewer` | No |
| Inspector | `.opencode/agents/inspector.md` | `mrs-inspector` | No |
| **ESFR** (Engineer Standards) | `.opencode/agents/engineer-standards.md` | `mrs-engineer-standards` | No |

**Optional crew modes** (lenses on any role): see
`docs/governance/cecp/CREW_MODES.md` (waves 1–2),
`docs/governance/cecp/CECP_ACTOR_MODES.md` (Wave 3), and
`docs/governance/cecp/SOFTWARE_CREATION_MODES.md` (Wave 4). Also
`.cursor/skills/mrs-crew/SAGE.md`. Modes are **not** new stages or agents.
Status: **partial**. **60 modes total.**

**Optional Cognitive Ecology Profiles** (“how should I think?”): see
`docs/governance/cecp/COGNITIVE_ECOLOGY.md`. Profiles compose with Roles; Modes
may map to Profiles where names overlap (**Strategist Mode ≠ Strategist
Profile**; **Integrator / Optimizer / Synthesizer Mode ≠ same-named Profile**).
Status: **partial** (docs/skills) — not runtime-enforced.
Precedence: **role bans > Constitution > Evidence > Profile > Mode**.

ESFR package: `docs/governance/esfr/`. ESFR **is** stage-06 Engineer Standards —
not a parallel seventh role.

## Default pipeline (CECP Ω∞)

Protocol: `docs/governance/CECP_OMEGA_PROTOCOL.md`  
Template: `docs/governance/cecp/EVIDENCE_TRAIL_TEMPLATE.md`  
ESFR: `docs/governance/esfr/protocol.esfr.md`  
Cognitive Ecology: `docs/governance/cecp/COGNITIVE_ECOLOGY.md`  
Modes suite: `docs/governance/cecp/CREW_MODES.md`  
Actor Modes: `docs/governance/cecp/CECP_ACTOR_MODES.md`  
Software-Creation Modes: `docs/governance/cecp/SOFTWARE_CREATION_MODES.md`  
Sage detail: `docs/governance/cecp/SAGE_MODE.md`

1. **Architect** → `01-architect-adr.md`
2. **Builder** → `02-builder-scaffold-manifest.md`
3. **Implementor** → `03-implementor-notes.md`
4. **Reviewer** → `04-reviewer-conformance.md`
5. **Inspector** → `05-inspector-acceptance.md`
6. **ESFR** → `06-engineer-standards.md`;
   PromotionEligibility: PROMOTE / PROMOTE_WITH_GAPS / HOLD / REJECT  

Any stage may add an optional **Profile** (`COGNITIVE_ECOLOGY.md`) and/or
**mode lens** (any wave: crew, Actor, or Software-Creation) without changing
order or adding stages.

**Permanent trail (required):** before finishing the crew run, ensure
`docs/governance/cecp/trails/<trail-id>/` exists with the six stage files (+
`README.md`). Historical trails that stop at 05 remain valid; **new** trails
must include ESFR (06). If a read-only subagent cannot write, the foreman writes the
trail from that role’s return. Skip roles only when the user explicitly narrows
scope.

Reference registry: `docs/governance/CECP_OMEGA_PROTOCOL.md` §9
(#1 Prompt→Scene, #2 Proton Raster; follow-ons listed there).
Layer stack: `docs/governance/CONSTITUTIONAL_LAYER_STACK.md`.

## Role + Profile + Mode (any wave)

| Layer | Answers | Required? | Source |
|-------|---------|-----------|--------|
| **Role** | What am I responsible for? | Yes (stage) | Architect…ESFR |
| **Profile** | How should I think? | Optional | `COGNITIVE_ECOLOGY.md` Tier I/II |
| **Mode** | Optional named lens | Optional | waves 1–2 (`CREW_MODES.md`) **or** Actor Modes (10) **or** Software-Creation Modes (30) |

**Assign:** Role always; Profile when cognitive framing helps; Mode (any wave)
when a named lens fits. Prefer one primary Mode per stage (+ optional Sage).

**Invoke:**
- `Scientist Inspector` / `Architect + Systems Architect + Sage`
- `Trickster Implementor` (crew Mode; maps Skeptic-ish)
- `Navigator Architect` / `Librarian Inspector` / `Anchor ESFR` (Actor Modes)
- `Pipeline-Conductor Architect` / `Boundary-Guardian Reviewer` /
  `Testwright Inspector` / `Constructor Implementor` (Software-Creation Modes)
- `ESFR + Guardian + Steward` (Role + Profiles)
- `Sage + Cartographer Architect` (Mode stack; Profile optional)
- Distinguish: `Strategist Profile Architect` vs `Actor Strategist Reviewer`
- Distinguish: `Integrator Profile Architect` vs `Integrator-mode Implementor`
- Distinguish: `Optimizer Profile ESFR` vs `Optimizer-mode Implementor`
- Distinguish: `Synthesizer Profile Reviewer` vs `Synthesizer-mode Architect`

**Log:** `cognitive-profile`, optional `cognitive-switches`, `lens` / `mode` /
`actorMode` / `softwareCreationMode` on the trail. Switches only via explicit
evidence (`COGNITIVE_ECOLOGY.md` §8) — pattern status **declared**.

## Crew modes (optional lenses)

**Precedence:** role bans > Constitution > Evidence > Profile lens > Mode lens.
**Roster:** 60 modes — waves 1–2 in `CREW_MODES.md`; Wave 3 in
`CECP_ACTOR_MODES.md`; Wave 4 in `SOFTWARE_CREATION_MODES.md`.
**Profiles:** `docs/governance/cecp/COGNITIVE_ECOLOGY.md`.

| Mode | One-line |
|------|----------|
| Sage | Elevated rigor, §9, anti-overclaim |
| Trickster | Constructive adversarial edges |
| Warrior | Minimal scope, ship-gate focus |
| Monk | Calm simplicity, quiet determinism |
| Researcher | Cite evidence; hypothesis→tests |
| Journalist | Who/what/when/evidence voice |
| Poet | Honest metaphor; no capability fiction |
| Physicist | Units, conservation, RT4D math |
| Theorist | Invariants, formal design properties |
| Bard | Judge-facing narrative without false claims |
| Oracle | Long-horizon foresight (declared risks) |
| Cartographer | System/trail/pipeline maps |
| Artisan | Pixel/tonemap/beauty craft |
| Sentinel | Guard determinism & boundaries |
| Scholar | Docs/contracts/evidence mastery |
| Inventor | Novel mechanisms; dual-tag declared vs shipped |
| Diplomat | Multi-party coherence; honest layer tags |
| Hermit | Deeper purity/withdrawal (≠ Monk) |
| Historian | Lineage/archival continuity |
| Visionary | Bold leaps + mandatory anti-overclaim |
| **Navigator** *(Actor)* | CECP pathfinding / multi-step pipelines |
| **Architect-Shadow** *(Actor)* | Negative-space gaps & assumptions |
| **Catalyst** *(Actor)* | Accelerate; collapse chains with evidence |
| **Librarian** *(Actor)* | Trail/contract/lineage indexing |
| **Strategist** *(Actor)* | Multi-actor coordination (**≠** Profile) |
| **Artisan-Logic** *(Actor)* | Beauty-through-math / structure |
| **Mirror** *(Actor)* | Perspective inversion |
| **Frontier** *(Actor)* | Boundary-pushing exploration |
| **Anchor** *(Actor)* | Constitutional grounding / anti-drift |
| **Mythweaver** *(Actor)* | Symbolic narrative + anti-overclaim |
| **Compiler** *(SC)* | Intent → contracts → typed surfaces |
| **Refactorer** *(SC)* | Structure improve; preserve observables |
| **Debugger** *(SC)* | Minimal repro; evidence root cause |
| **Architect-Kernel** *(SC)* | Feature kernel invariants |
| **Integrator** *(SC)* | Wire runnable path (**≠** Profile) |
| **Sandbox** *(SC)* | Isolated reversible experiments |
| **Protocol** *(SC)* | Envelopes / versioned wire contracts |
| **Versioneer** *(SC)* | Semver + dual-layout honesty |
| **Synthesizer** *(SC)* | Shippable software model (**≠** Profile) |
| **Optimizer** *(SC)* | Measured perf knobs (**≠** Profile) |
| **Pattern-Weaver** *(SC)* | Reuse in-repo patterns with cites |
| **Boundary-Guardian** *(SC)* | Adapter / ownership boundaries |
| **Runtime-Sage** *(SC)* | Runtime vs declared honesty |
| **Schema-Artist** *(SC)* | Schema elegance + validation |
| **Pipeline-Conductor** *(SC)* | Stage/CLI/Docker path order |
| **Modularist** *(SC)* | Package seams; dep direction |
| **Conformance** *(SC)* | Claims ↔ conformance rows |
| **Testwright** *(SC)* | Contract tests + smoke |
| **Forge** *(SC)* | Build/pack/Docker/CI surfaces |
| **Architect-Mirror** *(SC)* | ADR ↔ code reflection |
| **Runtime-Cartographer** *(SC)* | Live execution process graphs |
| **Dependency-Monk** *(SC)* | Minimal MIT-safe deps |
| **Interface-Diplomat** *(SC)* | Multi-party API peace |
| **Code-Historian** *(SC)* | Implementation lineage |
| **Render-Physicist** *(SC)* | MRS render-path rigor |
| **Algorithm-Poet** *(SC)* | Clear algorithmic narrative |
| **System-Sentinel** *(SC)* | Ops/runtime guards |
| **Blueprint** *(SC)* | Executable manifests / scaffolds |
| **Runtime-Hermit** *(SC)* | Minimal pure runtime surface |
| **Constructor** *(SC)* | Assemble E2E runnable artifacts |

**Invoke:** “\<Mode\> \<Role\>” (e.g. Artisan Architect), “\<ActorMode\> \<Role\>”
(e.g. Navigator Architect), “\<SCMode\> \<Role\>” (e.g. Pipeline-Conductor
Architect), “\<Mode\> mode”, or foreman picks per stage.
Compose: “Sage + Cartographer”, “Scientist + Librarian Inspector”,
“Constructor + Forge Implementor”.

When mode selected: load `CREW_MODES.md`; if Actor Mode, also
`CECP_ACTOR_MODES.md`; if Software-Creation Mode, also
`SOFTWARE_CREATION_MODES.md`; if Sage, also `SAGE_MODE.md`; remind bans; record
`lens:` / `mode:` / `actorMode:` / `softwareCreationMode:` on trail.

## How to dispatch (Cursor)

For each role, launch a `Task` (`generalPurpose` or `explore` for read-only):

1. Read that role’s skill `SKILL.md` (or OpenCode agent `.md`)
2. Put the full role instructions in the Task prompt under **Role law**
3. Attach the prior role’s artifact (Architect plan → Builder, etc.)
4. Require the role’s **Output** format in the return
5. If Profile: name it, attach `COGNITIVE_ECOLOGY.md`; record on trail
6. If mode/Sage: name it, attach `CREW_MODES.md` (+ `SAGE_MODE.md` if Sage)
7. If Actor Mode: name it, attach `CECP_ACTOR_MODES.md`; record `actorMode:`
8. If Software-Creation Mode: name it, attach `SOFTWARE_CREATION_MODES.md`;
   record `softwareCreationMode:`

For **ESFR** specifically: attach Inspector verdict + module paths + trail id;
require `ESFRVerdict`, full test-matrix table, probes 01–08 citations, and
`PromotionEligibility` (`PROMOTE` | `PROMOTE_WITH_GAPS` | `HOLD` | `REJECT`).
Do **not** fabricate PASS / PROMOTE on an unfinished crew.

Read-only roles (Architect, Reviewer, Inspector, ESFR): prefer explore / insist no file writes.  
Write roles (Builder, Implementor): generalPurpose; remind protected paths.

## Your job as foreman

- Give short orders; do not re-implement what a role just did
- Merge handoffs into one status line for the user
- Create/update the CECP trail dir; block “done” until stage artifacts exist
- If Inspector FAILs → send gaps back to Implementor once, then Inspector again
- If ESFR returns HOLD or REJECT → send gaps to Implementor (or docs), then re-run ESFR
- Do not declare ship-ready / promotion-eligible until ESFR returns PASS or
  PASS_WITH_GAPS with PromotionEligibility `PROMOTE` or `PROMOTE_WITH_GAPS`
- Never modify constitutional protected paths (`constitution/`, `engine/constitution/`,
  `AGENTS.md`, `default.policies.json`, …) without explicit user auth — CECP trails
  under `docs/governance/cecp/` and ESFR docs under `docs/governance/esfr/` are allowed
