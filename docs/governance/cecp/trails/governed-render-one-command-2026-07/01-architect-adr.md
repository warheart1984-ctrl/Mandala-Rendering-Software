# 01 — Architect ADR

## Intent

Ship a clone-friendly **one command** that accepts a prompt, runs a constitutional soft path, and writes a reproducible still + verification trail — without claiming Lemonade/SDXL pixels.

## ADR

| | |
|--|--|
| **Context** | Operators need one governed render entrypoint; media verification cycles proved Engine3D soft is the reliable local proof renderer; Lemonade held; CL-Gen partial. |
| **Decision** | `scripts/governed-render.mjs` + `npm run mrs:governed-render`; primary provider `engine3d.soft`; VII/VIII soft wrap; CCC select logged for honesty only; Lemonade never production claim. |
| **Consequences** | Prompt heuristics only nudge scene knobs (deterministic); full mesh export / CL-Gen v8–v11 deferred; soft-raster ceiling remains. |

## Interface

- Inputs: `--prompt`, `--seed`, `--width`, `--height`, `--provider`, `--beauty` (`none`\|`remote`\|`external-pbr`)
- Outputs: `tmp/governed-render/<runId>/still.png`, `verification-trail.json`
- Bans: no charter.js edits; no fake photoreal PNG from Lemonade or beauty stubs
- Beauty: `--beauty remote` selects `photoreal.remote.diffusion`; deferred if URL unset (layout still unchanged)

## Acceptance

1. Same prompt+flags → same `runId` and Engine3D soft hash
2. Trail lists policy order, provider, `fallbackUsed`, Lemonade held
3. README one-liner documents the command

## Handoff

Builder: script + package.json + trail stubs.
