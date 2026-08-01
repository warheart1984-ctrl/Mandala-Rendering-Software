# Diagram — Hybrid Projector Blending Near Pole (Option D / future)

| Field | Value |
| --- | --- |
| Status | **declared / future** — not v1 mitigation |
| v1 recommendation | remains **Option C** (auto-fallback) — [`POLE_STRESS_MITIGATION.md`](./POLE_STRESS_MITIGATION.md) |

```
                     w-axis (4th dimension)
                             ▲
                             │
                             │
                projector4d-sot stable region
                             │
                             │
                ┌────────────┼────────────┐
                │            w = -d4       │
                │        (projection pole) │
                └────────────┼────────────┘
                             │
                             ▼
                 Hybrid Blend Region (β)
        β = 1.0 → full projector4d-sot
        β = 0.0 → full drop_w
        β decreases smoothly as w → -d4
        β(w) = clamp( 1 - |w + d4| / ε , 0 , 1 )
                             ▼
                drop_w stable region
                             │
                             ▼
```

**Legend**

- `projector4d-sot` becomes unstable near pole
- hybrid blend transitions smoothly between lanes
- `drop_w` remains stable across entire \(w\)-range

Do **not** treat this diagram as enforced behavior. Soft roll-off / hybrid are deferred.
