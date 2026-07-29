# Default Dockerfile for Render (hackathon App URL).
# Builds Genblaze media: prompt → FLUX → B2, plus the RT4D renderer backend.
#
# Build context MUST be the repo root: the RT4D backend needs
# mrs/packages/renderer-core, which is outside mrs/apps/genblaze-media.
# The app-local Dockerfile cannot bundle it.

# Soft-raster Engine3D structure stills (beauty+AOVs) for portrait polish path.
# Build engine3d-core TypeScript in the Node stage, then copy dist+scripts.
FROM node:22-bookworm-slim AS engine3d-build
WORKDIR /build
COPY mrs/packages/engine3d-core/package.json ./
COPY mrs/packages/engine3d-core/tsconfig.json ./
COPY mrs/packages/engine3d-core/tsconfig.build.json ./
COPY mrs/packages/engine3d-core/src ./src
COPY mrs/packages/engine3d-core/scripts ./scripts
# src uses node:* APIs; tests are excluded via tsconfig.build.json (image only needs dist/src).
RUN npm install typescript@5.9.2 @types/node@22 \
 && npx tsc -p tsconfig.build.json

# Node binary stage (glibc-aligned with bookworm).
FROM node:22-bookworm-slim AS nodebin

FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    GENBLAZE_HTTP_TIMEOUT=600 \
    GENBLAZE_NVCF_TIMEOUT=600 \
    GENBLAZE_PIPELINE_TIMEOUT=720 \
    GENBLAZE_NVCF_POLL_SECONDS=300 \
    GENBLAZE_EMPTY_504_RETRY=0 \
    GENBLAZE_NVIDIA_WARMUP_ON_STARTUP=1 \
    GENBLAZE_CONNECT_TIMEOUT=30 \
    RT4D_NODE_PATH=node \
    RT4D_SCRIPT_PATH=/app/renderer-core/scripts/render-still.mjs \
    SCENE_SPEC_SCRIPT_PATH=/app/renderer-core/scripts/render-scene.mjs \
    VALIDATE_SCENE_SPEC_SCRIPT_PATH=/app/renderer-core/scripts/validate-scene-spec.mjs \
    ENGINE3D_STILL_SCRIPT_PATH=/app/engine3d-core/scripts/render-engine3d-still.mjs \
    ENGINE3D_STILL_ENABLED=1 \
    ENGINE3D_SEQUENCE_SCRIPT_PATH=/app/engine3d-core/scripts/render-engine3d-sequence.mjs \
    ENGINE3D_SEQUENCE_ENABLED=1 \
    PROMPT_SCENE_BRIDGE_SCRIPT=/app/prompt-scene-bridge/run_bridge.py \
    ENGINE3D_EXPAND_SCRIPT=/app/engine3d-core/scripts/expand-world-document.mjs \
    PROMPT_SCENE_EXPAND_WORLD=0 \
    STORYFORGE_BOUNDARY_DIR=/app/storyforge-boundary \
    RENDER_REQUEST_PIPELINE_SCRIPT=/app/storyforge-boundary/run_pipeline.py \
    RENDER_REQUEST_API_ENABLED=0 \
    MRS_RENDER_REQUEST_EXECUTE=0 \
    PROTON_PIPELINE_SCRIPT=/app/proton-raster-bridge/run_proton_pipeline.mjs \
    PROTON_SPLAT_SCRIPT=/app/renderer-core/scripts/render-proton-splat.mjs \
    MRS_RENDER_OUTPUT_DIR=/app/data/output \
    MRS_RENDER_TIMEOUT_SECONDS=120 \
    MRS_PRINT_TIMEOUT_SECONDS=900 \
    PRINTER_API_ENABLED=1 \
    PRINTER_PIPELINE_SCRIPT=/app/storyforge-boundary/run_print.py
# PROMPT_SCENE_EXPAND_WORLD=0: expand remains opt-in (set 1 or pass --expand at runtime).
# MRS_RENDER_REQUEST_EXECUTE=0: RenderRequest deep execute opt-in (CLI --execute or set 1).
# RENDER_REQUEST_API_ENABLED=0: Genblaze POST /api/render-request opt-in.
# PRINTER_API_ENABLED=1: Digital Printer /printer HTTP live execute opt-in (deploy default).

# genblaze-core 0.3.8 still declares pillow<12; overlay Pillow 12.3.0 for CVE fixes
COPY mrs/apps/genblaze-media/requirements-docker.txt .
RUN pip install --upgrade pip \
 && pip install -r requirements-docker.txt \
 && pip install --no-deps Pillow==12.3.0

# Node runtime for the RT4D renderer backend. Only the binary is copied: npm is
# not needed because render-still.mjs imports node builtins plus renderer-core
# sources, so renderer-core has no installed dependency at render time.
# libstdc++6/libgcc-s1 are not guaranteed in python:*-slim, so install them.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libstdc++6 libgcc-s1 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=nodebin /usr/local/bin/node /usr/local/bin/node

