# Constitutional Engineering Crew Protocol (CECP Ω∞)

> **Status (MRS local):** **partial** — six-role crew skills exist (Architect → …
> ESFR / Engineer Standards). Permanent trail artifacts under
> `docs/governance/cecp/trails/` are required; **stage 06 (ESFR) is required for
> new trails** but historical 01–05 trails are not rewritten. Full org-wide
> enforcement of trail writes is not claimed until CI gates exist and trails
> routinely include 06.
>
> **Status (cross-project):** **declared** only — Research OS, PARAGON One,
> Sovereign X OS, CIEMS, DAR-Z adoption is roadmap language, not present capability.
>
> **Authority:** Drive-G-1 (evidence-bound claims) · Drive-G-2 (maturity dimensions) ·
> MRS `AGENTS.md` (P1–P5). This protocol does **not** amend the constitutional charter.

ESFR package: `docs/governance/esfr/` (protocol, contract, promotion, pipeline
v2.0, test matrix, probes, lineage seed, agent card).

---

## 1. Purpose

CECP Ω∞ is the default **crew workflow** for Mandala Rendering Software (MRS): a
governed lineage from architecture through **ESFR (Engineer Standards Final
Reviewer)** where every stage leaves a **permanent, independently verifiable
evidence trail**.

It turns Prompt→Scene-class work from “a feature that shipped” into a **governed
reference implementation** with replayable stage artifacts.

## 2. Principles

| # | Principle | Meaning |
|---|-----------|---------|
| C1 | **Replayable** | Stage outputs are written to the repo (or named trail id) so a later agent/human can reconstruct decisions without chat memory. |
| C2 | **Independently verifiable** | Inspector verdicts cite commands, paths, and claim↔evidence rows — not author reputation. |
| C3 | **Constitutionally governed** | Roles obey `AGENTS.md` / charter principles; protected paths stay off-limits unless the user explicitly authorizes. |
| C4 | **Evidence-bound claims** | Status tags (**enforced** / **partial** / **declared** / **skeleton**) must match tests and code (Drive-G-1). |
| C5 | **Lineage over heroics** | Architecture → Build → Implementation → Review → Inspection → **ESFR**. Skip stages only when the user narrows scope. |

## 3. Role definitions and required artifacts

| Stage | Role | Writes product code? | Required trail artifact(s) |
|-------|------|----------------------|----------------------------|
| 1 | **Architect** | No | `01-architect-adr.md` — ADR + interface + boundary. Optional **Cognitive Ecology Profiles** (`COGNITIVE_ECOLOGY.md`, **partial** docs/skills) and optional **modes** (**30** lenses: waves 1–2 in `CREW_MODES.md` + Wave 3 Actor Modes in `CECP_ACTOR_MODES.md`): on **any** stage role — **not** new stages. Sage: `SAGE_MODE.md`. Precedence: **role bans > Constitution > Evidence > Profile > Mode**. CHEA/CCR/CDGF remain **declared**. |
| 2 | **Builder** | Stubs / scaffolds only | `02-builder-scaffold-manifest.md` — scaffold manifest, dependency graph, build-artifacts inventory. Optional Builder Sage. |
| 3 | **Implementor** | Yes | `03-implementor-notes.md` — production notes + test inventory. Optional Implementor Sage. |
| 4 | **Reviewer** | No | `04-reviewer-conformance.md` — constitutional conformance (P1–P5). Optional Reviewer Sage. |
| 5 | **Inspector** | No | `05-inspector-acceptance.md` — claim↔evidence, probes, verdict. Optional Inspector Sage. |
| 6 | **ESFR** (Engineer Standards Final Reviewer) | No | `06-engineer-standards.md` — standards ship gate + promotion. Optional ESFR Sage. |

Trail home (new trails — include stage 06 / ESFR):

