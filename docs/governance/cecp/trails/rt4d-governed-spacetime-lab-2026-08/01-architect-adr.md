# 01 — Architect ADR — RT4D Governed Spacetime / Temporal-State Lab

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-governed-spacetime-lab-2026-08` |
| `feature` | Governed spacetime + temporal-state laboratory (Phase-1) |
| `role` | Architect Sage |
| `mode` | `sage` |
| `lens` | Physicist + Theorist + Cartographer + Visionary |
| `actorMode` | Navigator + Architect-Shadow + Anchor + Historian + Mythweaver |
| `softwareCreationMode` | Compiler + Architect-Kernel + Protocol + Schema-Artist + Boundary-Guardian + Pipeline-Conductor + Synthesizer + Blueprint + Modularist + Pattern-Weaver + Interface-Diplomat + Code-Historian + Render-Physicist + Algorithm-Poet + Architect-Mirror |
| `cognitive-profile` | Strategist Profile + Integrator Profile + Scholar (`COGNITIVE_ECOLOGY.md`; Mode≠Profile) |
| `status` | **partial** (design complete; implementation Phase-1 scoped) |
| `started` | 2026-08-02 |

## Intent

Capture the operator’s corrected architecture as an evidence-bound CECP ADR and define a **Phase-1 shippable scaffold**: metric plug-in, Lorentz vs Euclidean transform family split, four non-collapsed lab modes, temporal evidence envelope, and governed temporal ops (fork/rewind/slice/compare/prune; merge as declared stub).

**Why:** Renaming \(W\to t\) without a metric change is mathematically incorrect. Collapsing visualization / replay / counterfactual editing into “time travel” overclaims. The product is a **constitutional temporal computation lab**, not a physical time machine.

**Who:** Operator request — Sage Mode + full MRS crew (modes + skills); vendor GPU skills deferred.

## Scope

### In (Phase-1)

- Layer 1: keep affine 4D substrate (`vec4` / `Transform4D`) as **default Euclidean Geometry Mode**
- Layer 2: `Metric4D` interface + `EuclideanMetric4D` + `MinkowskiMetric` (`-+++`) + `CustomDiagonalMetric` (partial) + `CurvedMetricField` **skeleton/declared**
- Layer 3: Lorentz boost (rapidity, \(\cosh/\sinh\)) separate from `Transform4D.rotate` circular planes; spatial XY/XZ/YZ remain Euclidean rotations; XT/YT/ZT under Minkowski are boosts
- Layer 4 (thin): Event / Worldline / ObserverFrame types as **partial** records (not full physics)
- Layer 6 (thin): TemporalOp types + TemporalEvidenceEnvelope schema + validate + fork lineage model (immutable parents)
- Four modes enum: `geometry` \| `spacetime` \| `simulation` \| `timeline`
- Unit tests: Minkowski interval classification, boost rapidity identities, envelope validation, default mode = geometry
- Docs: this trail + brief note in `docs/4d-engine/rt4d/` (evidence-bound)

### Out (Phase-1)

- Layer 5 evolution laws (forces, field equations, continuum mechanics) — **declared**
- Physical time travel claims; CIEMS runtime bind; charter / `AGENTS.md` / policy edits
- Silent Minkowski default; GPU Lorentz kernels; curved spacetime numerics
- Full light-cone mesh visualization; automatic timeline merge resolution
- Changing existing `Transform4D` Euclidean semantics
- Genblaze / Prompt→Scene / Proton path changes
- Vendor ROCm/CUDA/TAO work

## ADR decision

### Context (evidence)

| Evidence | Path | Tag |
|----------|------|-----|
| 4-component points + Euclidean plane rotations (incl. `xw`) | `mrs/packages/renderer-core/src/render/rt4d/math/transform.js` | **partial** O(4)-style |
| Euclidean length preservation helpers | `…/math/physicalInvariants.js` + tests | **tested** |
| vec4 substrate | `…/math/vec4.js` | **partial** |
| Governed timeline playback / provenance | `Timeline*.js`, DTO/schemas, CKL `play_timeline` | **partial** |
| SX-PTIG (idea epochs ≠ spacetime metric) | `…/gpu/constitution/SovereignXTemporalIdeaGovernance.js` | **tested** heuristics; CKL bind **declared** |
| Layer stack | `docs/governance/CONSTITUTIONAL_LAYER_STACK.md` | CECP **partial**; CHEA/CCR/CDGF **declared** |

### Decision

1. **Six-layer stack** is the constitutional architecture; Phase-1 implements L1 (reuse) + L2 + L3 (Lorentz family) + thin L4/L6; L5 **declared**.
2. **Fourth coordinate remains semantically neutral** at L1 (`w` / `q`). Modes assign meaning.
3. **Metric module is pluggable**; transforms declare `preservesMetric`.
4. **Four RT4D lab modes must not collapse** — different invariants.
5. **Three “time travel” meanings stay separate** in contracts/docs: visualization slice ≠ simulation rewind ≠ timeline edit (counterfactual).
6. **Merge is hard**: Phase-1 ships conflict-aware **declared** merge stub; successful merge always yields a **new** timeline with two parents.
7. **Default remains Geometry + Euclidean** — opt-in to spacetime/simulation/timeline modes.
8. **Additive package** under `mrs/packages/renderer-core/src/render/rt4d/{metric,modes,temporal,semantics}/` — Pattern-Weaver reuse of `vec4`/`Transform4D` without mutating Euclidean defaults.

### Alternatives considered

| Alt | Verdict |
|-----|---------|
| A. Rename W→t in existing `Transform4D` | **Reject** — breaks Euclidean invariants; Drive-G-1 fraud risk |
| B. Separate `@mrs/spacetime-lab` package | Defer — extra seam; Phase-1 stays in renderer-core with exports |
| C. Full GR + evolution PDE solver | **Reject** for Phase-1 — out of scope / overclaim |
| D. Wire CIEMS as live governor now | **Reject** — external; bind **declared** only |

### Rejected paths

- Marketing “time travel engine” without evidence envelope
- Treating SX-PTIG as Minkowski enforcement
- Auto-merging incompatible branches
- Amending charter for temporal ops this trail

### Consequences

- New API surface opt-in; existing RT4D renders unchanged
- Spacetime Mode users must use Lorentz boosts for time–space planes
- Timeline Mode gains fork/evidence; merge remains policy-gated stub
- ESFR likely `PASS_WITH_GAPS` / `PROMOTE_WITH_GAPS` until L5 + CKL temporal policies exist

## Interface specification

### Modes

```ts
type Rt4dLabMode = "geometry" | "spacetime" | "simulation" | "timeline";
```

### Metric4D

```ts
interface Metric4D {
  id: string;                 // e.g. "euclidean" | "minkowski:-+++"
  signature?: string;
  innerProduct(a: Vec4, b: Vec4): number;
  interval(a: Vec4, b: Vec4): number; // g(Δ,Δ)
  classifyInterval(a: Vec4, b: Vec4): "timelike" | "spacelike" | "lightlike" | "euclidean";
}
```

Minkowski (`-+++`, \(c=1\) default): \(s^2 = -(\Delta t)^2 + \Delta x^2 + \Delta y^2 + \Delta z^2\) with `q` as \(ct\).

### Transforms

| Family | Planes | Formulas | preservesMetric |
|--------|--------|----------|-----------------|
| Euclidean rotation | xy,xz,yz,xw,yw,zw | \(\cos\theta,\sin\theta\) | `euclidean` |
| Lorentz boost | xt,yt,zt | \(\cosh\eta,\sinh\eta\) | `minkowski:-+++` |
| Translation / affine | — | existing + documented | metric-dependent |

JSON sketch:

```json
{
  "transformType": "lorentz_boost",
  "axis": "x",
  "rapidity": 0.7,
  "preservesMetric": "minkowski:-+++"
}
```

### TemporalOp

`slice_view | rewind | fork | fast_forward | simulate | compare | prune | merge`

- `merge` Phase-1: validate parents + detect trivial conflicts; never mutate parents; result status `declared` unless both parents empty-conflict fixture passes.

### TemporalEvidenceEnvelope (schema)

Required: `operationId`, `operationType`, `sourceTimelineId`, `resultTimelineId`, `metric`, `parentStateHash`, `resultStateHash`, `replayToken`, `evidenceStatus`  
Optional: `sourceEventId`, `observerFrame`, `transform`, `causalValidation`, `simulationLawHash`, `parentTimelineIds[]` (merge)

`evidenceStatus`: `draft | substrate_verified | declared`

### Bans

- No secrets; no charter edits; no silent mode switch; no PRNG in envelope hashes; MIT-only deps
- No claim of physical time travel or CIEMS enforcement

### Env

None required for Phase-1 unit tests.

## Constitutional boundary analysis

| In scope | Out of scope / protected |
|----------|---------------------------|
| `mrs/packages/renderer-core/src/render/rt4d/{metric,modes,temporal,semantics}/**` | `constitution/`, `engine/constitution/`, policies, `AGENTS.md` |
| Schemas under `mrs/packages/renderer-core/schemas/rt4d/` | CIEMS runtime (`G:\CIEMS`) |
| CECP trail + brief docs note | Genblaze app string surfaces |
| Tests under `…/rt4d/test/` | Changing Euclidean `Transform4D.rotate` semantics |

CKL temporal-op policies: **declared** (future trail); reuse intent/evidence patterns from existing timeline policies conceptually only.

## File manifest

| Path | Action | Owner |
|------|--------|-------|
| `…/rt4d/metric/Metric4D.js` | create | Builder→Implementor |
| `…/rt4d/metric/EuclideanMetric4D.js` | create | Implementor |
| `…/rt4d/metric/MinkowskiMetric.js` | create | Implementor |
| `…/rt4d/metric/CustomDiagonalMetric.js` | create | Implementor |
| `…/rt4d/metric/CurvedMetricField.js` | create skeleton | Builder |
| `…/rt4d/metric/LorentzBoost.js` | create | Implementor |
| `…/rt4d/metric/index.js` | create | Builder |
| `…/rt4d/modes/Rt4dLabMode.js` | create | Implementor |
| `…/rt4d/modes/index.js` | create | Builder |
| `…/rt4d/semantics/types.js` | create partial | Implementor |
| `…/rt4d/semantics/index.js` | create | Builder |
| `…/rt4d/temporal/TemporalOp.js` | create | Implementor |
| `…/rt4d/temporal/TemporalEvidenceEnvelope.js` | create | Implementor |
| `…/rt4d/temporal/TimelineLineage.js` | create | Implementor |
| `…/rt4d/temporal/index.js` | create | Builder |
| `…/schemas/rt4d/temporal-evidence-envelope.schema.json` | create | Implementor |
| `…/rt4d/test/metric.minkowski.test.js` | create | Implementor |
| `…/rt4d/test/lorentz.boost.test.js` | create | Implementor |
| `…/rt4d/test/temporal.envelope.test.js` | create | Implementor |
| `…/rt4d/index.js` | export additive | Implementor |
| `…/package.json` | `test:spacetime-lab` script | Implementor |
| `docs/4d-engine/rt4d/RT4D_SPACETIME_LAB_PHASE1.md` | create brief | Implementor |
| CECP `01`–`06` + README | trail | Crew / foreman |

## Acceptance tests

- [ ] Euclidean metric: \(\langle a,a\rangle = \|a\|^2_E\); classify returns `euclidean`
- [ ] Minkowski: lightlike null interval; timelike/spacelike signs match `-+++`
- [ ] Lorentz boost rapidity \(\eta\): preserves Minkowski interval (within tol)
- [ ] Spatial `Transform4D.rotate('xy')` unchanged behavior (smoke)
- [ ] Default lab mode is `geometry`
- [ ] Envelope schema validation accepts fixture; rejects missing `operationId`
- [ ] `fork` creates child with one parent; parents immutable
- [ ] `merge` without conflict policy returns declared/conflict result — never overwrites parents
- [ ] Docs state: not physical time travel; three meanings separated
- [ ] No constitutional path modifications

## Risks / unknowns

- Existing `Transform4D.apply` matrix layout quirks — do not “fix” in this trail unless tests prove regression
- Units: Phase-1 defaults \(c=1\); `ct` documented
- CKL policy IDs for temporal ops not registered — governance **partial**/declared
- Evolution law hash field present but laws **declared**

