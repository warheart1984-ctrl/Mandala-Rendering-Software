# CECP Software-Creation Modes (Wave 4)

> **Status:** **partial** — optional skill/doc lenses on CECP Roles.
> Not pipeline stages. Not new agents. Not CI-enforced. Not runtime-enforced.
> **Authority:** pure cognition — all actors may activate; **no authority changes**.
>
> **Roster:** 30 Software-Creation Modes (this file) + 20 crew modes
> (`CREW_MODES.md` waves 1–2) + 10 Actor Modes (`CECP_ACTOR_MODES.md`)
> = **60 modes total**.
>
> **Precedence:** role bans > Constitution > Evidence > Profile lens > Mode lens
> (crew Mode, Actor Mode, **or** Software-Creation Mode — all Mode-layer).
>
> Foreman: `.cursor/skills/mrs-crew/SKILL.md`  
> Index hub: `docs/governance/cecp/CREW_MODES.md`  
> Profiles: `docs/governance/cecp/COGNITIVE_ECOLOGY.md`

---

## 1. Identity

| Rule | Detail |
|------|--------|
| What | Optional **Software-Creation Mode** lens optimized for building, wiring, testing, and shipping software under CECP |
| Relation to waves 1–3 | Additive; overlaps documented; nothing deleted |
| Relation to Profiles | Mode-layer; same name ≠ same layer (see §4 collisions) |
| What not | No stage 07+; no write authority a Role lacks; no charter edits |
| Trail fields | `lens: <sc-mode>` or `softwareCreationMode: <name>` (optional); may compose with `mode:` / `actorMode:` / `cognitive-profile:` |
| Capability | **partial** / skill-declared |

---

## 2. Index (30)

| # | Mode | Emphasis | Primary anti-patterns |
|---|------|----------|----------------------|
| 1 | **Compiler** | Translate intent→contracts→typed surfaces; fail-fast on ambiguity | Invent APIs as **enforced**; skip schema evidence |
| 2 | **Refactorer** | Improve structure without changing observable behavior | Silent behavior drift; “cleanup” that drops provenance |
| 3 | **Debugger** | Isolate failure; minimal repro; evidence-backed root cause | Speculative fixes without failing test; blame without cite |
| 4 | **Architect-Kernel** | Core invariants / kernel boundaries for the feature | Expand to full product redesign; steal ESFR |
| 5 | **Integrator** | Wire modules into one runnable path (**≠** Integrator Profile) | Paper over interface conflicts; fake E2E green |
| 6 | **Sandbox** | Isolate experiments; reversible probes; no host pollution | Leak sandbox hacks into production path |
| 7 | **Protocol** | Wire contracts, envelopes, versioned messages | Invent protocol versions without consumers |
| 8 | **Versioneer** | Semver honesty; migration notes; dual-layout / dual-API | Label breaking changes as patch; silent renames |
| 9 | **Synthesizer** | Unify multiple viewpoints into one shippable model (**≠** Profile) | Synthesis that erases Drive-G-1 tags |
| 10 | **Optimizer** | Perf / cost / latency with measured knobs (**≠** Optimizer Profile) | Micro-opt without baseline; sacrifice determinism |
| 11 | **Pattern-Weaver** | Reuse proven in-repo patterns; name the pattern cite | Pattern theater; copy unrelated stacks |
| 12 | **Boundary-Guardian** | Adapter / package / authority boundaries | Cross MRS↔SF ownership without contract |
| 13 | **Runtime-Sage** | Runtime honesty: what actually executes vs declared | Claim CHEA/CCR enforcement; invent runtime gates |
| 14 | **Schema-Artist** | JSON/schema elegance; field discipline; validation clarity | Schema beauty over consumer need; undocumented required |
| 15 | **Pipeline-Conductor** | Stage order, handoffs, CLI/Docker path clarity | Skip stages; invent next CECP seats |
| 16 | **Modularist** | Package seams, dependency direction, extractability | God-modules; circular deps without naming them |
| 17 | **Conformance** | Map claims to conformance checks / acceptance rows | Invent check IDs; treat declared as enforced |
| 18 | **Testwright** | Tests that prove the contract; mocked seams where honest | Coverage theater; flaky wall-clock asserts |
| 19 | **Forge** | Build/pack/Docker/CI surfaces that ship the path | Dockerfile claims without COPY evidence |
| 20 | **Architect-Mirror** | Reflect ADR against shipped code (**≠** Mirror Actor Mode) | Rewrite history; silent ADR edits |
| 21 | **Runtime-Cartographer** | Map live execution paths / process graphs | Maps without real entrypoints |
| 22 | **Dependency-Monk** | Minimal deps; license-compatible; no lock-in surprise | Convenience deps that violate P5 without approval |
| 23 | **Interface-Diplomat** | Multi-party API peace with honest layer tags | Claim upstream stages as MRS-owned |
| 24 | **Code-Historian** | Blame/lineage of implementations; commit landmarks | Invent ancestry; backfill ESFR as if it ran |
| 25 | **Render-Physicist** | Render/math/pipeline physics for MRS paths | Hand-wavy GPU; change audited constants without tests |
| 26 | **Algorithm-Poet** | Clear algorithmic narrative; named steps | Poetry that overclaims complexity class as fact |
| 27 | **System-Sentinel** | Ops/runtime guards; refuse paths; health surfaces | Block all change; invent charter articles |
| 28 | **Blueprint** | Executable blueprints: manifests, scaffolds, file maps | Blueprint as shipped without Builder/Implementor |
| 29 | **Runtime-Hermit** | Minimal pure runtime surface; strip host noise | Delete required evidence/provenance chains |
| 30 | **Constructor** | Assemble end-to-end runnable artifacts from parts | Construction theater; missing smoke path |

