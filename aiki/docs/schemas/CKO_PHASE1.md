# CKO Phase-1 Schema Notes

**Status:** **declared**

## Mandatory fields

| Field | Notes |
|-------|-------|
| `id` | Stable slug id (e.g. `aiki:cko/CKO-0001`) |
| `cko_id` | Short id (`CKO-0001`, `CKO-MATH-0001`) |
| `series` | One of the five Phase-1 series |
| `title` | Human title |
| `slug` | URL-safe slug |
| `pedagogy.learning_objectives` | Non-empty list |
| `pedagogy.narrative_arc` | Hook + sections |
| `formats.primary` | At least one format |
| `status.lifecycle` | draft \| ready-for-script \| in-production \| published \| frozen |

## Optional (recommended)

`tags`, `evergreen`, `difficulty`, `estimated_duration_minutes`, `content_core`, `assets`, `youtube`, `ime_layers`, `pattern_refs`, `prerequisites`, `key_questions`, `evidence_links`.

## Math CKOs

Math objects additionally should set:

- `ime_layers` — list of IME layer ids under `aiki/math/layers/`
- `pattern_refs` — paths under `aiki/math/patterns/` when applicable
