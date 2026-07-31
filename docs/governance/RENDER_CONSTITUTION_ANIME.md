# Render Constitution — Constitutional Anime Rendering

| Field | Value |
|-------|-------|
| `id` | `render-constitution.anime.v1` |
| `schemaVersion` | `1.0.0` |
| `status` | **partial** (authority + labeling rules documented; CKL deny **declared**) |
| `trail` | `constitutional-anime-rendering-2026-07` |
| `binds` | `AnimeWorldProfile` v1.0 · structure/beauty lane lock · provenance manifests |
| `doesNotAmend` | `constitution/CHARTER.md` · `engine/constitution/*` · `AGENTS.md` · `default.policies.json` |

> Product thesis: *The first Constitutional Anime Render: governed style,
> deterministic replay, 4D geometry.*

This document is a **product-layer constitution** for anime stylization. It does
**not** replace the Constitutional Engine Charter. Status tags follow Drive-G-1.

---

## 1. Authority to change profiles

| Actor | May | Status |
|-------|-----|--------|
| Human operator (repo owner) | Create/supersede `AnimeWorldProfile` JSON under `schemas/anime/` | **enforced** by git review norms |
| MRS Architect / Builder (CECP trail) | Propose schema + example changes; must keep Drive-G-1 tags honest | **partial** (trail process) |
| Genblaze / Engine3D runtime | **Load + validate** profiles; must **not** silently mutate profile fields mid-shot | **partial** (validator exists) |
| Diffusion backends (FLUX / Lemonade / fal) | Consume steered prompts derived from profile; never rewrite profile SoT | **declared** binding |
| CKL / `default.policies.json` | Future opt-in soft-check on `continuity_invariants` | **declared** — requires explicit user auth to amend policies |

**Supersession rule:** a new profile MUST set a new `profileId` (or bump a
semver suffix) and SHOULD record `supersedes` in trail notes when replacing an
active profile used by continuity demos. Silent in-place aesthetic drift is
forbidden for continuity claims.

---

## 2. Continuity enforcement

| Layer | Mechanism | Status |
|-------|-----------|--------|
| Profile contract | Required fields incl. `continuity_invariants` | **partial** (schema + hand validator) |
| Shot plan | Named characters, camera angles, lighting presets, transforms | **partial** (5-shot plan + runner) |
| Dual-run replay | Re-render from frozen params; compare beauty sha256 | **enforced** (Engine3D continuity runner this host cycle) |
| CKL deny on invariant break | Policy gate | **declared** |
| Beauty-lane cross-shot identity | Diffusion seed + profile id in manifest | **declared** / **partial** when painter online |

Continuity of **structure** (geometry, camera, lighting params) is the backbone.
Beauty polish MUST NOT claim character continuity unless structure provenance
and profile id are attached.

---

## 3. Provenance logging

Every constitutional anime frame / plate MUST be able to assert:

> Rendered under AnimeWorldProfile vX.Y, structure from RT4D|Engine3D,
> polished by backend B|structure-only, provenance hash H.

Required manifest fields (profile `provenance_requirements`):

| Field | Required | Status |
|-------|----------|--------|
| `style` | yes (`anime`) | **partial** (Genblaze + runners) |
| `anime_world_profile_id` | yes | **partial** (pipeline CLI + continuity) |
| `structure_source` | yes (`engine3d` \| `rt4d`) | **partial** |
| `path_kind` / `lane` | yes (`structure` \| `beauty` \| `structure-only`) | **partial** (pipeline) |
| `polish_backend` | yes (`fal` \| `lemonade` \| `nvidia` \| `cel-proxy` \| `none`) | **partial** |
| `structure_sha256` | yes | **partial** |
| `beauty_sha256` | yes when beauty produced | **partial** |
| `intentId` / `worldId` / `timelineId` | per profile flags | **declared**→**partial** on demo manifests |

**Fail-closed labeling:** if the beauty painter fails or is unconfigured, the
manifest MUST set `lane: structure-only` (or `structure` + `polish_backend: none`)
and MUST NOT claim `anime-polished` / diffusion beauty.

---

## 4. Replay guarantee

| Concern | Guarantee | Status |
|---------|-----------|--------|
| Structure params frozen | JSON parameters file per shot; dual-run hash equality | **enforced** (Engine3D 5-shot) |
| Profile frozen with run | Copy of profile JSON into output dir | **partial** |
| Diffusion beauty bit-identical replay | Same seed + backend + model | **declared** (provider non-determinism common) |
| CSE ReplayService host restore | Conformance `replay.*` | **partial** (engine); anime bridge **declared** |

Operators MUST treat diffusion beauty as **assist** unless a specific backend
proves seed-stable replay in tests.

---

## 5. Lane lock (normative)

| Lane | SoT | May claim anime look? |
|------|-----|------------------------|
| **Structure** | Engine3D soft-raster, RT4D lattice/tesseract, 4D transforms | Only via local cel-proxy (**partial**) or after beauty polish |
| **Beauty** | FLUX / Lemonade / fal img2img (pluggable cel shaders) constrained by profile | Yes when `polish_backend` succeeded and pixels produced |
| **Structure-only fallback** | Structure plate unchanged | **No** — label honestly |

See trail `LANE_LOCK.md`.

---

## 6. Honest non-claims

- Not Full Photoreal / CPCS beauty SoT
- Not Digital Printer beauty SoT
- Not an amendment to the Constitutional Engine Charter
- Not CKL-enforced until policies + tests land with explicit authorization
- Lemonade SD / `sd-server` may be **blocked** on AMD hosts — document, do not invent pixels

---

## 7. Status legend

| Tag | Meaning |
|-----|---------|
| **enforced** | Verified by tests / dual-run on this cycle |
| **partial** | Implemented with known gaps |
| **declared** | Designed; not runtime-gated |
| **skeleton** | Stub only |
