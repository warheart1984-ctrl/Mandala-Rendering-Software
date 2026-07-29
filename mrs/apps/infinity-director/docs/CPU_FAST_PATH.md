# CPU Fast / Beauty rendering (Infinity Director → Genblaze)

**Status:** partial (Director profiles + UI) · Genblaze still contracts unchanged  
**Print SoT:** `cpu.rt4d.print` — these profiles are **preview/still assist**, not Digital Printer beauty.

## How to make pictures faster on CPU

1. **Prefer Engine3D soft-raster** (`engine3d_still`) — already soft-raster; no path-trace.
2. **Use Director Fast Mode** (`speed_profile=fast`) — 256², AOVs off, draft quality, skips Ollama.
3. **Warm up once** — `POST /api/warmup` (128²) before demos.
4. **Reuse run ids** — UI auto-fills `source_run_id` from the last preview.
5. **Avoid** `quality=final` and RT4D dense tesseract prompts on weak CPUs unless needed.
6. **Keep** `GENBLAZE_IMAGE_BACKEND=rt4d` and video off; Genblaze draft already caps ~256² / 4 spp for `/api/generate`.

## What is NOT wired (do not invent)

These flags from marketing notes are **unsupported** on Genblaze still lanes and are listed in profile `unsupported_flags`:

- `ao_enabled` / `gi_enabled` / `postfx_enabled`
- `GENBLAZE_RASTER_MODE`
- `color_grade`
- Engine3D `path_trace` → **501** (not implemented)

## Profiles

| Profile | Default lane | Size | Notes |
|---------|--------------|------|-------|
| `fast` | `engine3d_still` | 256² | samples=1 on prompt-to-scene; AOVs off |
| `beauty` | `engine3d_still` | 512² | AOVs on; still draft Genblaze quality |
| `atcm` | via suggested `fast`/`beauty` | 256² or 512² | Adaptive Tile Complexity Minimization planner; see below |
| `auto` | heuristic/planner | settings defaults | may call Ollama if configured |

## ATCM (Adaptive Tile Complexity Minimization)

**Status:** partial · `POST /api/atcm/plan` and `speed_profile=atcm` on `/api/direct`  
**Contract:** [RENDER_ACCEL_CONTRACT.md](./RENDER_ACCEL_CONTRACT.md) — response fields `render_plan`, `complexity_evidence`, `replay_record`  
**Math program:** [MATH_DRIVEN_RENDER_ACCEL.md](./MATH_DRIVEN_RENDER_ACCEL.md) — five-part acceleration map; optional `math_strategies` on RenderPlan

“100% faster” here means **~half the work units** in a labeled estimate model (`cheap=0.25`, `full=1.0`), not a measured wall-clock 2×. Speedup requires less work per pixel and/or more parallelism; ATCM designs for both (tile plan + ThreadPoolExecutor for planning).

| What ATCM does today | What it does **not** claim |
|----------------------|----------------------------|
| Tile grid + complexity score (prompt cues; optional PNG prepass from `source_run_id`) | Measured FPS / guaranteed 2× |
| Cheap vs full **classification** per tile | Per-tile Genblaze shading (stills are full-frame) |
| Suggests Director `fast` or `beauty` from the work model | Digital Printer SoT (`print_sot: false`) |

```bash
curl -sX POST http://127.0.0.1:8791/api/atcm/plan \
  -H "Content-Type: application/json" \
  -d '{"prompt":"empty sky wall flat","width":256,"height":256}'
```

## Operator boot

```bash
# Genblaze
set GENBLAZE_IMAGE_BACKEND=rt4d
uvicorn app.main:app --host 127.0.0.1 --port 8787

# Director
cd mrs/apps/infinity-director
uvicorn app.main:app --host 127.0.0.1 --port 8791
```

Open `http://127.0.0.1:8791/` → **Fast Mode** → **Warmup** → **Dispatch**.
