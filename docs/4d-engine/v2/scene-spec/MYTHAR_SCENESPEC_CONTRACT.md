# Mythar ↔ SceneSpec Constitutional Contract (v1.0 draft)

**Status:** `declared` — design contract; not a runtime gate
**Version:** 1.0 (draft)
**Author:** jon
**Scope:** Governed interface between the Mythar encoder (front-end semantic reconstruction) and deterministic SceneSpec generation.
**Companion:** [`SCENE_SPEC_RFC.md`](./SCENE_SPEC_RFC.md) (canonical SceneSpecification schema) · [`mrs-v1.5-service-freeze.md`](../../4drs/api/mrs-v1.5-service-freeze.md) (frozen service surface)

> **What this contract is:** the interface Mythar must satisfy to become a valid
> semantic front-end for SceneSpec generation, replacing opaque prompt hashing
> with a structured, inspectable, replayable semantic fingerprint.
> **What this contract is not:** an implementation, a runtime gate, or a change
> to the frozen v1.5 hash path. The hash path remains in force until this
> contract is implemented and passes conformance (Section 6).

---

## 0. Purpose

Replace opaque prompt hashing with a deterministic, semantically structured SceneSpec fingerprint while preserving:

- **Replayability** — verbatim prompt remains recorded as evidence (`PromptRecord`).
- **Determinism** — same semantic prime vector → identical SceneSpec (P4).
- **Constitutionality** — closed vocabularies, fixed schema, pure functions.

Hashing remains valid **for identity only** (`promptHash`), never for semantics.

---

## 1. Input artifact — PromptRecord

| Field | Type | Notes |
| --- | --- | --- |
| `prompt_text` | UTF-8 string | Verbatim user input; never altered or enriched |
| `mode` | optional enum | Explicit intent (see Section 4.1) |
| `timestamp` | optional ISO | Evidence metadata |
| `origin` | optional string | UI, MCP tool, replay |

**Constraints:** prompt text is never rewritten. `mode` applies only at the SceneSpec stage and cannot mutate the PrimeVector.

---

## 2. Stage 1 — Mythar encode

```text
MytharEncode : PromptRecord → PrimitiveVector
```

**PrimitiveVector schema:**
- `phonemic_core`: fixed-length vector of proto-phonemic units
- `tonal_profile`: optional tonal/contour primitives (rise, fall, flat, burst)
- `token_alignment`: mapping from prompt segments → phonemic clusters
- `confidence`: optional reconstruction confidence

**Constitutional requirements:**
- **Deterministic:** same PromptRecord → same PrimitiveVector
- **Convergent:** near-synonyms (e.g., "dragon", "wyrm", "winged serpent") reconstruct toward similar phonemic cores
- **Non-interpretive:** Mythar reconstructs sound structure only; it does not add meaning
- **Closed form:** fixed cardinality `phonemic_core`, no dynamic vocabulary
- **Transparent:** `token_alignment` is inspectable

---

## 3. Stage 2 — Proto-prime projection

```text
PrimitiveToPrimes : PrimitiveVector → PrimeVector
```

### 3.1 Prime vocabulary (closed, constitutional, 60 primes)

| Category | Primes |
| --- | --- |
| Entities (11) | PERSON, ANIMAL, BODY, SOMETHING, PLACE, SKY, EARTH, WATER, FIRE, PATH, WORLD |
| Qualities (12) | BIG, SMALL, GOOD, BAD, HARD, SOFT, LIGHT, DARK, HEAVY, SHARP, SMOOTH, ROUGH |
| Actions (14) | MOVE, GO, COME, DO, MAKE, SEE, HEAR, SAY, THINK, WANT, HOLD, TOUCH, PUSH, PULL |
| Relations (10) | PART, ABOVE, BELOW, INSIDE, OUTSIDE, NEAR, FAR, AROUND, BETWEEN, AGAINST |
| Time (5) | NOW, BEFORE, AFTER, LONG-TIME, SHORT-TIME |
| Quantity (5) | ONE, TWO, MANY, ALL, SOME |
| Modality (3) | CAN, MUST, MAYBE |

**PrimeVector:** fixed-length 60-dimension vector, each dimension encoding degree of semantic presence (numeric, closed, deterministic).

**Constitutional requirements:** deterministic · convergent · closed vocabulary (no runtime primes) · inspectable · replayable as evidence.

---

## 4. Stage 3 — SceneSpec generation

```text
PrimesToSceneSpec : (PrimeVector, mode) → SceneSpec
```

### 4.1 SceneSpec vocabulary — pinned to the DEPLOYED engine

The surface and mode vocabularies below match the deployed renderer
(`mrs/packages/renderer-core/src/surfaces/` and
`infra/cdk/lambda/mcp-handler/index.mts`). They are the **source of truth** for
this contract. Any future surface addition requires a new contract revision.

