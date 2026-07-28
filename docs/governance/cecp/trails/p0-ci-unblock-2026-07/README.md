# CECP Trail — p0-ci-unblock-2026-07

| Field | Value |
|-------|-------|
| `trailId` | `p0-ci-unblock-2026-07` |
| `namespace` | `cecp.trail.p0-ci-unblock-2026-07` |
| `feature` | Fix four P0 CI blockers (stubFetch file://, bloomCombine BGL, package-types vendor ignore, GPUPreviewClient ESM `__dirname`) |
| `requestedBy` | Operator / Phase 1–2 crew mandate |
| `started` | 2026-07-28 |
| `lineage` | Architecture → Build → Implementation → Review → Inspection → ESFR |
| `overallStatus` | **enforced** for the four P0 gates verified below; residual GPU BGL sampleType debt on non-combine passes remains **partial** |
| `protocol` | `docs/governance/CECP_OMEGA_PROTOCOL.md` |
| `cognitive-profile` | Optimizer (Tier II framing; ≠ SC Optimizer mode alone) |
| `mode` / `lens` | Warrior · Debugger · Sentinel (representative) |
| `actorMode` | Anchor (ESFR) · Navigator (Architect path) |
| `softwareCreationMode` | Debugger · Testwright · Boundary-Guardian · Forge |

## Modes applied (representative rotation)

Full suite of **60** modes consulted via roster awareness
(`CREW_MODES.md` / `CECP_ACTOR_MODES.md` / `SOFTWARE_CREATION_MODES.md`).
Deep application of all 60 is **not** claimed.

| Stage | Role | Modes applied |
|-------|------|---------------|
| 01 | Architect | Navigator + Debugger + Warrior |
| 02 | Builder | Blueprint + Constructor |
| 03 | Implementor | Debugger + Integrator (SC) + Testwright |
| 04 | Reviewer | Boundary-Guardian + Conformance + Scholar |
| 05 | Inspector | Sentinel + Testwright + Librarian |
| 06 | ESFR | Anchor + Forge |

## Stage checklist

- [x] `01-architect-adr.md`
- [x] `02-builder-scaffold-manifest.md`
- [x] `03-implementor-notes.md`
- [x] `04-reviewer-conformance.md`
- [x] `05-inspector-acceptance.md`
- [x] `06-engineer-standards.md`
- [x] `08-esfr-verdict.json`
- [x] `lineage.json`
- [x] `README.md` (this index)

## Verification snapshot (2026-07-28)

| Gate | Result |
|------|--------|
| `npm run test:conformance` | 16/16 COMPLIANT |
| `node scripts/check-package-types.mjs` | exit 0 (35 packages; vendor ignored) |
| `node --test mrs/packages/renderer-core/test/gpu/gpu-core.test.js` | 64/64 pass |
| `npm run test:governance` | 163/163 pass |
| `node scripts/mandala-lint/run.mjs` | 0 errors |
| `node mandala-agent/drift-radar/generate-report.mjs` | exit 0 (partial fidelity) |
| `node scripts/genblaze/security-audit.mjs` | exit 0 (XSS skipped honestly) |

## Still uncommitted

Working tree holds these fixes; **no commit/push** unless operator asks.
