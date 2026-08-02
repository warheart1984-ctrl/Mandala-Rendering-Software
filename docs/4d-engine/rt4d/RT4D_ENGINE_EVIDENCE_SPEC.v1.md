# RT4D Engine Evidence Envelope — Spec v1

| Field | Value |
|-------|-------|
| `id` | `rt4d.engine.evidence.v1` |
| **Status** | **declared** (CIEMS-aligned, substrate-level) |
| **Layer** | MRS substrate (`mrs/packages/rt4d-engine`) — the *host* repo for this envelope |
| **Canonical consumer** | External CIEMS / Constitutional Runtime (JCR) on Drive-G (`G:\CIEMS`, `G:\.codex\cse\constitutional-runtime`) — not present in this repo |
| **Verification layer** | MRS-local invariant conformance suite (`renderer-core` `runInvariantConformanceSuite`, `validateEvidenceRecord`) |
| Authority | Drive-G-1 (evidence-bound claims). This document is an agreement, not a charter amendment. |
| References | `docs/governance/DIMENSIONAL_COMPRESSION.md` (§2.3 Execution Layer; §4.3 do not invent implementations), `docs/governance/esfr/test-matrix.esfr.md` (CIEMS alignment = declared unless CIEMS artifacts exist here) |

> **Honest scope.** The RT4D engine in this repo renders deterministic 4D path-traced stills
> (`POST /v1/scenes/{id}/render`) and emits the evidence envelope below as a **substrate-level
> artifact**. This envelope is *shaped* to be ingestible by the external CIEMS/JCR runtime, but
> **this repo does not host that runtime**: there is no JCR here, no CIIMS policy gate here, and
> no cross-repo promotion is performed here. Claiming otherwise would be a fake implementation.
> The CIEMS-aligned claim is **declared** — it becomes **tested** or **enforced** only when an
> artifact in `G:\CIEMS` / `G:\.codex\cse\constitutional-runtime` cites it.

---

## 1. Why this exists

Per `DIMENSIONAL_COMPRESSION.md`, the Execution Layer compresses invariants into *executable artifacts*: contracts, schemas, engines, trails, CLI pipelines, host adapters. The evidence envelope is the executable artifact that binds a single RT4D render operation to the constitutional chain

```
Authority → Validation → Decision → Evidence → Verification → Replay → Audit
```

A render is not a "tool call" once it is emitted with this envelope: it becomes a **governed artifact** that a downstream CIEMS host can verify, replay, and audit without re-running the agent that produced it — provided the same `(sceneSpecHash, seed, parametersHash)` triple is supplied (the `replayToken`).

---

## 2. Envelope shape

Produced by `mrs/packages/rt4d-engine/src/evidence/rt4dEvidenceEnvelope.ts` (function
`createRt4dEvidenceEnvelope`) and returned in the `POST /v1/scenes/{id}/render` response as the
`evidence` field.

```ts
type Rt4dEvidenceEnvelope = {
  operation: "rt4d_dimensional_preview";        // declared operation identifier
  source: "mrs-renderer-core/rt4d";             // the renderer-core RT4D CPU path tracer
  engineVersion: string;                        // rt4d-engine package version
  intentId: string;                             // governance: originating intent
  timelineId: string;                           // governance: originating timeline
  worldId: string;                              // governance: originating world
  sceneId: string;                              // engine content-addressed id ("rt4d-scene-<16hex>")
  sceneSpecHash: string;                        // sha256Hex(canonicalRt4dJson(spec)) (key-sorted)
  sceneSha256: string;                          // sha256(canonicalSceneJson(spec)) (engine internal)
  runId: string;                                // monotonic "run-N" within the engine process
  renderKey: string;                            // engine content-add render key
  seed: number;                                 // deterministic uint32 rng seed (P4)
  pngSha256: string;                            // sha256 of the rendered PNG bytes
  parameters: { seed, maxDepth, samplesPerPixel, width, height, timeSeconds };
  parametersHash: string;                       // sha256Hex(parameters)
  at: string;                                   // ISO-8601 emit time (audit only)
  replayToken: string;                          // sha256(sceneSpecHash:seed:parametersHash)
};
```

### Field derivation rules (must not drift)

| Field | Formula |
|-------|---------|
| `sceneSpecHash` | `sha256Hex(sceneSpec)` → key-sorted canonical JSON (renderer-core `canonicalRt4dJson`) |
| `sceneSha256` | engine-internal `sha256Hex(canonicalSceneJson(spec))`, `lensRadius` normalized to 0 |
| `renderKey` | `sha256Hex(sceneHash + JSON.stringify(orderedParams))` (engine receipt key) |
| `seed` | deterministic uint32 derived from `sceneSha256` by the caller (`mrs/apps/rt4d-chatgpt-plugin` `deriveSeed`) — never `Date.now()` |
| `replayToken` | `sha256(sceneSpecHash + ":" + seed + ":" + parametersHash)` — the single value a CIEMS replay gate compares |

