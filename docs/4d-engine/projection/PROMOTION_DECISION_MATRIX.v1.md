# Promotion Decision Matrix (v1)

| Field | Value |
| --- | --- |
| Status | **declared** — decision: eligible, **not promotable** |
| Gate | [`PROMOTION_GATE.v1.md`](./PROMOTION_GATE.v1.md) |

This matrix expresses the promotion decision across math, evidence, rendering, and governance.

```
┌───────────────────────────────┬──────────────┬──────────────┬──────────────────────────────┐
│ Criterion                     │ Projector4D   │ drop_w        │ Promotion Impact             │
├───────────────────────────────┼──────────────┼──────────────┼──────────────────────────────┤
│ Mathematical stability        │ partial       │ full          │ blocks promotion             │
│ Foreshortening readability    │ strong        │ none          │ favors projector4d           │
│ Depth cue stability           │ strong        │ weak          │ favors projector4d           │
│ Pole behavior                 │ unstable      │ stable        │ blocks promotion             │
│ Replay determinism            │ pass          │ pass          │ neutral                      │
│ Viewer comprehension          │ strong story  │ strong debug  │ multi-lane required          │
│ Ink-cel stroke stability      │ untested      │ stable        │ blocks promotion             │
│ Provenance completeness       │ declared      │ declared      │ neutral                      │
│ CI provenance validator       │ missing       │ missing       │ blocks promotion             │
│ Constitutional compliance     │ eligible      │ baseline      │ neutral                      │
└───────────────────────────────┴──────────────┴──────────────┴──────────────────────────────┘
```

## Decision (v1)

Projector4D is **eligible but not promotable**.

Promotion blocked by: pole-stress thresholds, ink-cel evaluation, and CI provenance validator.
