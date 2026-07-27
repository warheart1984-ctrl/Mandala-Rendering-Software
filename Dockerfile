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
    ENGINE3D_SEQUENCE_ENABLED=1

# genblaze-core 0.3.7 declares pillow<12; overlay Pillow 12.3.0 for CVE fixes
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

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

RUN mkdir -p /app/data \
 && useradd --create-home --uid 10001 appuser \
 && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