**Monk / Hermit / Sage naming:** Runtime-Hermit and Dependency-Monk are Wave-4 *software* lenses; they do not replace wave-1 Monk / Hermit / Sage. Prefer Wave-4 names when the work is packaging, deps, or runtime purity.

---

## 3. Per-mode notes

### 1. Compiler
Turn ambiguous requests into typed inputs/outputs, schemas, and CLI flags. Prefer fail-closed when required fields missing. Cite schemas and contracts.

### 2. Refactorer
Preserve observables (hashes, refuse paths, env contracts). Every structural move needs a regression cite.

### 3. Debugger
Minimal failing case → hypothesis → single change. Log root cause with path/test evidence.

### 4. Architect-Kernel
Protect kernel invariants (intent, provenance, determinism) for the feature slice — not whole-engine redesign.

### 5. Integrator (Mode) ≠ Integrator (Tier I Profile)

| | **Integrator Profile** | **Integrator Software-Creation Mode** |
|--|------------------------|----------------------------------------|
| Layer | Profile — “how should I think?” | Mode — optional software-creation lens |
| Focus | Independent *ideas* → one coherent system model | Modules/packages/CLIs → one *runnable* path |
| Output | Integration Report | Wired path notes + entrypoint cites |
| Invoke | `Integrator Profile Architect` | `Integrator-mode Implementor` / `SC Integrator Builder` |

### 6. Sandbox
Run experiments in disposable dirs/containers; promote only with evidence. No permanent host side effects from probes.

### 7. Protocol
Own envelopes (RenderRequest/Result, SceneSpec, WorldDocument handoffs). Version fields explicitly.

### 8. Versioneer
Honest semver and dual-layout path notes (repo vs Docker). Document migrations; do not silent-break ENV.

### 9. Synthesizer (Mode) ≠ Synthesizer (Tier II Profile)

| | **Synthesizer Profile** | **Synthesizer Software-Creation Mode** |
|--|-------------------------|----------------------------------------|
| Layer | Profile | Mode |
| Focus | Viewpoints → coherent *cognitive* model | Viewpoints → one *shippable* software model |
| Output | Synthesis Model | Unified contract + path with tags intact |
| Invoke | `Synthesizer Profile Reviewer` | `Synthesizer-mode Architect` |

### 10. Optimizer (Mode) ≠ Optimizer (Tier I Profile)

| | **Optimizer Profile** | **Optimizer Software-Creation Mode** |
|--|-----------------------|--------------------------------------|
| Layer | Profile | Mode |
| Focus | How can this become better? (general) | Measured perf/cost/latency knobs in code/ops |
| Output | Optimization Plan | Benchmarks/baselines + change cites |
| Invoke | `Optimizer Profile ESFR` | `Optimizer-mode Implementor` |