**Canonical surface set (5):**

| surfaceId | File | Character |
| --- | --- | --- |
| `clifford-torus` | `surfaces/clifford-torus.js` | cinematic, dramatic, high-intent |
| `hopf-surface` | `surfaces/hopf-surface.js` | energetic, elemental |
| `torus-3d` | `surfaces/torus-3d.js` | cyclic, creature/complex forms |
| `trefoil-4d` | `surfaces/trefoil-4d.js` | structured, storyboard |
| `tesseract` | `surfaces/tesseract.js` | diagrammatic, structural, technical |

> Note: the RFC's broader `surfaceId` expansion set (`central-orb`, `lattice-grid`,
> `torus-ring`, `orbital-cluster` per SCENE_SPEC_RFC §3) is the SceneSpecification
> registry. This contract pins the **hash-gateway** 5-set used by `buildSceneSpec`.

**Rotation planes (6):** `xy`, `xz`, `xw`, `yz`, `yw`, `zw`. Each with `axis`, `angular velocity`, `phase`, optional `coupling`.

**Camera:** `fovX`, `fovY`, `fovZ`, `fovW`, `lensRadius`, `projection` (`perspective` / `orthographic`), optional `position`/`target`/`roll`/`pitch`/`yaw`.

**Lighting / mood:** `keyLight.direction`, `intensity`, `colorTemperature`, `ambient`, `contrastProfile`.

**Style modifiers:** `cinematic`, `diagrammatic`, `spectral`, `minimal`, `orthographic`.

### 4.2 Mode vocabulary — aligned with deployed `SURFACE_BY_MODE`

| mode | Pinned surface | Style |
| --- | --- | --- |
| `technical` | `tesseract` | diagrammatic |
| `previz` | `tesseract` | minimal |
| `storyboard` | `trefoil-4d` | structural |
| `concept` | `torus-3d` | minimal |
| `cinematic` | `clifford-torus` | cinematic |
| `final` | `hopf-surface` | spectral |

**Constitutional requirements:**
- **Pure function:** same `(PrimeVector, mode)` → same SceneSpec
- **Mode override:** may pin surface/camera/lighting, but **cannot** mutate PrimeVector or PrimitiveVector
- **Semantic coherence:** similar PrimeVectors → similar SceneSpecs
- **Deterministic:** no randomness, no sampling

---

## 5. Evidence record & replay

```text
EvidenceRecord = { PromptRecord, PrimeVector, SceneSpec, promptHash }
```

- `promptHash` = identity only (sha256 of verbatim prompt), never semantic.
- Replay contract: `MytharEncode → PrimitiveToPrimes → PrimesToSceneSpec` must reproduce the identical SceneSpec from the evidence bundle.
- If Mythar is unavailable at replay, the recorded PrimeVector + SceneSpec alone must be sufficient to reconstruct the identical scene **and** explain why it was chosen (inspectable primes).

---

## 6. Conformance suite (falsifiable, with metrics)

### A. Synonym convergence test

Given a synonym set (e.g., `{"dragon", "wyrm", "winged serpent"}`):

1. Compute PrimitiveVector, PrimeVector, SceneSpec for each.
2. **Pass criteria:**
   - PrimeVector pairwise cosine similarity **≥ 0.85**
   - SceneSpec: identical surface family **and** rotation-plane set intersection **≥ 2 of 3** **and** per-plane angular velocity delta **≤ 0.5**
3. **Fail criteria:** divergence beyond the above thresholds (without a mode override), or surface-family mismatch.

### B. SceneSpec coherence test

Given two prompts with similar semantic primes, SceneSpecs must differ only in parameters corresponding to differing primes — no arbitrary surface-family or camera jumps.

### C. Mode override test

`mode` may override surface/camera/lighting; it must **not** alter PrimeVector or PrimitiveVector (byte-identical vectors with and without mode).

### D. Replay determinism test

Given an EvidenceRecord, the full pipeline must reproduce a byte-identical SceneSpec. Two runs, same input → same output.

### E. Constitutional failure modes

| Failure | Consequence |
| --- | --- |
| Non-determinism | Encoder invalid |
| PrimeVector drift (same input, different run) | Encoder invalid |
| Surface-family instability under mode | Mapping invalid |
| Mode mutates primes | Contract violation |
| Synonym divergence (below §A thresholds) | Not semantically coherent — fails conformance |
| Replay mismatch | Pipeline invalid |

---

## 7. Deterministic mapping skeleton (no code, illustrative only)

| Prime pattern → | Surface family |
| --- | --- |
| ANIMAL + BIG + MOVE | `torus-3d` |
| SKY + LIGHT | `hopf-surface` |
| PLACE + structural | `tesseract` |
| FIRE + WANT + drama | `clifford-torus` |
| storyboard intent | `trefoil-4d` |

