# 01 — Architect ADR: StoryForge Runtime Boundary (MRS intake)

| Field | Value |
|-------|-------|
| Trail | `storyforge-runtime-boundary-2026-07` |
| Stage | Architect |
| Mode | **sage** + multi-mode counsel (all 20) |
| Predecessor | CECP §9 #1 Prompt→Scene, #1a Engine3D expand, #2 Proton raster |
| Date | 2026-07-27 |
| Status | **partial** (boundary freeze; SF upstream **declared**) |

---

## Intent

**What:** Freeze the MRS-side crossing contract for StoryForge Runtime Spec v1.0:
only **RenderRequest** enters MRS; MRS returns **RenderResult**. Map existing
Prompt→Scene / proton / Engine3D surfaces honestly as **partial** relative to
this v1.0 pipeline.

**Why:** Ownership freeze — StoryForge owns Story→…→RenderRequest; MRS owns
Engine3D, RT4D, geometry, materials, lighting, rendering, provenance, evidence,
RenderResult. Prevent MRS from absorbing PromptComposer / IModelBackend /
RenderIntent mutation.

**Who:** User-canonical StoryForge Runtime Spec v1.0 (SoT for boundary).

---

## ADR decision

### Context

Canonical SF pipeline (SoT):

```text
Story → Scene → Shot → RenderIntent → PromptComposer → immutable PromptSpec
  → IModelBackend → RenderRequest → **MRS** → RenderResult
```

Existing MRS surfaces (evidence):

| Surface | Path | Relation to SF v1.0 |
|---------|------|---------------------|
| Prompt→Scene request | `mrs/adapters/prompt-scene-bridge/` (`prompt` string → SceneSpecification) | **partial** precursor — prompt-shaped, not RenderRequest |
| Engine3D world expand | engine3d-core expand via bridge opt-in | **partial** — geometry path, not SF RenderRequest |
| Proton raster request | `mrs/adapters/proton-raster-bridge/` | **partial** — prompt/CIR/scene optional; not SF RenderRequest |
| CROS `RenderIntent` / `RenderResult` | `mrs/packages/cros/src/cros/artifacts.py` | **Different lineage** (Creative OS). Do **not** conflate with SF RenderIntent / RenderResult |

### Decision

1. Ship MRS adapter `mrs/adapters/storyforge-boundary/` with:
   - `RenderRequest.schema.json` (intake)
   - `RenderResult.schema.json` (output)
   - `BOUNDARY.md` ownership restatement
   - Minimal validator + router that accepts RenderRequest JSON and routes to
     existing MRS paths **or** returns honest skeleton/refuse — **no** SF
     PromptComposer / IModelBackend inside MRS
2. Pointer docs under `docs/contracts/storyforge-runtime/`
3. StoryForge stages (RenderIntentBuilder, PromptComposer, …) remain **declared**
   (owner StoryForge) — MRS does not implement them
4. Ban preserved: no `story_forge` / `storyforge` strings in Genblaze `app/*.py`;
   no importing StoryForge into MRS app hosts

### Alternatives considered

| Option | Verdict |
|--------|---------|
| Treat Prompt→Scene as full SF RenderRequest | **Rejected** — overclaim; shapes differ |
| Implement PromptComposer in MRS | **Rejected** — ownership breach |
| Alias CROS RenderIntent as SF RenderIntent | **Rejected** — different product lineage |
| Dual-write SF fields into Genblaze app | **Rejected** — string ban |

### Consequences

- **Positive:** Clear freeze line; Drive-G-1 honesty; ESFR can promote-with-gaps
- **Tradeoff:** Full end-to-end SF→MRS render stays **partial** until SF ships
  RenderRequest producers and MRS deep-routes are wired
- **Non-decision:** SF RenderIntentBuilder implementation; CHEA/CCR/CDGF enforcement

### Invariants

1. MRS never mutates RenderIntent or PromptSpec bodies (opaque hashes only)
2. Only RenderRequest crosses into MRS execution
3. RenderResult carries provenance fields required by MRS conformance culture
   (`intentId`, `worldId`, optional `timelineId`, `timeSeconds`, `parameters`)
4. Genblaze `app/*.py` remains free of narrative-package tokens
5. CROS artifact kinds remain distinct from SF boundary schemas (name collision risk documented)

---

## Interface specification

### RenderRequest (MRS intake) — status **partial** (schema + validator this trail)

Required (Architect contract):