```text
docs/governance/cecp/trails/<trail-id>/
  README.md                 # lineage index + status summary
  01-architect-adr.md
  02-builder-scaffold-manifest.md
  03-implementor-notes.md
  04-reviewer-conformance.md
  05-inspector-acceptance.md
  06-engineer-standards.md  # ESFR; required for new trails; optional stub note only on historical trails
  lineage.json              # optional machine-readable handoff (see schema)
```

**Historical trails:** existing 01–05 references remain valid evidence. Do **not**
rewrite them as if stage 06 had run. Optionally add an honest ESFR backfill that
cites Inspector gaps, or a one-line README note that ESFR was not yet in protocol
when the trail closed.

Reusable templates: `docs/governance/cecp/EVIDENCE_TRAIL_TEMPLATE.md`,
`docs/governance/cecp/lineage.schema.json`.

**Cognitive Ecology Ω∞ (optional):** Profiles answer “how should I think?” while
CECP Roles answer “what am I responsible for?” Canonical:
`docs/governance/cecp/COGNITIVE_ECOLOGY.md` (**partial** — docs/skills; not
runtime-enforced; metrics **declared** until trail-measured). Modes (**30**):
waves 1–2 in `CREW_MODES.md` + Wave 3 Actor Modes in `CECP_ACTOR_MODES.md`;
map to Profiles where overlap exists (**Strategist Mode ≠ Strategist Profile**).
Do not add stages.

Reference implementations (registry): see **§9** below. Layer stack context:
`docs/governance/CONSTITUTIONAL_LAYER_STACK.md` (CECP / CHEA / CCR / CDGF).
ESFR gates promotion across that stack (CHEA/CCR/CDGF remain **declared**).
Pipeline diagram: `docs/governance/esfr/pipeline.cecp-v2.md`. Test matrix:
`docs/governance/esfr/test-matrix.esfr.md`. Probes: `docs/governance/esfr/probes.esfr.md`.

## 4. Handoff / lineage schema

Logical chain:

```text
Architecture → Build → Implementation → Review → Inspection → ESFR
```

Each stage record SHOULD include:

| Field | Description |
|-------|-------------|
| `trailId` | Stable id (directory name), e.g. `prompt-scene-adapter-2026-07` |
| `stage` | `architect` \| `builder` \| `implementor` \| `reviewer` \| `inspector` \| `engineer_standards` \| `esfr` \| `acceptance` |
| `predecessor` | Prior stage id or null for Architect |
| `intent` | Declared purpose (P1) |
| `artifacts` | Paths written or cited this stage |
| `evidence` | Tests, commands, file citations |
| `statusTags` | Map of claim → tag |
| `handoff` | What the next role must do |
| `verdict` | Inspector: `PASS` \| `PASS_WITH_GAPS` \| `FAIL`. ESFR: `PASS` \| `PASS_WITH_GAPS` \| `HOLD` \| `REJECT` |

Machine shape: see `docs/governance/cecp/lineage.schema.json`.

### 4.1 PASS_WITH_GAPS is intended constitutional behavior

`PASS_WITH_GAPS` is **not** a soft failure. It is the preferred Inspector **and**
ESFR outcome when:

1. Core acceptance criteria for the trail are met with cited probes, **and**
2. Remaining gaps are listed explicitly with status tags and a promotion path.

Prefer accumulating evidence-backed CECP references (and closing gaps in later trails)
over one-off “green” features that hide incompleteness. Promote gaps only when new
tests/code evidence justify a stronger tag (Drive-G-1).

ESFR uses the same `PASS_WITH_GAPS` token for non-blocking ship/promotion gaps
after inspection (replaces older `PASS_WITH_NOTES`). `HOLD` means evidence is
insufficient; `REJECT` replaces older Standards `FAIL`.

## 5. Status tags

Use only these four (MRS / Drive-G-1):

| Tag | Meaning |
|-----|---------|
| **enforced** | Implementation + tests (or CI) prove the claim |
| **partial** | Some paths work / some tests pass; gaps listed |
| **declared** | Designed or roadmap; not implemented here |
| **skeleton** | Stub / identity / placeholder only |