| Prime → | Parameter rule (deterministic) |
| --- | --- |
| MOVE | rotation plane 1 assigned |
| BIG | slower angular velocity |
| MANY | multi-plane coupling |
| WANT + SEE | camera faces subject |
| BIG | wider FOV |
| SMALL | tighter FOV |
| LIGHT | high key |
| DARK | low key |
| GOOD | warm color temperature |
| BAD | cold color temperature |

The actual mapping table is constitutional and fixed at implementation time; the skeleton defines its shape only.

---

## 8. Guarantees & non-claims

**Guarantees this contract is designed to deliver:** determinism · replayability · inspectability · semantic coherence · closed vocabularies · pure functions · falsifiability · evidence integrity.

**Explicit non-claims (status: `declared`):**
- [ ] Mythar encoder exists in this repo or is wired to `render_rt4d_from_prompt`
- [ ] The prime vocabulary is proven to recover NSM meaning from sound structure (the "made-up vs recovered" risk — Section 3 projection is testable, not assumed)
- [ ] Prime→SceneSpec mapping table is finalized
- [ ] This contract is a runtime gate (it is not; the frozen v1.5 hash path remains in force)
- [ ] Synonym convergence thresholds (§6A) are validated against a live encoder
- [ ] Path B (`render_rt4d_from_prompt_semantic`) is exposed in any runtime route (it is not — §9 gating)

---

## 9. Dual-path service design (hash vs semantic)

> **Decision (architecture):** the v1.5 hash path is the authoritative runtime.
> The Mythar/prime pipeline is v2 semantics only, and remains **inactive** until
> the gates in §9.2 pass. This section is contract separation only — no Lambda
> change.

### 9.1 The two paths

| | Path A — `render_rt4d_from_prompt_hash` (v1.5) | Path B — `render_rt4d_from_prompt_semantic` (v2) |
| --- | --- | --- |
| **Status** | **ACTIVE / authoritative** | **INACTIVE / declared** |
| **Pipeline** | `sha256(prompt.lower)` → `buildSceneSpec` → SceneSpec | `MytharEncode` → `PrimitiveToPrimes` → `PrimesToSceneSpec` → SceneSpec |
| **Semantic source** | digest (`promptHash` is semantic in v1.5) | Mythar/prime vector (`promptHash` is identity only) |
| **Runtime location** | deployed Lambda (`index.mts` `buildSceneSpec`) | none — no route, no handler |
| **Change policy** | frozen; no change without a new contract revision + §6 conformance | activation only via §9.2 gates |

### 9.2 Activation gates — Path B stays inactive until BOTH pass

| Gate | Criterion |
| --- | --- |
| **G1 · Mythar stable service** | Mythar runs as a stable, independently deployed service (§10) with a versioned API and a determinism guarantee |
| **G2 · §6 conformance** | Synonym convergence (cosine ≥ 0.85), coherence, mode-override byte-identical primes, replay byte-identical — all passing against the live encoder |

No partial activation. No silent routing. Until both gates pass, **Path A is the only route**.

### 9.3 Route semantics during v2 activation (future, not now)

- Default route remains Path A — behavior unchanged.
- Path B is reached only by an **explicit** semantic request (new tool id / REST endpoint); never a silent swap.
- Both paths stay independently testable, and a replay harness compares their outputs.

---

## 10. Deployment topology — Mythar as an external service

- **Lambda = renderer only.** Lean runtime; no embedded Python/Mythar.
- When v2 activates, Lambda calls the **Mythar microservice** over HTTP (versioned API, deterministic). Mythar returns the primitive/prime material; Lambda applies `PrimesToSceneSpec` locally (pure JS).
- The encoder package (`mrs/packages/mythar-encoder`) stays independently deployable — it is bundled with the Mythar service, not the Lambda.
- Keeps: AWS runtime simple · Mythar evolvable · contracts clean (**Lambda = renderer; Mythar = encoder**).

---

## 11. Rejection criteria

This contract is satisfied only when: the encoder is deterministic, synonym convergence passes §6A thresholds, mode never mutates primes (§6C), replay is byte-identical (§6D), the surface/mode vocabularies match the deployed engine (§4), and both activation gates in §9.2 are met. Any of these failing means Mythar's projection is deterministic but not semantically coherent — and therefore **not** constitutionally acceptable as a front-end.

## Related

- [`SCENE_SPEC_RFC.md`](./SCENE_SPEC_RFC.md) — canonical SceneSpecification schema
- [`mrs-v1.5-service-freeze.md`](../../4drs/api/mrs-v1.5-service-freeze.md) — frozen service surface (hash path)
- `infra/cdk/lambda/mcp-handler/index.mts` — `buildSceneSpec`, `SURFACES`, `SURFACE_BY_MODE`
- `mrs/packages/renderer-core/src/surfaces/` — canonical surface modules
