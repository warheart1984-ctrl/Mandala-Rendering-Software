# ANIME_WORLD_PROFILE — Constitutional Anime Rendering (Design Contract)

Status: `partial` (design only). This doc formalizes the **governed style profile**
for the ink/cel lane: a per-shot contract of palette, shading, line, lighting,
character proportion, continuity, and provenance constraints that turns the CPU
soft-raster's limits into a deliberate product decision.

Design intent (from the series vision): *photorealism is crowded, expensive, and
hardware-dependent; a lightweight governed anime engine — connected to provenance,
replay, Unity/Unreal, and 4D effects — is the more distinct entry point.*

## 1. Principles

1. **The profile is the contract.** Every shot is checked against its profile, not
   against an implicit "look." A shot and its profile together are self-describing.
2. **Limits become constraints.** Banded shading, fixed line weight, bounded object
   budget, quantized palette are profile *fields*, not renderer deficiencies.
3. **Determinism (P4).** `(profile_hash, seed, scene) → byte-identical output`.
   No randomness, no time dependence. Replay is exact.
4. **Honest status.** Output is stylized, not photoreal. Never claimed otherwise.
5. **No ungoverned authority.** Binding enforcement goes through the existing
   world-profile CKL pattern (amendment VIII) — that wiring is a **separate,
   authorized governance step**, designed here but not implemented in this trail.

## 2. Relationship to the ink/cel lane

The lane's `InkOptions` (`INK_CEL_SPEC.md` §2) define *capabilities*. A profile
*fixes* those capabilities to specific values and adds governance fields. When a
profile is active:

- `style` must be `"ink-cel"` (a profile cannot request ungoverned styles).
- Ink/cel constants come from the profile, not request defaults.
- The request carries `profile_id`; the server resolves the profile, renders, and
  records profile-derived fields in the manifest.

Profile resolution is a server-side map `profile_id → profile JSON` (design:
`mrs/assets/style/profiles/<id>.json` + schema under
`mrs/assets/style/schemas/anime-world-profile.schema.json` — **new assets, not the
protected world/`engine` trees**). Unknown `profile_id` → 400.

## 3. Profile schema (design sketch)

```json
{
  "profile_id": "anime.neon-lattice.v1",
  "profile_version": 1,
  "schema_version": 1,
  "color_palette": {
    "key": ["#00d0ff", "#ffd75e", "#ff5ec4"],
    "shadow_tint": [0.05, 0.08, 0.14],
    "quantize_levels": 5,
    "desaturation": 0.0
  },
  "shadow_steps": {
    "diffuse_bands": [0.30, 0.70],
    "diffuse_levels": [0.18, 0.62, 1.0],
    "shadow_level": 0.12,
    "specular_cutoff": 0.985
  },
  "outline_rules": {
    "ink_strength": 0.85,
    "line_width": 1,
    "depth_threshold": 0.06,
    "normal_threshold": 0.14,
    "ink_color": [0.05, 0.05, 0.08]
  },
  "material_classes": ["tesseract-surface", "neon-grid", "glass", "emissive", "energy-lattice"],
  "facial_proportion_profile": "anime-01",
  "motion_timing": {
    "lane": "engine3d-sequence",
    "max_frames": 24,
    "orbit_degrees": 360
  },
  "background_detail_budget": {
    "max_scene_objects": 120,
    "supersample": 1,
    "max_seconds_cpu": 30
  },
  "lighting_constraints": {
    "rig": "cinematic",
    "max_lights": 3,
    "key_intensity_range": [0.8, 1.3]
  },
  "continuity_invariants": {
    "require_profile_match": true,
    "invariant_fields": ["scene", "seed", "color_palette", "shadow_steps", "outline_rules", "lighting_constraints"],
    "max_shot_drift": 0.0
  },
  "provenance_requirements": {
    "manifest_fields": ["style", "profile_id", "profile_hash", "profile_version", "ink_sha256", "beauty_sha256"]
  }
}
```

All shading/line constants above mirror `INK_CEL_SPEC.md` defaults 1:1 — a profile
without overrides behaves exactly like the bare lane, which keeps the 
`"cinematic"` default path byte-identical.

## 4. Checks (design; enforcement is the authorized governance step)

| # | Check | Layer | Fails when |
|---|-------|-------|------------|
| C1 | profile exists + schema-valid | API | unknown/`profile_id`, malformed profile |
| C2 | style is `"ink-cel"` under profile | API | style != ink-cel with profile set |
| C3 | object budget | API→CLI | scene object count > `max_scene_objects` (reject or scale) |
| C4 | light rig ≤ `max_lights` | CLI | rig exceeds constraints |
| C5 | palette/shading constants from profile | renderer | constants resolved from profile |
| C6 | invariant fields match across shots (stills in a shot group) | API/CKL | any invariant field differs within a group |
| C7 | determinism: `(profile_hash, seed, scene)` replay | Inspector | two runs of same inputs differ |
| C8 | provenance complete | API | manifest missing required `manifest_fields` |

C6/C7 are the "same constraints as the previous scene" claim, made testable.
C8 is the provenance guarantee a studio can verify externally.

## 5. Governance binding (designed, NOT to be implemented in this trail)

The `continuity_invariants` check is a style-profile gate analogous to the
amendment-VIII world-profile gate (`engine/governance/biometric/worldProfile.js`).
Adding a **style-profile CKL module or amendment IX** is a constitutional change and
requires explicit authorization (protected governance path). This trail documents
the contract only:

- Gate input: `{ profile_id, shot_manifest, prior_shot_manifest? }`
- Verdict: `pass | drift(delta_fields) | deny`
- Drift handling: `max_shot_drift: 0.0` → any drift denies; profiles may raise it.

## 6. Provenance

Manifest additions (stills and sequence frames):

```json
{
  "style": "ink-cel",
  "profile_id": "anime.neon-lattice.v1",
  "profile_version": 1,
  "profile_hash": "<sha256 of canonical profile JSON>",
  "ink_sha256": "<sha256 of ink.png>",
  "invariant_fingerprint": "<sha256 of invariant_fields subset>"
}
```

`profile_hash` makes the exact constraint set auditable; `invariant_fingerprint`
makes cross-shot continuity machine-checkable.

## 7. Roadmap within this trail

1. (implemented later) Ink/cel lane as specced in `INK_CEL_SPEC.md`.
2. Profile JSON + schema assets under `mrs/assets/style/` (new, non-protected).
3. API: `profile_id` resolution, C1–C5 checks, manifest fields.
4. Sequence: `motion_timing` honored by `engine3d-sequence`.
5. **Authorized** governance gate (C6–C8) via existing world-profile CKL pattern.

## 8. Non-goals (this trail)

- No enforcement code in `engine/` (needs authorization).
- No photoreal claims; no Cycles/ACES changes.
- No new BYOK scope; no video lane; no B2 layout change.
- No changes to 4D math, projection, BSDF normalization, or protected schemas.