### Determinism obligations (P4 replayable reality)

- `seed` drives **all** path-tracer randomness (`mulberry32(seed)` injected into `PathTracer4D`).
- `lensRadius` is forced to 0 (the `Camera4D` DOF lens otherwise calls `Math.random()`).
- The hyperplane sample is fixed at the central 4D slice (`generateRay(x, y, u1, u2, 0.5, 0.5)`) so finite hyperspheres do not speckle.
- Same `(sceneSpecHash, seed, parameters)` ⇒ byte-identical PNG ⇒ identical `pngSha256` and `replayToken`.

---

## 3. Verification (substrate level)

`verifyRt4dEvidenceEnvelope(envelope)` in `rt4dEvidenceEnvelope.ts`:

1. Runs the renderer-core invariant conformance suite for the in-process RT4D adapter
   (`runInvariantConformanceSuite({ id: "rt4d-dimension-render" })`), covering foundational
   (`PI-GEO-LENGTH`, `PI-CALC-ENERGY`, `PI-TRIG-RADIAL`) and engine invariants.
2. Validates every emitted `EvidenceRecord` via `validateEvidenceRecord`.
3. Anchors the render to the foundational invariant `PI-GEO-LENGTH` (4D length preservation,
   the same invariant `render-still.mjs` checks) via `createEvidenceRecord`, with
   `evidenceAnchors = [sceneSpecHash, renderKey, pngSha256]` and `runtimeId = source`.
4. Returns `ok = allFoundationalPassed && recordsValid && PI-GEO-LENGTH verdict == "pass"`.

This is the **MRS substrate verification** step. It does **not** assert CIEMS/JCR enforcement —
see §5. The `report` shape returned is `{ envelope, recordsValid, conformancesummary,
allFoundationalPassed, evidenceRecord }`.

---

## 4. Replay contract (for the external CIEMS/JCR host)

To replay-verify a prior render, the CIEMS host supplies the *exact* envelope fields and asks
the engine to re-render. Acceptance:

- `replayToken` matches the stored token.
- The re-rendered `pngSha256` equals the envelope's `pngSha256`.
- `verifyRt4dEvidenceEnvelope` returns `ok: true`.

Because the engine is content-addressed and seed-driven, a replay with the same
`(sceneSpecHash, seed, parameters)` is guaranteed byte-identical without re-running the plugin.

---

## 5. Relationship to CIEMS / JCR (drive-G external)

| Artifact | Where it lives | Status in *this* repo |
|----------|----------------|----------------------|
| CIEMS Constitutional Runtime / JCR | `G:\CIEMS`, `G:\.codex\cse\constitutional-runtime` | **not present** (declared-only) |
| Sovereign X OS / CIEMS namespace | `G:\Sovereign-X-Constitutional-Compute` | **not present** (declared-only) |
| CIEMS lineage tree / promotion | `docs/governance/cecp/trails/*` | **declared** (no runtime gate) |
| This evidence envelope | `mrs/packages/rt4d-engine` | **declared** envelope; verification = **tested** (conformance suite passes) |

Concretely: this envelope is *ready to be cited* by a CIEMS promotion packet, but the packet
itself would be authored in the CECP trail repo and admitted by the Drive-G CIEMS runtime — a
separate, explicitly-mandated operation. Do not claim "CIEMS enforcement" from this repo alone.

---

## 6. Non-goals / honesty boundary

- This envelope does **not** claim the engine is CIEMS-certified, Phase-4 photoreal, or a
  "constitutional compute node". Those are promotion claims.
- The envelope carries `intentId`/`timelineId`/`worldId` for lineage, but **does not** assert
  cross-world federation or multi-tenant governance — those remain declared (`CONSTITUTIONAL_LAYER_STACK.md`).
- `operation: "rt4d_dimensional_preview"` is scoped to still-image dimensional preview only.
   Animation, timeline, and export remain declared (`render_rt4d_preview` status `partial` at the
   product-lane level).

---

## 7. RT3D state-capture evidence envelope (sim→persist→evidence layer)

