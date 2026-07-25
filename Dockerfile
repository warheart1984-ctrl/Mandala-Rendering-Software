# Default Dockerfile for Render (hackathon App URL).
# Builds Genblaze media: prompt → FLUX → B2, plus the RT4D renderer backend.
#
# Build context MUST be the repo root: the RT4D backend needs
# mrs/packages/renderer-core, which is outside mrs/apps/genblaze-media.
# The app-local Dockerfile cannot bundle it.

# Node is pinned to bookworm so the copied binary links against a glibc no
# newer than the Python base image's.
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
    RT4D_SCRIPT_PATH=/app/renderer-core/scripts/render-still.mjs

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

RUN node --version \
 && node /app/renderer-core/scripts/render-still.mjs \
      --prompt "docker build smoke" --seed 1 \
      --width 64 --height 64 --samples 1 --output /tmp/smoke.png > /dev/null \
 && rm -f /tmp/smoke.png

RUN mkdir -p /app/data \
 && useradd --create-home --uid 10001 appuser \
 && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
