# 01 — Architect ADR: Proton raster beauty HQ upgrade

**Trail:** `proton-hq-2026-07`  
**Trail path:** `docs/governance/cecp/trails/proton-hq-2026-07/`  
**Stage:** Architect (CECP 01)  
**Protocol:** `docs/governance/CECP_OMEGA_PROTOCOL.md`  
**Predecessors:** `judge-wow-2026-07`, `proton-raster-2026-07`

---

## 1. Intent

Materially improve **visual density, brightness, and cleanliness** of the existing CPU proton soft-splat **beauty** plate so judge-wow pixels read as dramatically HQ — without claiming GPU splat, path-trace, or new constitutional authority.

| Goal | Tag target |
|------|------------|
| Quality preset + CLI knobs (`--quality high` / width·supersample·tonemap) | **enforced** |
| HQ resolution band **512–768** (prior judge-wow **256–512**) | **enforced** |
| Denser star→proton mapping via enrich knobs | **enforced** |
| Deterministic tonemap (ACES-lite or Reinhard) + exposure | **enforced** |
| Better Gaussian kernel params (sigma/opacity scales) | **enforced** / **partial** |
| Lighting4D punch (core + arm contrast) — opt-in | **enforced** when toggle ships |
| Optional bloom / depth-cue | **declared** (off by default this trail) |
| Supersample→downsample AA | **enforced** |
| Re-render → `output/judge-wow-hq/beauty.png` (+ AOVs) | **enforced** |
| 1–2 tests: tonemap / supersample determinism | **enforced** |
| Honest tags; no GPU / path-trace vaporware | **enforced** |

**Why:** `judge-wow-2026-07` proved dense star→proton at 256–512 with soft blobs. This trail is a **quality upgrade pass** on the same six-mod CPU path.

## 2. ADR decision

### Context

Judge-facing beauty is soft, low-res, and exposure-flat. Highest leverage: resolution + denser protons + kernel/exposure/tonemap + optional lighting punch — all **deterministic CPU**.

### Decision

1. Compose presets (`default` | `high`); do not fork six mods.
2. HQ resolution **[512, 768]**; high default **512**.
3. Drive `enrichJudgeWowField` with preset density/radius/color knobs.
4. Thin deterministic tonemap post on float beauty before 8-bit encode.
5. Kernel knobs: `sigmaScale`, `opacityScale`.
6. Lighting punch via lights / enrich core boost; still Mod 6.
7. Bloom/depth-cue **declared**, off by default.
8. Supersample `ss∈{1,2}` then box downsample; evidence records both dims.
9. Ship `mrs/packages/renderer-core/output/judge-wow-hq/beauty.png` + AOVs + evidence.
10. Non-decisions: charter/AGENTS/policies; GPU; PathTracer; Genblaze; MaterialMap4D.

### Consequences

Positive: measurable CLI + tests. Tradeoff: CPU cost. Risk: double-tonemap — prefer beauty post as primary curve; lighting punch as linear-ish pre-gain.

## 3. Interface specification

### CLI

```text
--quality default|high
--width N --height N
--supersample N
--tonemap none|reinhard|aces-lite
--exposure F
--lighting-punch
--out-dir <dir>   # HQ default: output/judge-wow-hq
```

### Bans

No GPU / path-trace / RTX claims. No PRNG in accumulate/tonemap/downsample. No protected-path edits.

## 4. Constitutional boundary analysis

**In:** `rt4d/proton/*` quality helpers, CLI scripts, HQ output, CECP trail.  
**Out:** `constitution/`, `AGENTS.md`, policies, GPU stack, path-trace.

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| `…/proton/qualityPreset.js` | create→fill | Builder→Implementor |
| `…/proton/tonemap.js` | create→fill | Builder→Implementor |
| `…/proton/supersample.js` | create→fill | Builder→Implementor |
| `…/proton/bloom.js` | declared stub | Builder |
| `…/proton/pipeline.js`, `rasterizeProtons.js`, `index.js` | modify | Implementor |
| `scripts/render-proton-splat.mjs`, `judge-wow-hq.mjs` | wire | Implementor |
| `output/judge-wow-hq/beauty.png` | render | Implementor |
| Trail `01`–`06` | create | Crew |

## 6. Acceptance criteria

- [ ] `--quality high` → beauty in **[512, 768]**
- [ ] Same seed+preset → identical frame/png hashes (no wall-clock in hash)
- [ ] Tonemap + supersample determinism tests
- [ ] HQ plate at `output/judge-wow-hq/beauty.png` (+ depth/normal)
- [ ] Evidence includes quality/tonemap/exposure/supersample + intentId
- [ ] Existing proton/judge-wow tests green; no charter edits
- [ ] No GPU/path-trace claims; bloom remains declared if unshipped
- [ ] Stages 01–06; ESFR is ship gate

## 7. Handoff to Builder

Scaffold stubs + CLI shell + trail README/lineage; Implementor fills math and wires splat.