| Field | Value |
|-------|-------|
| `id` | `rt3d.ledger.evidence.v1` |
| **Status** | **declared** (CIEMS-aligned, substrate-level) |
| **Layer** | MRS substrate (`mrs/apps/rt4d-engine/src/evidence/rt3dEvidenceBridge.ts`) — the ledger + bridge live in the host repo |
| **Canonical consumer** | External CIEMS / JCR (Drive-G) — not present in this repo |
| **Verification layer** | MRS-local — `Rt3dLedger.replay()` determinism (engineTick fixed steps, 1e-9 tolerance) |
| Authority | Drive-G-1 (evidence-bound claims). This document is an agreement, not a charter amendment. |

> **Honest scope.** The RT3D persistence layer (`Rt3dLedger`) captures a deterministic
> state trajectory produced by `EngineHost.engineTick(fixedDelta)` (P4 replayable reality —
> fixed timestep, content-addressed scene store, no wall-clock randomness). This envelope
> *attaches* CIEMS-shaped provenance to that persisted trajectory so the external CIEMS/JCR host
> can consume it. **This repo does not host the CIEMS runtime**; the `rt3d_state_capture` envelope
> is **declared** here and becomes **tested** only when a CIEMS artifact cites it. The bridge
> reuses the ledger's own `replay()` as its substrate-level verification — it does **not** emulate
> CIEMS promotion.

### Why this exists

Per `DIMENSIONAL_COMPRESSION.md`, the simulation→persistence→evidence→promotion chain binds a
rendered result to constitutional provenance:

```
RT3D Simulation (engineTick) → Persistence (Rt3dLedger) → Evidence (rt3dEvidenceBridge) → Promotion (CIEMS JCR)
```

The RT3D ledger owns determinism; the evidence bridge only **attaches** an envelope + a
verifier that calls `ledger.replay()`. Promotion into CIEMS is a separate, explicitly-mandated
operation deferred to the Drive-G CIEMS runtime (`G:\CIEMS`).

### Envelope shape

Produced by `mrs/apps/rt4d-engine/src/evidence/rt3dEvidenceBridge.ts`
(`buildRt3dEvidenceEnvelope(entry: Rt3dLedgerEntry)`).

```ts
type Rt3dEvidenceEnvelope = {
  operation: "rt3d_state_capture";                 // declared operation identifier
  source: "mrs-rt4d-engine/rt3d-ledger";            // the RT3D ledger that produced the entry
  engineVersion: string;                            // rt4d-engine package version
  intentId: string;                                 // governance: originating intent (from ledger linege)
  timelineId: string;                               // governance: originating timeline (from ledger lineage)
  worldId: string;                                  // governance: originating world (from ledger lineage)
  sceneId: string;                                  // engine content-addressed id ("rt3d-scene-<16hex>")
  specHash: string;                                 // sha256Hex(canonicalRt4dJson(spec)) anchor
  seed: number;                                    // determinism seed from convertSceneSpecification
  fixedDelta: number;                               // fixed timestep (1/60) powering engineTick
  frames: number;                                  // trajectory length
  trajectoryChecksum: string;                      // sha256 over the full canonicalized entry (tamper guard)
  trajectoryRoot: string;                          // sha256 over per-frame body-position frame hashes
  replayToken: string;                             // sha256(specHash:seed:fixedDelta:frames:trajectoryRoot)
  at: string;                                      // ISO-8601 emit time (audit only)
};
```

### Field derivation rules (must not drift)

| Field | Formula |
|-------|---------|
| `specHash` | `sha256Hex(canonicalRt4dJson(sceneSpec))` (renderer-core `canonicalRt4dJson`, key-sorted) |
| `seed` | from `convertSceneSpecification` (deterministic, NOT a render seed) |
| `trajectoryRoot` | `sha256(frameHashes.join("\n"))`, where each `frameHash = sha256(JSON(canonicalFrameBodies))` — Merkle-style root over per-frame body positions |
| `trajectoryChecksum` | `sha256Hex(canonicalJson(entry))` over the full ledger entry (tamper guard) |
| `replayToken` | `sha256(specHash + ":" + seed + ":" + fixedDelta + ":" + frames + ":" + trajectoryRoot)` |

### Verification (substrate level)

`verifyRt3dEvidenceEnvelope(envelope, entry, replay)` in `rt3dEvidenceBridge.ts`:

1. **Replay invariant** — calls `ledger.replay(entry)`; the ledger re-runs `engineTick` fixed
   steps and asserts every captured frame reproduces within **1e-9**.
2. **Trajectory integrity** — recomputes `trajectoryRoot(entry.snapshots)` and compares to
   `envelope.trajectoryRoot`; a tampered snapshot body yields a different root → `verified:false`.
3. Returns `{ envelope, replayOk, mismatch?, trajectoryRecomputed }`.

This is the **MRS substrate verification** step. It does **not** assert CIEMS/JCR enforcement —
see §5 (RT4D) / §9 (this spec). Acceptance: `replayOk === true && trajectoryRecomputed === true`.

