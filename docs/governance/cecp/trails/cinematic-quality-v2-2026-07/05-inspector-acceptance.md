# 05 — Inspector acceptance: cinematic-quality-v2

**Trail:** `cinematic-quality-v2-2026-07`  
**Stage:** Inspector  
**mode:** Testwright + Librarian  
**Verdict:** **PASS_WITH_GAPS**

## Acceptance matrix

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Raster-upgrade tests | PASS 13/13 | `npm` / `node --test dist/test/renderer/raster-upgrade.test.js` |
| First-10s MP4 | PASS | `showcase-cinematic-v2/archive-of-consent-ch1-first-10s.mp4` (240 frames @ 24fps, ~436s wall) |
| V2 still + before/after | PASS | `stills/engine3d-02-dim-room-cinematic-v2.png`, `before-after-02-dim-room.png` |
| ~30s remaster | PASS | `showcase-cinematic-v2/archive-of-consent-ch1-showcase-30s.mp4` (720 frames @ 24fps, ~1265s wall) |
| Lemonade beauty plates composed | FAIL / N/A | `sd-server failed to start` — no real plates |
| Genblaze SX lemonade path | PASS (honest halt) | CIS stops at HALT with mirrored error |
| CECP trail 01–06 | PASS | this folder |
| No charter edits | PASS | git scope |

## Gaps

1. Lemonade GPU stills remain **blocked** on this host.  
2. 30s remaster wall-time heavy (~2s/frame × ~720 frames) — accept if file lands.  
3. Face blendshapes limited to fixture names (Frown/MouthOpen/Squint).

## Inspector note on Genblaze

SX CIS demo is a **governance UX** over image dispatch. It does not upgrade Engine3D soft-raster physics. Integration is: optional plate attach when Lemonade returns bytes; until then Engine3D cinematic-v2 is the film.