COPY mrs/apps/genblaze-media/app ./app

# package.json is required: it carries "type": "module" for the .js ESM sources.
# Its dependencies (canvas/commander/ws) are outside the render-still import
# graph and are deliberately not installed.
COPY mrs/packages/renderer-core/package.json ./renderer-core/package.json
COPY mrs/packages/renderer-core/src ./renderer-core/src
COPY mrs/packages/renderer-core/scripts ./renderer-core/scripts

# Engine3D soft-raster still CLI (CPU; no native WebGL required).
COPY --from=engine3d-build /build/package.json ./engine3d-core/package.json
COPY --from=engine3d-build /build/dist ./engine3d-core/dist
COPY --from=engine3d-build /build/scripts ./engine3d-core/scripts
COPY mrs/packages/engine3d-core/src ./engine3d-core/src

# Prompt→scene bridge (flattened /app layout; no Infinity / story_forge in image).
# Genblaze dual-layout resolve is Implementor-owned (prompt_scene_provider.py).
COPY mrs/adapters/prompt-scene-bridge/run_bridge.py ./prompt-scene-bridge/
COPY mrs/adapters/prompt-scene-bridge/mrs_map.py ./prompt-scene-bridge/
COPY mrs/adapters/prompt-scene-bridge/schemas ./prompt-scene-bridge/schemas

# StoryForge Runtime crossing (RenderRequest→RenderResult). No SF packages.
COPY mrs/adapters/storyforge-boundary/validate_request.py ./storyforge-boundary/
COPY mrs/adapters/storyforge-boundary/route.py ./storyforge-boundary/
COPY mrs/adapters/storyforge-boundary/execute.py ./storyforge-boundary/
COPY mrs/adapters/storyforge-boundary/paths.py ./storyforge-boundary/
COPY mrs/adapters/storyforge-boundary/run_pipeline.py ./storyforge-boundary/
COPY mrs/adapters/storyforge-boundary/smoke_pipeline.py ./storyforge-boundary/
COPY mrs/adapters/storyforge-boundary/demo_full_run.py ./storyforge-boundary/
COPY mrs/adapters/storyforge-boundary/run_print.py ./storyforge-boundary/
COPY mrs/adapters/storyforge-boundary/demo_digital_print.py ./storyforge-boundary/
COPY mrs/adapters/storyforge-boundary/printer ./storyforge-boundary/printer/
COPY mrs/adapters/storyforge-boundary/governance ./storyforge-boundary/governance/
COPY mrs/adapters/storyforge-boundary/CONTRACT_DIGITAL_PRINT.md ./storyforge-boundary/
COPY mrs/adapters/storyforge-boundary/schemas ./storyforge-boundary/schemas
COPY mrs/adapters/storyforge-boundary/fixtures ./storyforge-boundary/fixtures

# Proton raster pipeline (Node) for RenderRequest route=proton-raster.
COPY mrs/adapters/proton-raster-bridge/run_proton_pipeline.mjs ./proton-raster-bridge/
COPY mrs/adapters/proton-raster-bridge/mintCir.js ./proton-raster-bridge/
COPY mrs/adapters/proton-raster-bridge/resolveDualLayout.mjs ./proton-raster-bridge/
COPY mrs/adapters/proton-raster-bridge/package.json ./proton-raster-bridge/

# Face fixture GLBs (synthetic; not production anatomy).
# Optional operator overrides: do NOT COPY production GLBs into the image.
# Mount a volume at /operator-assets (or set OPERATOR_ASSETS_ROOT) with:
#   /operator-assets/human/HumanFaceRigged.glb
#   /operator-assets/human/HumanFaceNeutral.glb
# Runtime prefers OPERATOR_ASSETS_ROOT/human/*.glb over /app/assets/human fixtures.
COPY mrs/assets ./assets
# ENV OPERATOR_ASSETS_ROOT=/operator-assets

RUN node --version \
 && node /app/renderer-core/scripts/render-still.mjs \
      --prompt "docker build smoke" --seed 1 \
      --width 64 --height 64 --samples 1 --output /tmp/smoke.png > /dev/null \
 && rm -f /tmp/smoke.png

# Proton dual-layout smoke: flattened /app must resolve mintCir + proton index
# (not monorepo mrs/adapters|packages relatives). Default-off at runtime; build-only.
RUN node /app/proton-raster-bridge/run_proton_pipeline.mjs --demo \
      --width 32 --height 32 --output /tmp/proton-pipeline-smoke.png > /tmp/proton-pipeline-smoke.json \
 && node /app/renderer-core/scripts/render-proton-splat.mjs --demo \
      --width 32 --height 32 --output /tmp/proton-splat-smoke.png > /dev/null \
 && test -f /tmp/proton-pipeline-smoke.png \
 && test -f /tmp/proton-splat-smoke.png \
 && rm -f /tmp/proton-pipeline-smoke.png /tmp/proton-pipeline-smoke.json \
      /tmp/proton-pipeline-smoke.evidence.json \
      /tmp/proton-splat-smoke.png /tmp/proton-splat-smoke.evidence.json

