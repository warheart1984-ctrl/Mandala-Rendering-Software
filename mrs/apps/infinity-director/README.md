# Infinity Director

Read-only director service for routing natural-language prompts through
existing MRS / Genblaze still-image lanes.

## Scope

- Reads optional Project Infinity / Jarvis memory-board context
- Does not persist memory
- Does not query Genblaze recent assets automatically
- Dispatches only to existing still-image endpoints

## Run locally

### 1) Genblaze (downstream 4D / 3D lanes)

```bash
cd mrs/apps/genblaze-media
set GENBLAZE_IMAGE_BACKEND=rt4d
uvicorn app.main:app --host 127.0.0.1 --port 8787
```

Confirm `GET http://127.0.0.1:8787/health` shows `rt4d.available` / `engine3d_still.available` as expected.

### 2) Director (this app)

```bash
cd mrs/apps/infinity-director
uvicorn app.main:app --host 0.0.0.0 --port 8791 --reload
```

UI: `http://127.0.0.1:8791/` · Health: `http://127.0.0.1:8791/health`

**Restart after code changes:** if `POST /api/warmup` or `/api/atcm/plan` returns **404**, the `:8791` process is stale — stop it and start again from this directory (see commands above). Route gate: all three should return **non-404** (`warmup`/`atcm/plan` → 200, `idac/intent` → 200 or 422 with body).

**Authority:** director still-image dispatch only. Observation/aperture projection is not print SoT — CPU RT4D (`cpu.rt4d.print`) remains the Digital Printer path.

## CPU Fast / Beauty profiles

See [docs/CPU_FAST_PATH.md](docs/CPU_FAST_PATH.md), [docs/RENDER_CONSTITUTION.md](docs/RENDER_CONSTITUTION.md), and [docs/ACCELERATED_RENDERER.md](docs/ACCELERATED_RENDERER.md) (governed pipeline · **partial**).

- UI toggle: **Fast** / **Beauty (CPU)** / **ATCM** / **Auto**
- API: `speed_profile` on `POST /api/direct` (`atcm` runs tile plan then remaps to fast/beauty)
- Catalog: `GET /api/speed-profiles`; plan-only: `POST /api/atcm/plan`
- ATCM work speedup is **estimate_not_measured** (see `docs/CPU_FAST_PATH.md`)
- Warmup: `POST /api/warmup`

**Fastest demo path:** Fast Mode → Warmup → Dispatch with `engine3d_still` (or leave mode=auto). Reuse the auto-filled run id for subsequent frames.

## Environment

- `DIRECTOR_GENBLAZE_BASE_URL` - target Genblaze base URL
- `DIRECTOR_MEMORYBOARD_BASE_URL` - optional Jarvis API base URL exposing `/api/jarvis/memory/board` and `/api/jarvis/memory`
- `DIRECTOR_PLANNER_MODE` - `heuristic` (default), `http`, `openai`, or `ollama`
- `DIRECTOR_PLANNER_URL` - optional external planner endpoint when mode=`http`
- `DIRECTOR_PLANNER_BASE_URL` - OpenAI-compatible base URL (for Lemonade-compatible chat or similar)
- `DIRECTOR_PLANNER_MODEL` - planner model id for `openai` or `ollama`
- `DIRECTOR_PLANNER_API_KEY` - optional bearer/api key for OpenAI-compatible planner

## Local planner examples

### Ollama

```bash
set DIRECTOR_PLANNER_MODE=ollama
set DIRECTOR_PLANNER_BASE_URL=http://127.0.0.1:11434
set DIRECTOR_PLANNER_MODEL=qwen2.5-coder:3b
set DIRECTOR_PLANNER_TIMEOUT_SECONDS=90
```

### Lemonade / OpenAI-compatible

```bash
set DIRECTOR_PLANNER_MODE=openai
set DIRECTOR_PLANNER_BASE_URL=http://127.0.0.1:13305/api/v1
set DIRECTOR_PLANNER_MODEL=YOUR_TEXT_MODEL_ID
```

Note: Lemonade must actually expose a text/chat-capable model for the planner path.

## Recommended local planner

As of Tuesday, July 28, 2026, this workspace already has these Ollama models available:

- `qwen2.5-coder:3b`
- `qwen2.5-coder:7b`

Use `qwen2.5-coder:3b` for the director by default. It is lighter, already installed,
and well-suited to constrained JSON routing on CPU.

The first local Ollama call can be noticeably slower on CPU, so the director now
defaults to a longer planner timeout for local model use.
