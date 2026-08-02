# Implementor notes — RT4D ChatGPT plugin Phase 2

**Trail:** `rt4d-chatgpt-plugin-phase2-2026-08`  
**Status tags:** MCP bridge **partial**; widget **partial**; ChatGPT embedded UI host-dependent; export / directory **declared**; RT3D JSON-ledger persistence **tested** (AC-L1–L6); CIEMS-shaped RT3D evidence bridge **declared** (AC-C1–C3 tested in-repo; CIEMS runtime external)

## Intent

Ship interactive dimensional preview viewer + `update_rt4d_scene` wiring for PR continuation after Phase 1 (#100 merged).

## Files touched

- `mrs/apps/rt4d-chatgpt-plugin/widget/` — React + Vite + Three.js viewer → `dist/rt4d-viewer.html`
- `mrs/apps/rt4d-chatgpt-plugin/server/src/tools/update-rt4d-scene.ts` — rotations/projection update + optional rePreview
- `mrs/apps/rt4d-chatgpt-plugin/server/src/scene-store.ts` — `updateRt4dSceneRecord`
- `mrs/apps/rt4d-chatgpt-plugin/server/src/index.ts` — `ui://rt4d/viewer-v1`, widget meta on create/render/update/inspect
- README + SKILL.md + plugin.json honesty updates
- Contract tests extended

## Tests

- `pnpm --filter @mrs/rt4d-engine test` — HTTP AC1–AC7 + AC-L1–L6 + AC-C1–C3
- `pnpm --filter @mrs/rt4d-chatgpt-plugin test` — phase1+2 contract incl. evidence surface
- `widget/npm run build` + `typecheck` — pass (Phase 2)

## Persistence / evidence pillar (priorities #2–#4)

- **Verified in-repo:** `Rt3dLedger` JSON-ledger capture → save → load → replay (AC-L1–L6); MCP `render_rt4d_preview` surfaces engine `evidence` / `replayToken` on the success path.
- **Declared substrate:** `rt3dEvidenceBridge` CIEMS-shaped envelope (AC-C1–C3); not a Drive-G CIEMS/JCR runtime gate.
- **CIEMS promotion:** still **Drive-G deferred** — author promotion packets under `G:\CIEMS` / CECP trail only when explicitly promoting; do not claim CIEMS enforcement from MRS alone.

## Gaps (Phase 3)

- `export_rt4d_asset` still skeleton
- AnimeStylizer / ChatGPT directory listing not claimed
- CIEMS host admission of RT3D envelopes remains external (Drive-G)

## Debt — portrait lighting API mismatch (**declared**)

**Bug-prevention / do not wire without adapter.**

- `createPortraitLightingRig` (renderer-core) returns a **portrait object**
  (`keyLight` / `fillLight` / `rimLight` / `envLight`).
- `Scene4D.setLightRig` expects an **array** of RT4D lights (`lightRig.map(...)`).
- Passing the portrait object into `setLightRig` would throw or silently mis-bind.

**Current path:** RT4D engine / plugin preview use the audited `render-still.mjs` light list; do **not** call `createPortraitLightingRig` → `setLightRig` until an adapter exists.

**Status:** debt **declared** (not fixed in this trail).
