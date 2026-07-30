# Intuitive Mathematics Engine (IME)

**Status:** **skeleton** (Drive-G-1)  
**Home:** `aiki/math/`  
**Constitution:** Article IV §2 — Intuitive Reasoning Engines  
**Series:** [Math Intuition](../docs/series/math-intuition.md)

IME encodes reusable reasoning patterns so solutions carry an internal sense of *why* relationships hold—not only correct answers.

## Layer map

| Layer | Label | Path | Seed CKOs |
|-------|-------|------|-----------|
| 1 Numerical intuition | Core / Heuristics | [`layers/01-numerical`](layers/01-numerical/) | CKO-MATH-0001, 0002 |
| 2 Geometric intuition | Representations / Operations | [`layers/02-geometric`](layers/02-geometric/) | — |
| 3 Pattern recognition | Patterns / Constraints | [`layers/03-pattern`](layers/03-pattern/) | CKO-MATH-0003 |
| 4 Causal mathematics | Explanations / Mechanism | [`layers/04-causal`](layers/04-causal/) | — |
| 5 Multiple representations | Views | [`layers/05-representations`](layers/05-representations/) | CKO-MATH-0004 |
| 6 Approximation & verification | Strategy / Filters | [`layers/06-approximation`](layers/06-approximation/) | CKO-MATH-0002, 0005 |
| 7 Self-explanation | Cycle / Output | [`layers/07-self-explanation`](layers/07-self-explanation/) | CKO-MATH-0005 |

## Pattern example

[`patterns/near-round-multiplication.yaml`](patterns/near-round-multiplication.yaml) — *Near-round multiplication*  
Form: \(a \times (b-1) = a\times b - a\) · Worked: \(17 \times 19\).

## Schemas

- [`schemas/cko-math.schema.yaml`](schemas/cko-math.schema.yaml)
- [`schemas/pattern-template.schema.yaml`](schemas/pattern-template.schema.yaml)
- [`schemas/reasoning-trace.schema.yaml`](schemas/reasoning-trace.schema.yaml)

## AIKI integration

Math CKOs live in `aiki/knowledge/objects/CKO-MATH-*.yaml` and reference `ime_layers` + `pattern_refs`. Over time IME is the math-specific reasoning engine inside AIKI; CKOs are its curriculum and test suite.
