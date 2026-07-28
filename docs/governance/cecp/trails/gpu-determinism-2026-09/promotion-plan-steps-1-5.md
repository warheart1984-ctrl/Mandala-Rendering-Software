# GPU Determinism Promotion Plan — Steps 1–5 (Draft)

**Trail:** `gpu-determinism-2026-09`  
**Overall status:** **Draft** / **declared**  
**PromotionEligibility today:** **HOLD** for live GPU determinism; seed contract **declared** only  
**Related Phase:** `sx-router-vNext-2026-08` Phase 4

| Step | Title | Status | Exit criteria (future) |
|------|-------|--------|------------------------|
| **1** | Freeze seed contract | **Draft** / seed text **declared** | Signed seed-contract.md + unit vectors for mulberry32 |
| **2** | Assist harness wiring | **Draft** / prototype **declared** | Integrator registered; print SoT denial tests green |
| **3** | Non-print plate capture | **Draft** | Golden assist plates + provenance assist receipts (no print) |
| **4** | Cross-vendor delta metrics | **Draft** | deltaLuma/Chroma + SSIM on real plates; thresholds documented |
| **5** | ESFR promotion review | **Draft** | Inspector PASS(_WITH_GAPS) → ESFR PromotionEligibility decision |

## Step notes

### Step 1 — Freeze seed contract

Document mulberry32 + stratified as the assist harness PRNG/sampling pair.
**Declared now** in `seed-contract.md`.

### Step 2 — Assist harness wiring

Prototype module + registry capability `gpu.integrator.deterministic`.
Shipped as **declared** under vNext Phase 2 — not promotion to enforced.

### Step 3 — Non-print plate capture

Capture assist-only plates from NVIDIA/AMD skills when live invoke exists.
**Not claimed.** Requires host skills + invoke path (Phase 3).

### Step 4 — Cross-vendor delta metrics

Replace skeleton `computeMetrics` with real metrics; unskip SSIM only with plates.
**Not claimed.**

### Step 5 — ESFR promotion review

Only after Steps 1–4 evidence. Possible outcomes: PROMOTE_WITH_GAPS / HOLD /
REJECT. GPU print SoT remains banned regardless.

## Explicit gaps

- No live GPU
- No print determinism receipts
- Full crew 02–06 for this trail deferred until Step 1 kickoff authorization