| Field | Type | Notes |
|-------|------|-------|
| `schemaVersion` | `"1.0"` | Boundary version |
| `requestId` | string | Opaque id from SF |
| `intentId` | string | MRS provenance / refuse-without-intent culture |
| `worldId` | string | Required for play/render governance alignment |
| `payload.route` | enum | `scene-spec` \| `engine3d-world` \| `proton-raster` \| `rt4d` |
| `payload.render` | object | width/height/samples/seed/quality (execution knobs) |

Optional:

| Field | Notes |
|-------|-------|
| `timelineId`, `timeSeconds`, `parameters` | Provenance frame fields |
| `provenance.promptSpecHash` | Opaque — MRS must not fetch/mutate PromptSpec |
| `provenance.renderIntentHash` | Opaque — MRS must not mutate RenderIntent |
| `payload.sceneSpecification` | When route needs SceneSpecification |
| `payload.engine3dWorldDocument` | When route needs Engine3D world |
| `payload.worldDocumentRt4d` | When route needs RT4D world |

**Ban constraints:** Schema/docs may name StoryForge; Genblaze `app/*.py` must not
contain `story_forge` / `storyforge`. Adapter must not import StoryForge packages
into MRS app process.

### RenderResult (MRS output) — status **partial**

| Field | Notes |
|-------|-------|
| `schemaVersion`, `requestId`, `status` | `ok` \| `error` \| `refused` |
| `provenance` | intentId, worldId, timelineId?, timeSeconds?, parameters? |
| `artifacts[]` | uri, sha256, role, mediaType |
| `routeUsed` | Which MRS path ran |
| `mapping` | Declared notes of what mapped (skeleton OK) |
| `error` | When status ≠ ok |

---

## Constitutional boundary analysis

| Boundary | Rule |
|----------|------|
| **In scope (MRS)** | Schemas, BOUNDARY.md, validate+route adapter, tests, CECP trail |
| **Out of scope** | SF RenderIntentBuilder, PromptComposer, IModelBackend, Story/Scene/Shot authors |
| **Protected paths** | No edits to `constitution/`, `engine/constitution/`, policies, `AGENTS.md` |
| **P1** | Intent declared (this ADR) |
| **P2** | Evidence via schemas + tests |
| **P3** | Scope = boundary adapter only |
| **P4** | Deterministic validate; no wall-clock in content hashes of fixtures |
| **P5** | No new vendor lock-in |

---

## File manifest

| Path | Action | Owner role |
|------|--------|------------|
| `mrs/adapters/storyforge-boundary/BOUNDARY.md` | Create | Architect → Maintain |
| `mrs/adapters/storyforge-boundary/CONTRACT.md` | Create | Architect → Implementor |
| `mrs/adapters/storyforge-boundary/README.md` | Create | Builder |
| `mrs/adapters/storyforge-boundary/schemas/RenderRequest.schema.json` | Create | Builder/Implementor |
| `mrs/adapters/storyforge-boundary/schemas/RenderResult.schema.json` | Create | Builder/Implementor |
| `mrs/adapters/storyforge-boundary/validate_request.py` | Create | Implementor |
| `mrs/adapters/storyforge-boundary/route.py` | Create | Implementor (minimal / skeleton routes) |
| `mrs/adapters/storyforge-boundary/stubs/mapping_notes.md` | Create | Builder |
| `mrs/adapters/storyforge-boundary/fixtures/sample-render-request.json` | Create | Builder |
| `mrs/adapters/storyforge-boundary/test_boundary.py` | Create | Implementor |
| `docs/contracts/storyforge-runtime/README.md` | Create | Builder (pointer) |
| `docs/governance/cecp/trails/storyforge-runtime-boundary-2026-07/*` | Create | Foreman / all roles |

---

## Acceptance tests

- [ ] Valid fixture RenderRequest validates
- [ ] Missing `intentId` or `worldId` refused
- [ ] Unknown `payload.route` refused
- [ ] Router does not import PromptComposer / IModelBackend
- [ ] No `story_forge`/`storyforge` under Genblaze `app/*.py` (existing ban tests still green)
- [ ] BOUNDARY.md states SF vs MRS ownership
- [ ] Docs claim bridge to SF v1.0 as **partial**, not enforced end-to-end

---

## Anti-overclaim

- Must **not** claim SF PromptComposer / IModelBackend / RenderIntentBuilder are
  implemented or enforced in MRS
