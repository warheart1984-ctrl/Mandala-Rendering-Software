# ACCEPTANCE_CRITERIA — 4D Ink/Cel Render Lane

Status: `partial` (design; gates are the implementation test plan).

## Must-pass gates

| # | Gate | Test | Pass condition |
|---|------|------|----------------|
| A1 | Default unchanged | run current `render-engine3d-still.mjs` with no `--style` | output PNG byte-identical to pre-change baseline (default `"cinematic"` path untouched) |
| A2 | Ink/cel produces output | `render-engine3d-still.mjs --scene tesseract-lattice --style ink-cel` | exits 0; `beauty.png` + `ink.png` written; `inkSha256` printed |
| A3 | Determinism (P4) | same input (scene/seed/style/params) rendered twice | both runs byte-identical PNGs AND identical `inkSha256` |
| A4 | Banding correctness | unit: N·L diffuse in each band | 3 discrete levels `[0.18, 0.62, 1.0]`; transitions at `[0.30, 0.70]`; `shadowLevel 0.12` below first band |
| A5 | Specular quantization | unit: highlight cutoff | specular > `specularCutoff 0.985` renders flat white; below → 0 |
| A6 | Ink outline present | unit + snapshot | depth edges at threshold `0.06`, normal edges at `0.14`, 3×3 dilation, `inkStrength 0.85`, `inkColor` composite |
| A7 | API passthrough | `POST /api/engine3d-still {"style":"ink-cel"}` | `style:"ink-cel"` in response manifest; `ink_sha256` non-empty and matches local `ink.png` |
| A8 | Profile resolution | `POST /api/engine3d-still {"style":"ink-cel","profile_id":"anime.neon-lattice.v1"}` | 200; manifest carries `profile_id`, `profile_hash`, `invariant_fingerprint`; constants came from profile |
| A9 | Unknown profile | `profile_id:"nope"` | 400, clear message |
| A10 | Provenance complete | inspect manifest | all required fields present: `style`, `profile_id`, `profile_hash`, `profile_version`, `ink_sha256`, `beauty_sha256` |
| A11 | Invariant drift | two stills same group, one differing invariant field | `invariant_fingerprint` differs; continuity check (when governance gate lands) flags drift |
| A12 | No governance changes | `git diff engine/ schemas/ constitution/ AGENTS.md` after implementation | empty |

## Conformance mapping

- `provenance.frame-fields`, `provenance.recorder-exists` — unaffected; new fields additive
- `replay.deterministic-params` — strengthened by A3 (ink lane byte-replay)
- No 16/16 profile check is weakened by this lane.

## Regression net

- A1 is the regression gate for existing cinematic output.
- Full suite: `npm test`; renderer normalization `node src/render/rt4d/test/normalization.test.js` (23 tests) unaffected.