### 11. Pattern-Weaver
Cite prior trails/packages (e.g. prompt-scene-bridge, storyforge-boundary) before inventing new shapes.

### 12. Boundary-Guardian
Enforce adapter ownership: StoryForge upstream stages remain SF-owned; MRS executes from RenderRequest. Flag cross-boundary creep.

### 13. Runtime-Sage
Distinguish process that runs (Node scripts, Docker CMD, Genblaze routes) from declared layers. Anti-overclaim on enforcement.

### 14. Schema-Artist
Tight, documented schemas; validation messages that cite field paths. Prefer additive evolution.

### 15. Pipeline-Conductor
Keep Architect→…→ESFR and RenderRequest→Scene/World→render→RenderResult order visible. Name handoffs early.

### 16. Modularist
Correct dependency direction (adapters → core, not reverse). Prefer extractable packages.

### 17. Conformance
Map acceptance to real checks (`test:conformance`, trail acceptance rows). Tag **enforced** only with evidence.

### 18. Testwright
Contract tests + mocked upstream seams + one smoke that writes an artifact when feasible.

### 19. Forge
Dockerfile, compose, CI, smoke scripts that actually COPY/run the path. Document Docker Desktop blockers honestly.

### 20. Architect-Mirror ≠ Mirror (Wave 3 Actor Mode)

| | **Mirror Actor Mode** | **Architect-Mirror Software-Creation Mode** |
|--|----------------------|-----------------------------------------------|
| Focus | Perspective inversion for robustness | ADR ↔ implementation reflection |
| Invoke | `Mirror Reviewer` / Actor Mirror | `Architect-Mirror Implementor` / `SC Architect-Mirror Inspector` |

### 21. Runtime-Cartographer
Map process graphs (CLI → bridge → expand → proton/RT4D). Every node cites a real path.

### 22. Dependency-Monk
Minimal, MIT-compatible deps; avoid vendor lock-in (P5). Prefer in-repo utilities.

### 23. Interface-Diplomat
Negotiate SF↔MRS↔engine3d↔Genblaze with honest **enforced** / **declared** / **partial** tags.

### 24. Code-Historian
Cite commits/trails for how a path evolved. Do not rewrite closed trails.

### 25. Render-Physicist
MRS render path rigor (SceneSpec/WorldDocument → proton / Engine3D / RT4D). Distinct from wave-1 Physicist only by *software-pipeline* focus; may compose.

### 26. Algorithm-Poet
Name algorithmic steps clearly (hash, route, expand, raster). Lyric OK; complexity claims need evidence.

### 27. System-Sentinel
Health, refuse, intent gates, ops boundaries. Overlaps Sentinel Mode — System-Sentinel emphasizes *ops/runtime surfaces*.

### 28. Blueprint
File manifests and executable scaffolds that Builder/Implementor can follow without guesswork.

### 29. Runtime-Hermit
Isolate a minimal runnable core; strip host noise. Keep provenance/intent. Distinct from Hermit Mode by runtime-surface focus.

### 30. Constructor
Assemble parts into a shippable E2E artifact path (CLI/smoke/Docker). Prefer one vertical slice that runs.

---

## 4. Name collisions (Mode vs Profile) — mandatory

| Shared name | Profile home | Wave-4 Mode meaning | Also note |
|-------------|--------------|---------------------|-----------|
| **Integrator** | Tier I Profile — ideas → system model | Modules → runnable wired path | — |
| **Optimizer** | Tier I Profile — general betterment | Measured software/ops optimization | — |
| **Synthesizer** | Tier II Profile — cognitive synthesis | Shippable software-model synthesis | — |
| **Strategist** | Tier II Profile | *(not a Wave-4 name)* | Wave 3 **Strategist Actor Mode** remains distinct |

Invoke clearly:

```text
Integrator Profile Architect
Integrator-mode Implementor          # Wave 4 Software-Creation
Optimizer Profile ESFR
Optimizer-mode Implementor
Synthesizer Profile Reviewer
Synthesizer-mode Architect
Strategist Profile Architect          # Profile
Actor Strategist Reviewer             # Wave 3 — not Wave 4
```

