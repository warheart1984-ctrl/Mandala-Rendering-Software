# Docker live rebuild + smoke (2026-07-28)

> Status: **PASS** (live) — Docker Desktop Linux engine brought up on Windows;
> image rebuilt; adapters verified; `/health` 200; pipeline PNG artifact ok.

## How Docker was started

Engine was already up from prior session (`Server Version: 29.6.1`,
`Name: docker-desktop`). If down, the working bring-up is:

```powershell
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
# poll until:
docker info --format "Server={{.ServerVersion}} Name={{.Name}}"
```

## Docker AI Gordon

```powershell
docker ai --help   # plugin present (v1.27.0)
docker ai -C "G:/Mandala Rendering Software" "…"
```

Gordon responded with guidance but **could not execute shell** in this
environment (tool calls required interactive y/a/n confirmation and were
rejected). Build/smoke were run directly via `docker` CLI instead.

OpenCode CLI (`opencode`) was **not** on PATH; `.opencode/agents/` present
but unused.

## Build

```powershell
cd "G:\Mandala Rendering Software"
docker build -t mrs-genblaze:storyforge-pipeline-v1 -f Dockerfile .
# BUILD_EXIT=0
# Image: mrs-genblaze:storyforge-pipeline-v1
# Manifest: sha256:c0016a33949c2835e7c093919f109885adeedfe52c9bf1afa2d42a23727a1f2c
```

Build-time smokes inside Dockerfile also **PASS** (prompt-scene bridge,
expand, storyforge `run_pipeline.py` beauty-png assert).

### Build blocker fixed (then rebuilt)

First live attempt failed on `engine3d-core` `tsc` (missing `"star"` /
`"ao"` / `oriented_capsule` / `algorithmId` in type unions). Minimal type
patches + Genblaze `import os` (was `NameError` on `/health`) then rebuild.

## Smoke commands + results

```powershell
# Adapters present
docker run --rm --entrypoint ls mrs-genblaze:storyforge-pipeline-v1 `
  -la /app/storyforge-boundary /app/prompt-scene-bridge /app/proton-raster-bridge
# LS_EXIT=0 — all three dirs populated

# RenderRequest pipeline
# (stdin python driver) → pipeline_rc 0, status ok, route scene-spec,
# artifact beauty-png, png_sha16 e44ef3fa7cee6286

# Health
docker run -d --name mrs-sf-smoke -p 18080:8000 `
  -e GENBLAZE_DRY_RUN=1 -e GENBLAZE_NVIDIA_WARMUP_ON_STARTUP=0 `
  mrs-genblaze:storyforge-pipeline-v1
# GET http://127.0.0.1:18080/health → 200 {"status":"ok", ...}
docker rm -f mrs-sf-smoke
```

## Remaining gaps

| Gap | Tag |
|-----|-----|
| StoryForge upstream Story→RenderRequest producer | **declared** (SF-owned) |
| Gordon interactive shell confirmations | operator UX — not CI-automated |
| `RENDER_REQUEST_API_ENABLED` default 0 | opt-in Genblaze HTTP still **partial** |
| NVIDIA/B2 not configured in dry-run health | expected for this smoke |