## Invariants

1. Default mode = Geometry + Euclidean
2. Minkowski time–space mixing uses boosts, not \(\cos/\sin\) rotations
3. Envelope hashes deterministic given inputs (no wall-clock in hash material)
4. Timeline lineage: append-only; merge → new node with two parents
5. Claim tags honest (Drive-G-1)
6. MIT-compatible only

## Anti-overclaim

Must **not** claim:

- Physical time travel or relativity “solved”
- CHEA / CCR / CDGF / CIEMS **enforced**
- Full GR / curved metrics
- Evolution / field equations implemented
- Automatic safe merge of conflicting histories
- SX-PTIG = spacetime governance
- GPU Lorentz path
- “Production ready” lab

Allowed: substrate **partial**; Phase-1 metric/boost/envelope **tested** where tests pass; L5/merge policy **declared**.

## Sage counsel

**Builder first:** scaffold directories + index re-exports + `CurvedMetricField` skeleton + empty test files naming acceptance criteria; do not invent boost math in stubs.

**Implementor:** Minkowski + Lorentz + envelope + fork lineage + tests; keep `Transform4D` untouched.

**Reviewer:** verify mode non-collapse + math correction + anti-overclaim in docs.

**Inspector:** run `test:spacetime-lab`; confirm Euclidean default.