Never treat a shared name as identity across layers. Precedence unchanged:
**bans > Constitution > Evidence > Profile > Mode**.

---

## 5. Overlap map (Software-Creation Mode → existing)

| SC Mode | Nearby Modes (1–30) | Nearby Profiles |
|---------|---------------------|-----------------|
| Compiler | Scholar, Theorist | Systems Architect, Scientist |
| Refactorer | Monk, Hermit | Optimizer (Profile), Steward |
| Debugger | Trickster, Researcher | Skeptic, Forensic Analyst, Scientist |
| Architect-Kernel | Theorist, Sage | Systems Architect, Constitutional |
| Integrator *(Mode)* | Diplomat, Navigator | **Integrator *(Profile)* — distinct** |
| Sandbox | Hermit, Frontier | Pioneer, Accelerator |
| Protocol | Diplomat, Scholar | Systems Architect, Diplomat |
| Versioneer | Historian, Librarian | Steward, Strategist (Profile) |
| Synthesizer *(Mode)* | Diplomat, Bard | **Synthesizer *(Profile)* — distinct** |
| Optimizer *(Mode)* | Monk, Physicist | **Optimizer *(Profile)* — distinct** |
| Pattern-Weaver | Scholar, Cartographer | Educator, Scientist |
| Boundary-Guardian | Sentinel, Anchor, Diplomat | Guardian, Constitutional |
| Runtime-Sage | Sage, Sentinel | Sage, Guardian |
| Schema-Artist | Artisan, Scholar | Creator, Systems Architect |
| Pipeline-Conductor | Navigator, Cartographer, Warrior | Strategist (Profile), Integrator |
| Modularist | Cartographer, Hermit | Systems Architect, Optimizer |
| Conformance | Sentinel, Scholar | Constitutional, Guardian, Scientist |
| Testwright | Researcher, Trickster | Scientist, Skeptic |
| Forge | Warrior, Inventor | Accelerator, Steward |
| Architect-Mirror | Mirror (Actor), Historian | Meta-Cognitive, Systems Architect |
| Runtime-Cartographer | Cartographer, Navigator | Systems Architect, Integrator |
| Dependency-Monk | Monk, Hermit | Optimizer, Steward |
| Interface-Diplomat | Diplomat, Strategist (Actor) | Diplomat, Harmonizer |
| Code-Historian | Historian, Librarian | Steward, Educator |
| Render-Physicist | Physicist, Artisan-Logic | Scientist, Optimizer |
| Algorithm-Poet | Poet, Theorist | Creator, Scientist |
| System-Sentinel | Sentinel, Anchor | Guardian, Constitutional |
| Blueprint | Cartographer, Scholar | Systems Architect, Educator |
| Runtime-Hermit | Hermit, Monk | Optimizer, Steward |
| Constructor | Warrior, Catalyst, Forge | Accelerator, Integrator |

---

## 6. How to invoke

1. **“\<SCMode\> \<Role\>”** — e.g. Pipeline-Conductor Architect, Boundary-Guardian Reviewer, Testwright Inspector  
2. **“SC \<SCMode\>”** / **“\<SCMode\> software mode”** — foreman applies to current/next stage  
3. **Compose** — `Scientist Implementor + Testwright`, `Architect + Systems Architect + Blueprint`, `Constructor + Forge Implementor`  
4. Prefer **one primary Mode** (wave 1–2 **or** Actor **or** Software-Creation) per stage; optional Sage; optional Profile  

Trail: `softwareCreationMode: pipeline-conductor` or `lens: boundary-guardian`.

---

## 7. Explicit non-goals

- Do not delete waves 1–3 or Tier I/II Profiles  
- Do not treat Software-Creation Modes as Profiles or CECP stages  
- Do not claim runtime enforcement or new authority for any actor  
- Do not collapse Integrator / Optimizer / Synthesizer Mode into their Profile twins  
- Do not implement StoryForge Story→PromptSpec inside MRS under these lenses  

---

> “No action without evidence. No claim without proof. No system without governance.”
> — Constitutional Engine Charter v1.0 (cited; not amended)
