# 04 — Reviewer: Conformance

**Trail:** `prompt-scene-docker-2026-07`  
**Stage:** Reviewer (read-only on product code; CECP trail write only)  
**Predecessor:** Implementor (`03-implementor-notes.md`)  
**Verdict:** **PASS_WITH_NOTES**

---

## 1. Verdict

**PASS_WITH_NOTES**

Implementor dual-layout + Docker COPY/ENV/smoke wiring matches Architect ADR and Drive-G-1 status tags. No ban breaches, no protected-path edits, expand stays opt-in (`0`). Residual notes are evidence gaps for Inspector (image rebuild / local health), not claim overreach.

---

## 2. Scope audited

| Path | Role |
|------|------|
| `Dockerfile` | COPY `/app/prompt-scene-bridge/`, ENV, stub + `--expand` smoke |
| `mrs/apps/genblaze-media/app/prompt_scene_provider.py` | Dual-layout `run_bridge.py` resolve |
| `mrs/adapters/prompt-scene-bridge/mrs_map.py` | Repo-root guess + sibling expand default |
| `mrs/apps/genblaze-media/README.md` | Prepared / partial / declared honesty |
| `mrs/adapters/prompt-scene-bridge/CONTRACT.md` / `README.md` | Docker `/app` tags |
| `.env.example` / `render.yaml` | Commented / pinned ENV |
| `mrs/apps/genblaze-media/tests/test_prompt_to_scene.py` | Docker-layout AC |
| `mrs/adapters/prompt-scene-bridge/test_mrs_map.py` | ENV + sibling expand ACs |
| Trail `01`–`03` | Intent / scaffold / implementor evidence |

Protected paths checked vs HEAD: no content diffs under `constitution/`, `engine/constitution/`, `AGENTS.md`, `engine/governance/policies/default.policies.json`, `engine/conformance/default.conformance-profile.json`.

---

## 3. Checklist results

| Check | Result |
|-------|--------|
| 1. No `story_forge` / `storyforge` under `mrs/apps/genblaze-media/app/*.py` | **OK** — ripgrep zero matches; ban tests cited by Implementor |
| 2. No protected path edits | **OK** |
| 3. Docs status tags match evidence | **OK** (notes below) |
| 4. Expand opt-in default `0` | **OK** — Dockerfile `PROMPT_SCENE_EXPAND_WORLD=0`; `config.py` default `"0"` / `False`; `render.yaml` `"0"`; expand smoke uses CLI `--expand` only |
| 5. Docker paths consistent with RT4D `/app` pattern | **OK** — flatten beside `renderer-core` / `engine3d-core`; ENV `/app/...`; `WORKDIR /app` |
| 6. Defects / overclaims | **None critical** — notes only |

---

## 4. P1–P5 checklist

| Principle | Result |
|-----------|--------|
| P1 intent | **OK** — Trail `01`/`03` declare Docker bundle + dual-layout so `/api/prompt-to-scene` can resolve in flattened image |
| P2 evidence | **OK** — Unit tests for dual-layout + sibling expand; Dockerfile smokes declared in contract; live Render not claimed |
| P3 authority | **OK** — Allowlisted product paths + CECP trail; Infinity/story_forge not installed in image |
| P4 replayable | **OK** — Path resolve is deterministic filesystem checks; no new randomness; expand smoke asserts non-empty `objects` |
| P5 sovereignty | **OK** — Platform-agnostic `/app` paths; no vendor-only expand path; Render blueprint optional belt-and-suspenders only |

Runtime policies / 16 conformance checks: **N/A** for this trail (no CKL/provenance/timeline mutations). No math surface touched.

---

## 5. Drive-G-1 claim honesty

| Claim | Tag in docs | Evidence | Assessment |
|-------|-------------|----------|------------|
| Dual-layout Genblaze / `mrs_map` defaults | **enforced** | `test_prompt_scene_bridge_default_script_docker_layout`; `test_default_expand_script_*` | Match |
| Repo-root Docker COPY + ENV + smokes | **partial** | Dockerfile contract; Implementor did **not** rebuild image | Match — not overclaimed as enforced |
| Operator Prompt→Scene readiness | **Prepared** | Genblaze README row | Match |
| Live Render `/health.prompt_scene.available: true` | **declared** | Explicit until Manual Deploy | Match |
| Expand default off | ENV `0` / **declared** opt-in | Dockerfile + config + render.yaml | Match (conservative; not overclaim) |
| Unexpanded world stub arrays | **partial** | Unchanged contract | Match |
| Infinity / `story_forge` in image | **not** installed | COPY list is `run_bridge.py`, `mrs_map.py`, `schemas/` only | Match |

---

## 6. Notes (non-blocking)

1. **Image health gap (Inspector):** Implementor notes full `docker build` + container `/health.prompt_scene.available: true` not re-verified. Keep bundling **partial** until Inspector proves build smoke + local health. Do not elevate live Render beyond **declared**.
2. **README conflation (low):** Genblaze Prompt→Scene status cell ties Docker **partial** to “until Manual Deploy proves health.” CONTRACT separates image bundling (**partial**) from live Render (**declared**). Prefer CONTRACT wording; not a false **enforced** claim.
3. **CONTRACT heading (low):** “Docker `/app` layout (**partial** until Manual Deploy health)” slightly mixes gates; table rows are correct.
4. **Git hygiene:** Large unrelated dirty tree remains; commit stage must stage allowlisted trail paths only (Architect §7).

---

## 7. Violations

(none)

No `VIOLATION:` rows for P1–P5, bans, protected paths, or Drive-G-1 overclaims.

---

## 8. Handoff to Inspector

1. Rebuild repo-root image; confirm build passes bridge stub smoke + `--expand` smoke (`objects` length > 0) while image ENV still `PROMPT_SCENE_EXPAND_WORLD=0`.
2. Run container; probe `GET /health` → `prompt_scene.available: true` (and `expand_world: false` unless opted in).
3. Re-run cited unit/ban tests; confirm green.
4. Do **not** accept live Render availability as **enforced** without Manual Deploy evidence.
5. Confirm no `story_forge`/`storyforge` under `app/*.py` and no protected-path staging.