**ESFR:** expect `PASS_WITH_GAPS` — L5, CKL temporal policies, merge resolver, CIEMS bind absent.

## Cross-reference ledger

| Ref / trail | Domain overlap | Must reuse | Must not fork | Gap / tag |
|-------------|----------------|------------|---------------|-----------|
| RT4D math (`transform.js`, `vec4.js`) | Geometry substrate | Euclidean rotations | Silent Minkowski in rotate | Metric plug-in **new** |
| Timeline / GovernedTimeline | Playback provenance | intent/world/timeline ids | Replace timeline player | Editing lineage **new** |
| SX-PTIG | Temporal *ideas* | Continuity≠acceptance pattern | Treat as metric | Spacetime **orthogonal** |
| `rt4d-priority5-hosted-mcp-2026-08` | Hosting | None this Phase-1 | Infra scope creep | unrelated |
| Prompt→Scene / Proton / Engine3D §9 | Hosts | None | Adapter rewrites | **out** |
| CIEMS (external) | Governance | — | Casual cross-repo | bind **declared** |

## Risks to sovereignty / determinism

- Wall-clock or PRNG inside evidence hashes → replay break
- Silent metric switch → non-reproducible frames
- Cloud-only physics deps → P5 tension (none approved)
- Overwrite-on-merge → audit fraud
- Vendor GPU lock-in if Lorentz moved to CUDA/HIP early — deferred

## Handoff order

1. Builder Sage — scaffolds + manifest `02`
2. Implementor Sage — fill Phase-1 + `03`
3. Reviewer Sage — `04`
4. Inspector Sage — `05`
5. ESFR Sage — `06` PromotionEligibility
