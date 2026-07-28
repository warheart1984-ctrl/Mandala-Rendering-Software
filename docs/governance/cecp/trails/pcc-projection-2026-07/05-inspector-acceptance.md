# 05 — Inspector acceptance

| Field | Value |
| --- | --- |
| `mode` | Researcher |
| `softwareCreationMode` | Testwright |
| `actorMode` | Librarian |
| Verdict | **PASS_WITH_GAPS** |

## Acceptance evidence

| Criterion | Evidence | Result |
| --- | --- | --- |
| Fidelity zero-params | `projection.invariants.test.js` | PASS |
| Continuity Lipschitz | `projection.continuity.test.js` | PASS |
| Presets / aperture | continuity tests | PASS |
| Lens factory hook | `projection.lens.northstar.test.js` | PASS |
| North-star soft-skip | same | PASS (soft_skip) |
| Path-tracer declared | invariants test | PASS |

## Command

```text
node --test src/render/rt4d/test/projection.*.test.js
→ 20 pass / 0 fail
```

## Gaps retained

- Pixel hash north-star without dataset: soft_skip
- PathTracer4D runtime bind: declared
- CKL enforcement: absent

## Recommendation

Accept for merge as **partial** capability; do not market as complete observation engine.