# Scene-spec smoke: a tiny render-scene run exercises render-scene.mjs, its
# scene-spec import graph, capability validation, and the shared PNG encoder —
# so a broken scene-spec layer fails the build instead of a runtime 503/502.
RUN printf '%s' '{"schemaVersion":"1.0","kind":"SceneSpecification","id":"docker-scene-smoke","entities":[{"id":"e","geometry":{"kind":"surface","surfaceId":"tesseract"}}]}' > /tmp/scene-smoke.json \
 && node /app/renderer-core/scripts/render-scene.mjs -- \
      --spec /tmp/scene-smoke.json --width 32 --height 32 --samples 1 \
      --output /tmp/scene-smoke.png > /dev/null \
 && rm -f /tmp/scene-smoke.png /tmp/scene-smoke.json

# engine3d demo smoke (partial): proves math3d/bridge/EngineHost import graph.
# Runtime first-boot also runs this via docker-entrypoint.sh (marker /app/data/.engine3d-first-run).
RUN node /app/renderer-core/scripts/engine3d-demo.mjs 4 > /tmp/engine3d-smoke.json \
 && rm -f /tmp/engine3d-smoke.json

# Engine3D structure still smoke (demo portrait soft-raster).
RUN ENGINE3D_STILL=1 node /app/engine3d-core/scripts/render-engine3d-still.mjs \
      --engine3d-still --out-dir /tmp/e3d-still --width 64 --height 64 \
      --aov depth,normal > /tmp/e3d-still.json \
 && rm -rf /tmp/e3d-still /tmp/e3d-still.json

# Engine3D short cinematic sequence smoke (2 frames @ 4fps / 0.5s).
RUN ENGINE3D_SEQUENCE=1 node /app/engine3d-core/scripts/render-engine3d-sequence.mjs \
      --engine3d-sequence --out-dir /tmp/e3d-seq --width 48 --height 36 \
      --duration 0.5 --fps 4 > /tmp/e3d-seq.json \
 && rm -rf /tmp/e3d-seq /tmp/e3d-seq.json

# Prompt→scene bridge smoke (stub lane; Infinity not in image). Expand stays off by ENV.
RUN python /app/prompt-scene-bridge/run_bridge.py \
      --prompt "docker bridge smoke" --json > /tmp/prompt-scene-smoke.json \
 && rm -f /tmp/prompt-scene-smoke.json

# Expand smoke (opt-in CLI --expand; ENV stays 0). Asserts non-empty objects (~few s with dist).
# Operator check if skipped: PROMPT_SCENE_EXPAND_WORLD=1 python …/run_bridge.py --prompt x --json --expand
RUN python /app/prompt-scene-bridge/run_bridge.py \
      --prompt "docker expand smoke" --json --expand > /tmp/prompt-scene-expand-smoke.json \
 && python -c "import json; d=json.load(open('/tmp/prompt-scene-expand-smoke.json')); o=(d.get('engine3dWorldDocument') or {}).get('objects') or []; assert len(o)>0, 'expand smoke: objects empty'" \
 && rm -f /tmp/prompt-scene-expand-smoke.json

# RenderRequest boundary smoke (scene-spec → PNG). Opt-in execute for build proof.
RUN mkdir -p /app/data/output \
 && MRS_RENDER_REQUEST_EXECUTE=1 MRS_RENDER_OUTPUT_DIR=/tmp/sf-out \
      python /app/storyforge-boundary/run_pipeline.py \
      -r /app/storyforge-boundary/fixtures/sample-render-request-executable.json \
      --execute --out-dir /tmp/sf-out --result /tmp/sf-result.json \
 && python -c "import json; from pathlib import Path; d=json.load(open('/tmp/sf-result.json')); assert d.get('status')=='ok', d; arts=d.get('artifacts') or []; assert any(a.get('role')=='beauty-png' for a in arts), d" \
 && rm -rf /tmp/sf-out /tmp/sf-result.json

# Digital print dry-run smoke (sovereignty + evidence; no heavy spp).
RUN python /app/storyforge-boundary/run_print.py \
      -r /app/storyforge-boundary/fixtures/sample-render-request-cinematic-scene.json \
      --out-dir /tmp/print-smoke --dry-run \
 && python -c "import json; from pathlib import Path; e=json.loads(Path('/tmp/print-smoke/evidence.json').read_text()); assert e.get('printState')=='OK', e" \
 && rm -rf /tmp/print-smoke

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

RUN mkdir -p /app/data \
 && useradd --create-home --uid 10001 appuser \
 && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
