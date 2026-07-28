# 05 — Inspector: Acceptance

**Trail:** `prompt-scene-docker-2026-07`  
**Stage:** Inspector (evidence only; CECP trail write)  
**Worktree:** `G:/Mandala Rendering Software/.worktrees/cecp-docker-rebase`  
**HEAD at re-inspect:** `bbc1aa4060d3e88036194170854328b1e79d05ff` (`tmp/cecp-docker-rebase`)  
**Gap fix:** `bbc1aa4` — shipped `lattice_polish_defaults.py` + `test_lattice_polish_defaults.py`  
**Predecessor:** Reviewer (`04-reviewer-conformance.md`); prior inspector pass FAIL @ `90cf2f7`  
**Verdict:** **PASS_WITH_GAPS**

---

## 1. Verdict

**PASS_WITH_GAPS**

After gap fix `bbc1aa4`, Genblaze import graph is healthy: dual-layout `mrs_map`, `test_prompt_to_scene`, story_forge ban nodeids, and lattice polish unit tests all pass. Repo-root `Dockerfile` still statically declares COPY/ENV/bridge+expand smokes. Remaining gaps: Docker Desktop daemon unavailable (image build + `/health` unverified); live Render health stays **declared**.

---

## 2. Commands run (re-inspect after `bbc1aa4`)

| Command | Result |
|---------|--------|
| `pytest mrs/adapters/prompt-scene-bridge/test_mrs_map.py -q --tb=line` | **exit 0** — 16 passed, 3 skipped |
| `pytest mrs/apps/genblaze-media/tests/test_prompt_to_scene.py -q --tb=line` | **exit 0** — 10 passed |
| Ban + lattice: `test_api.py::test_no_story_forge_imports`, `test_seedance.py::test_seedance_modules_have_no_story_forge`, `test_prompt_to_scene.py::test_ban_note_app_must_not_import_narrative_lane`, `tests/test_lattice_polish_defaults.py` | **exit 0** — 6 passed |
| `docker info` | **exit 1** — client OK; daemon: `failed to connect … dockerDesktopLinuxEngine` (pipe missing) |
| `docker build` | **not re-attempted** — daemon still blocked (same pipe error) |
| Remote feat branch | Prior note stands: `ls-remote` empty; **no push** |

---

## 3. Claim ↔ evidence

| Claim | Evidence | Result |
|-------|----------|--------|
| Dual-layout / sibling expand defaults **enforced** | `test_mrs_map.py` 16 passed | **PASS** |
| Genblaze Docker-layout default + ban note | `test_prompt_to_scene.py` 10 passed | **PASS** |
| No `story_forge` / `storyforge` under `app/*.py` | Ban nodeids + PTS ban among 6 passed | **PASS** |
| Lattice polish defaults module present | `bbc1aa4` + `test_lattice_polish_defaults.py` (in 6 passed) | **PASS** |
| Repo-root Docker COPY bridge → `/app/prompt-scene-bridge/` | `Dockerfile` L85–87 | **PASS** (static) |
| ENV `/app` bridge + expand; expand default off | L48–50 `PROMPT_SCENE_EXPAND_WORLD=0` | **PASS** (static) |
| Build smoke: bridge `--json` / `--expand` | L131–140 RUN lines present | **UNVERIFIED** (daemon down) |
| Local image `/health.prompt_scene.available: true` | Not probed | **UNVERIFIED** |
| Live Render health | Not claimed | **declared** (N/A) |
| Docs do not overclaim live deploy | CONTRACT / Genblaze tags unchanged | **PASS** |

---

## 4. Docker blocker + static Dockerfile proof

**Blocker (unchanged):** Docker Desktop Linux engine not running (`npipe:////./pipe/dockerDesktopLinuxEngine` missing). Image rebuild and container `/health` cannot be evidenced.

**Static proof (repo-root `Dockerfile`):**

- **COPY:** `run_bridge.py`, `mrs_map.py`, `schemas` → `./prompt-scene-bridge/`
- **ENV:** `PROMPT_SCENE_BRIDGE_SCRIPT=/app/prompt-scene-bridge/run_bridge.py`; `ENGINE3D_EXPAND_SCRIPT=/app/engine3d-core/scripts/expand-world-document.mjs`; `PROMPT_SCENE_EXPAND_WORLD=0`
- **RUN smoke (bridge stub):** `python …/run_bridge.py --prompt "docker bridge smoke" --json`
- **RUN smoke (expand CLI):** `--expand` + `assert len(objects)>0` while ENV stays `0`

Image bundling remains **partial** until daemon-backed `docker build` + `/health` succeed.

---

## 5. Gaps (non-blocking for PASS_WITH_GAPS)

1. Start Docker Desktop; `docker build` repo-root image; confirm bridge + expand smokes.
2. Run container; probe `GET /health` → `prompt_scene.available: true`, `expand_world: false`.
3. Do not elevate live Render beyond **declared** without Manual Deploy evidence.
4. Foreman: fast-forward `feat/engine3d-genblaze-cinematic-plugin` to inspector trail commit after this update; remote feat branch still appears deleted — no push.

---

## 6. Prior FAIL superseded

Inspector FAIL @ `90cf2f7` was correct for HEAD without `lattice_polish_defaults`. Gap fix `bbc1aa4` closed the Genblaze import/test blocker. This re-inspect supersedes that FAIL with **PASS_WITH_GAPS**.

---

## 7. Acceptance decision

| Field | Value |
|-------|-------|
| Decision | **accepted_with_gaps** |
| Inspector verdict | **PASS_WITH_GAPS** |
| Gaps | Docker daemon unavailable; image `/health` unverified; live Render **declared** |
| Closed | Genblaze import graph; mrs_map / PTS / ban / lattice unit evidence |