- Must **not** claim Prompt→Scene **is** RenderRequest (it is a **partial** precursor)
- Must **not** claim CROS RenderIntent ≡ SF RenderIntent
- CHEA / CCR / CDGF remain **declared**
- Maturity: operator-facing contract freeze — **not** “production ready” commercial SF↔MRS

## Sage counsel

1. Prove schema + validate + refuse paths first (Warrior/Monk slice)
2. Route `scene-spec` by accepting embedded SceneSpecification (no prompt compose)
3. Leave proton/engine3d/rt4d deep execution as **skeleton** routing notes unless
   fixtures already carry payload
4. Inspector should expect **PASS_WITH_GAPS**; ESFR **PROMOTE_WITH_GAPS** if bans hold
5. Do not expand Genblaze HTTP in this trail unless needed for ban regression

## Cross-reference ledger

| CECP §9 / trail | Relevance | Coherence note |
|-----------------|-----------|----------------|
| #1 `prompt-scene-adapter-2026-07` | Precursor prompt→scene | Keep as sibling; do not rename as SF RenderRequest |
| #1a `engine3d-expand-2026-07` | World expand | Optional route target **skeleton** |
| #1b Docker | Host layout | Out of scope this trail |
| #2 `proton-raster-2026-07` | Proton path | Optional route target **skeleton**/partial |
| CROS artifacts | Name collision | Document distinction in BOUNDARY.md |

## Risks to sovereignty / determinism

- Name collision CROS↔SF could cause silent wrong imports — mitigate with distinct
  schema `$id` under `storyforge-boundary`
- Temptation to pull SF src into Genblaze — ban + tests
- Wall-clock in hashes — fixtures use fixed ids; validate does not mint time into content hash

## Handoff to Builder

Create scaffold per file manifest; stubs labeled **skeleton** / **declared**;
no PromptComposer logic; schemas match Interface specification above.

---

## Multi-mode counsel

One short voice per mode (Architect Sage round). Precedence: role bans > Sage > lens.
Trickster/Inventor/Visionary must not invent ownership breaches.

| Mode | Notices / recommends |
|------|----------------------|
| **Sage** | Freeze only the crossing; tag SF upstream **declared**; Prompt→Scene stays **partial** precursor. |
| **Trickster** | What if RenderRequest embeds a mutable `promptSpec` body? Refuse — hashes only; add test for banned keys. |
| **Warrior** | Ship schemas + validate + one fixture + ban regression. Cut Genblaze HTTP from this trail. |
| **Monk** | One adapter package; two schemas; one router; no parallel “SF bridge v2” names. |
| **Researcher** | Cite §9 #1/#2 CONTRACT paths; hypothesis: validate refuse without intentId falsifies P1 culture. |
| **Journalist** | Who: MRS. What: RenderRequest intake. When: 2026-07-27. Evidence: schemas + tests. SF builder: elsewhere. |
| **Poet** | The border is a sealed gate: StoryForge forges the arrow; MRS looses it — never rewrites the quiver. |
| **Physicist** | Render knobs (samples, seed) are execution units; do not smuggle PromptSpec “energy” into MRS state. |
| **Theorist** | Invariant: opaque provenance hashes; MRS purity of non-mutation on SF-owned stages. |
| **Bard** | Judge story: “We froze the handshake, not the novel.” Trail id in the epic. |
| **Oracle** | Drift risk: dual RenderIntent vocabularies (CROS vs SF). Forecast follow-on rename/alias doc — **declared**. |
| **Cartographer** | Map: SF pipeline nodes → MRS only at RenderRequest node; draw Prompt→Scene as side path. |
| **Artisan** | Beauty stays in MRS render/tonemap paths; do not claim HQ plates from boundary alone. |
| **Sentinel** | Guard Genblaze string ban; guard protected charter paths; guard no SF import in app. |
| **Scholar** | Contracts live under adapter + `docs/contracts/storyforge-runtime/` pointer; claim↔tag table mandatory. |
| **Inventor** | Novel “auto-compose PromptSpec inside MRS” idea = **declared** and **out of ownership** — do not ship. |
| **Diplomat** | Align Genblaze ↔ renderer-core ↔ engine3d via RenderRequest payload routes; CHEA/CCR/CDGF **declared**. |
| **Hermit** | Extract pure validate+schema core; refuse entanglement with SF package trees. |
| **Historian** | Lineage: Prompt→Scene (2026-07) then Proton (#2) then this boundary freeze — do not rewrite #1 as SF. |
| **Visionary** | Future unified creative OS spanning SF+CROS — roadmap only; anti-overclaim: not this trail’s capability. |
