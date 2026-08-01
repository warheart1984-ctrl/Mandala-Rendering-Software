# Diagram — Pole-Stress Behavior (v1)

| Field | Value |
| --- | --- |
| Status | **declared** |
| Mitigation v1 | Option C auto-fallback — [`POLE_STRESS_MITIGATION.md`](./POLE_STRESS_MITIGATION.md) |

```
                         w-axis (4th dimension)
                                ▲
                                │
                                │
                     stable     │     unstable
                                │
                                │
                ┌───────────────┼───────────────┐
                │               w = -d4          │
                │            (projection pole)    │
                │                                 │
                ▼                                 ▼
        ┌────────────────┐               ┌────────────────┐
        │  projector4d   │               │  projector4d   │
        │  stable scale  │               │  extreme scale  │
        │  smooth depth  │               │  non-finite     │
        └────────────────┘               └────────────────┘
                ▲                                 ▲
                │                                 │
                ▼                                 ▼
        ┌────────────────┐               ┌────────────────┐
        │   drop_w       │               │   drop_w       │
        │   stable       │               │   stable       │
        │   literal xyz  │               │   literal xyz  │
        └────────────────┘               └────────────────┘
```

**Legend**

- `projector4d-sot` becomes unstable as \(w \to -d_4\)
- `drop_w` remains stable across entire \(w\)-range
- v1 mitigation: **Option C** lane fallback (clamp / soft roll-off / hybrid are alternatives; hybrid = Option D future)