### Replay contract (for the external CIEMS/JCR host)

To replay-verify a prior RT3D capture, the CIEMS host supplies the exact envelope fields and asks
the ledger to re-simulate. Acceptance:

- `replayToken` matches the stored token.
- `ledger.replay(entry)` returns `{ ok: true }`.
- `trajectoryRoot` recomputes identically (`trajectoryRecomputed: true`).

Because the ledger is content-addressed and fixed-step, the same
`(specHash, seed, fixedDelta, frames)` trajectory replays byte-identically without re-running the
capturing agent.

### Determinism obligations (P4 replayable reality)

- All randomness in an RT3D trajectory derives from the `seed` in `convertSceneSpecification` —
  `engineTick` consumes no wall-clock or `Math.random`/`Date.now`.
- `fixedDelta` (1/60) is the sole timestep; `runFrames`/`engineTick` step deterministically.
- The ledger's `load` rejects tampered entries via `trajectoryChecksum`; the evidence bridge adds
  an independent `trajectoryRoot` so a tampered on-disk file is caught at both the persistence
  gate and the evidence gate.

### Relationship to CIEMS / JCR (drive-G external)

| Artifact | Where it lives | Status in *this* repo |
|----------|----------------|----------------------|
| CIEMS Constitutional Runtime / JCR | `G:\CIEMS`, `G:\.codex\cse\constitutional-runtime` | **not present** (declared-only) |
| Sovereign X OS / CIEMS namespace | `G:\Sovereign-X-Constitutional-Compute` | **not present** (declared-only) |
| CIEMS lineage tree / promotion | `docs/governance/cecp/trails/*` | **declared** (no runtime gate) |
| This RT3D evidence envelope | `mrs/apps/rt4d-engine` | **declared** envelope; verification = **tested** (`Rt3dLedger.replay`, AC-L4) |

> **Boundary.** The RT3D evidence envelope is *ready to be cited* by a CIEMS promotion packet,
> but the packet is authored in the CECP trail repo and admitted by the Drive-G CIEMS runtime — a
> separate, explicitly-mandated operation. Do not claim "CIEMS enforcement" from this repo alone.

---

## Appendix — Hosted MCP / infra evidence surface (Priority #5)

| Surface | Location | Status in this repo |
|---------|----------|---------------------|
| CDK app (API GW → Lambda → engine ALB) | `infra/cdk/` | **partial** (synth/docker milestone; deploy/live URL not claimed) |
| Fail-closed Bearer authorizer | `infra/cdk/lambda/authorizer` | **partial** (Secrets Manager `${prefix}/api-keys`) |
| Structured log fields (`renderId`, `failureClass`, `renderCost`, `latencyMs`) | Observability stack contract + handler logs | **declared** until consistently emitted/queried in prod |
| Hash authority | RT4D engine only | **enforced** in product path; infra must pass through (no recompute) |
| CIEMS / JCR admission of hosted renders | Drive-G external | **declared-only** |

CECP trail: `docs/governance/cecp/trails/rt4d-priority5-hosted-mcp-2026-08/`.

---

## Appendix — Usage metering / credits surface (Priority #6)

| Field | Value |
|-------|-------|
| Status | **declared** (commercial scaffold; formula not cost-calibrated; billing not live) |
| Package | `mrs/packages/rt4d-metering` (`@mrs/rt4d-metering`) |
| Authority rule | Pricing consumes **verified engine receipts** only — never parallel wall-clock estimators in plugin/gateway |

### Authority chain

```text
engine layered evidence (renderId + pixelHash + pngHash + projectionHash
  + runtimeFingerprint + evidenceStatus)
        │
        ▼
deriveCreditsFromReceipt()     ← formula status: declared
        │
        ▼
append-only usage ledger       ← idempotent on renderId (partial)
        │
        ▼
assertWithinPlanLimits()       ← fail-closed (partial)
```

### Minimum usage record

```json
{
  "userId": "...",
  "planId": "creator",
  "renderId": "...",
  "creditsUsed": 12,
  "computeSeconds": 8.4,
  "storageBytes": 4281192,
  "status": "completed"
}
```

`renderId` must join to engine layered evidence. Soft emit from the engine is opt-in (`RT4D_METERING_EMIT=1`) and must not fail the render path.

### What is not claimed

- Stripe / Chargebee / ChatGPT billing live
- Hosted multi-tenant accounts
- CIEMS/JCR commercial admission (Drive-G external, **declared**)
- Cost-calibrated credit economics

CECP trail: `docs/governance/cecp/trails/rt4d-priority6-accounts-metering-pricing-2026-08/`.
