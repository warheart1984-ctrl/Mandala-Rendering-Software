# governed-render — Docker runtime with ffmpeg baked in (movie encodes).
# Context = repo root (governed-render imports ../../mrs/packages/renderer-core).
# BuildKit: linux/amd64.

FROM node:22-slim

# ffmpeg for h264 movie encodes.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# governed-render package + the renderer-core sources it imports by relative path
# (including the convergence_verifier package shim that FMCE V12/RT4D require).
COPY governed-render ./governed-render
COPY mrs/packages/renderer-core/src ./mrs/packages/renderer-core/src
COPY mrs/packages/renderer-core/scripts ./mrs/packages/renderer-core/scripts
COPY mrs/packages/convergence_verifier ./mrs/packages/convergence_verifier

WORKDIR /app/governed-render

ENV NODE_ENV=production
ENV PORT=8080

# Zero npm deps: the render closure is pure Node + ffmpeg.
CMD ["node", "src/server.mjs"]
