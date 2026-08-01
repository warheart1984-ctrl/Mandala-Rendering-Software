# Pole-Stress Mitigation Proposal (v1)

| Field | Value |
| --- | --- |
| Status | **partial** — Option C thresholds wired in compare runner; not Print SoT |
| Recommendation | **Option C (auto-fallback)** for v1 |
| Option D (hybrid) | **future / declared** — see [`DIAGRAM_HYBRID_POLE_BLEND.v1.md`](./DIAGRAM_HYBRID_POLE_BLEND.v1.md) |
| Runner | `mrs/packages/renderer-core/scripts/rt4d-project-compare.mjs` |
| Diagram | [`DIAGRAM_POLE_STRESS.v1.md`](./DIAGRAM_POLE_STRESS.v1.md) |

## Problem

Projector4D becomes unstable near the pole \(w \approx -d_4\). This produces non-finite values, extreme scale, or lane rejection.

## Mitigation Options

### Option A — Hard Clamp

\[
s = \frac{d_4}{d_4+w},\quad s \leftarrow \min(s, s_{\max})
\]

Simple; prevents blowouts; loses some 4D story near pole.

### Option B — Soft Roll-Off

\[
s = \frac{d_4}{d_4 + w + \epsilon(w)}
\]

where \(\epsilon(w)\) grows as \(w \to -d_4\). Smooth; preserves story; requires tuning. **Not** implemented for v1.

### Option C — Lane Auto-Fallback (**v1 recommendation**)

If non-finite, scale outside \([S_{\min}, S_{\max}]\), pole proximity, or radial-variance spike → fallback to `drop_w` with provenance note.

- Preserves stability
- Keeps projector4d-sot expressive away from pole
- Matches multi-lane philosophy

### Option D — Pole-Aware Hybrid (**future**)

Blend projector4d-sot and drop_w with \(\beta(w)\). Documented only; see hybrid diagram.

## Pole-Stress Threshold Table (v1)

Defines numerical and behavioral thresholds for projector4d-sot near \(w \approx -d_4\).

| Criterion | Threshold | Behavior | Notes |
| --- | --- | --- | --- |
| Non-finite scale | `isFinite(scale) == false` | Reject projector4d-sot → fallback to drop_w | Observed 1/13 samples (prior reject-mode evidence) |
| Extreme scale | `scale > S_max` (default **6.0**) | Fallback to drop_w | Prevents blowouts |
| Negative extreme / collapse | `scale < S_min` (default **0.05**) | Fallback to drop_w | Prevents collapse |
| Radial variance spike | `r_var > R_max` (default **0.45**) | Mark / fallback policy | Observed near pole |
| Lane rejection / fallback ratio | `reject_ratio > 0.20` | Mark scene as pole-stressed | 3/13 samples in prior experiment |
| Pole proximity | `abs(w + d4) < ε` (default **0.15**) | Fallback (v1) or hybrid (future) | Smooth transition region |

**Recommended v1 behavior:** auto-fallback to `drop_w` when any per-hit threshold is exceeded (Option C).

### Runner constants (**partial**)

| Constant | Default | Meaning |
| --- | --- | --- |
| `POLE_EPS` | `0.15` | \(\lvert d_4 + w \rvert < \varepsilon\) |
| `POLE_SCALE_ABS_MAX` / `S_max` | `6.0` | extreme scale |
| `POLE_SCALE_ABS_MIN` / `S_min` | `0.05` | collapse scale |
| `POLE_R_VAR_MAX` / `R_max` | `0.45` | set-level radial variance mark |
| `POLE_REJECT_RATIO_MAX` | `0.20` | scene pole-stressed mark |

Print SoT `Projector4D` remains unchanged.