Do not use “production ready” without naming **which maturity dimension** and audience (Drive-G-2).

## 6. Explicit non-goals

CECP Ω∞ does **not**:

- Replace the product / project **maturity scorecard** (`docs/scorecards/…`, Drive-G-2)
- Auto-amend `constitution/CHARTER.md`, `engine/constitution/*`, `AGENTS.md`, or `default.policies.json`
- Imply cross-org runtime gates (Research OS, PARAGON One, Sovereign X OS, CIEMS, DAR-Z)
- Guarantee that chat-only crew runs are complete — **trail files are the completion criterion**
- Substitute for the 16 MRS conformance checks on constitutional engine subsystems
- Runtime-enforce Cognitive Ecology Profiles or self-certifying cognitive metrics
  (`COGNITIVE_ECOLOGY.md` remains **partial** / metrics **declared**)

## 7. MRS crew skills ↔ CECP stages

| CECP stage | Cursor skill | OpenCode agent | Protocol duty |
|------------|--------------|----------------|---------------|
| Architect | `mrs-architect` (+ `SAGE.md`) | `architect.md` (`sage_mode` / `modes: optional`) | `01-architect-adr.md`. Optional Profiles: `COGNITIVE_ECOLOGY.md`. Optional modes: `CREW_MODES.md` + `CECP_ACTOR_MODES.md` (**partial**, 30). |
| Builder | `mrs-builder` | `builder.md` (`sage_mode` / `modes: optional`) | `02-builder-scaffold-manifest.md` (+ optional modes) |
| Implementor | `mrs-implementor` | `implementor.md` (`sage_mode` / `modes: optional`) | `03-implementor-notes.md` (+ optional modes) |
| Reviewer | `mrs-reviewer` | `reviewer.md` (`sage_mode` / `modes: optional`) | `04-reviewer-conformance.md` (+ optional modes) |
| Inspector | `mrs-inspector` | `inspector.md` (`sage_mode` / `modes: optional`) | `05-inspector-acceptance.md` (+ optional modes) |
| **ESFR** (Engineer Standards) | `mrs-engineer-standards` | `engineer-standards.md` (`sage_mode` / `modes: optional`) | `06-engineer-standards.md` (+ optional modes); final ship gate |
| Foreman | `mrs-crew` (+ profiles / modes hub) | — | Trail dir; stage files; assign Role + optional Profile + optional Mode per stage |

**Foreman rule:** after each role returns, ensure the corresponding trail file exists under
`docs/governance/cecp/trails/<id>/` before starting the next stage. Full protocol text lives
here; skills keep one-line pointers (progressive disclosure). Do not treat a crew run as
ship-ready / promotion-eligible until ESFR returns `PASS` or `PASS_WITH_GAPS` (new trails).
See `docs/governance/esfr/promotion.esfr.md`.

**Read-only roles vs trail writes:** Architect / Reviewer / Inspector / ESFR
remain banned from product/source edits; writing CECP trail markdown under
`docs/governance/cecp/trails/` is part of the protocol and is the permanent evidence
channel (foreman may write trails from role returns if a subagent cannot write).

## 8. Cross-project adoption (**declared**)

The following orgs/products may adopt CECP Ω∞ later. Until each has its own trail home,
skills, and evidence, treat this section as **declared** roadmap only:

| Project / OS | Adoption status |
|--------------|-----------------|
| Mandala Rendering Software (MRS) | **partial** (this document + skills + reference trails) |
| Research OS | **declared** |
| PARAGON One | **declared** |
| Sovereign X OS | **declared** |
| CIEMS | **declared** |
| DAR-Z | **declared** |

Do not claim “CECP enforced across Drive G” without per-repo artifacts.

## 9. Reference implementations registry

CECP Ω∞ prefers **accumulating governed references** (full stage trails + honest
tags) over one-off features. Registry below is evidence-bound (Drive-G-1).
**New** references should include stages 01–06 (ESFR); registry rows closed before
stage 06 remain 01–05 evidence unless an honest ESFR backfill is added.

| # | Reference | Trail | SoT / contract | Inspector | ESFR | Notes |
|---|-----------|-------|----------------|-----------|------|-------|
| **1** | Prompt→Scene adapter | `docs/governance/cecp/trails/prompt-scene-adapter-2026-07/` | `mrs/adapters/prompt-scene-bridge/` · `CONTRACT.md` | **PASS_WITH_GAPS** | N/A (pre-ESFR) | First CECP Ω∞ reference. Mapping + Genblaze HTTP **enforced**; contemporaneous expand stub **skeleton** (see follow-ons). |
| 1a | Engine3D world expand (follow-on) | `docs/governance/cecp/trails/engine3d-expand-2026-07/` | `engine3d-core` expand CLI + bridge opt-in | **PASS** | N/A (pre-ESFR) | Closes empty-world gap from #1 for star/mandala when Node/`dist` present; default stub still **partial**. |
| 1b | Prompt→Scene Docker wiring (follow-on) | `docs/governance/cecp/trails/prompt-scene-docker-2026-07/` | repo-root `Dockerfile` + Genblaze `/app` layout | **PASS_WITH_GAPS** | N/A (pre-ESFR) | Operator image path; live daemon/Render gaps listed. |
| **2** | Prompt→Scene→4D-ProtonRaster (six mods) | `docs/governance/cecp/trails/proton-raster-2026-07/` | `mrs/packages/renderer-core/src/render/rt4d/proton/` · `mrs/adapters/proton-raster-bridge/CONTRACT.md` | **PASS_WITH_GAPS** | **PASS_WITH_GAPS** (**partial** backfill) | Second CECP Ω∞ reference. Six CPU mods + PNG **enforced**; Genblaze host **partial**; anisotropic/GPU/roadmap mods **declared**. Landmark commit: `8fa2bc3`. ESFR seed: `docs/governance/esfr/lineage.esfr.json`. |
| **3** | StoryForge Runtime boundary freeze | `docs/governance/cecp/trails/storyforge-runtime-boundary-2026-07/` | `mrs/adapters/storyforge-boundary/` · `BOUNDARY.md` · `CONTRACT.md` | **PASS_WITH_GAPS** | **PASS_WITH_GAPS** | RenderRequest/RenderResult crossing freeze; SF upstream **declared**; deep execute follow-on #3a. |
| 3a | StoryForge→MRS pipeline v1.0 (follow-on) | `docs/governance/cecp/trails/storyforge-mrs-pipeline-v1-2026-07/` | `execute.py` · `run_pipeline.py` · Docker COPY/ENV | **PASS_WITH_GAPS** | **PASS_WITH_GAPS** | CLI/smoke PNG + hashes **partial**; Genblaze `/api/render-request` opt-in; Docker Desktop daemon gap at close. |
| **3b** | StoryForge→4D full run (HQ demo) | `docs/governance/cecp/trails/storyforge-4d-full-run-2026-07/` | `demo_full_run.py` · HQ proton splat · Genblaze smoke | **PASS** | **PASS** / **PROMOTE** | MRS RenderRequest→pixels **enforced**; SF upstream **declared**; PNGs under `output/cecp-full-run/`. |

**Promotion rule:** a new feature becomes a numbered reference only when it has a
complete trail (01–06 + README for trails started after ESFR was added; 01–05 +
README for historical references), claim↔evidence rows, an Inspector verdict, and
(for new trails) an ESFR ship-gate verdict (`PASS` or `PASS_WITH_GAPS`). Gaps stay
tagged until a follow-on trail promotes them. **No promotion without ESFR** on new
trails (`docs/governance/esfr/promotion.esfr.md`).

Layer framing (how CECP relates to CHEA / CCR / CDGF):  
`docs/governance/CONSTITUTIONAL_LAYER_STACK.md`.

---

> “No action without evidence. No claim without proof. No system without governance.”
> — Constitutional Engine Charter v1.0 (cited; not amended by this protocol)
