# @mrs/rt4d-engine — deterministic RT4D render service
#
# Build from the mrs/ monorepo root (workspace:* @mrs/renderer-core):
#   docker build -f apps/rt4d-engine/Dockerfile -t mrs-rt4d-engine .
#
# Building with context=apps/rt4d-engine alone will fail (no workspace packages).
# Status: partial — image build validated locally; ECS deploy not claimed.

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

# ---- deps + app ----
FROM base AS builder
WORKDIR /mrs

# Native canvas (renderer-core) needs build toolchain + Cairo stack on Alpine/musl.
RUN apk add --no-cache \
  tini \
  python3 \
  make \
  g++ \
  pkgconfig \
  pixman-dev \
  cairo-dev \
  pango-dev \
  jpeg-dev \
  giflib-dev \
  pangomm-dev \
  libjpeg-turbo-dev \
  freetype-dev

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/renderer-core/package.json ./packages/renderer-core/
COPY apps/rt4d-engine/package.json ./apps/rt4d-engine/

RUN pnpm install --filter @mrs/rt4d-engine... --frozen-lockfile

COPY packages/renderer-core ./packages/renderer-core
COPY apps/rt4d-engine ./apps/rt4d-engine

# ---- runtime ----
FROM base AS runtime
WORKDIR /mrs

# Runtime libs for node-canvas + tini for PID1
RUN apk add --no-cache \
  tini \
  cairo \
  pango \
  jpeg \
  giflib \
  pixman \
  freetype \
  libjpeg-turbo \
  || (echo "WARN: partial runtime apk; tini fallback" && printf '#!/bin/sh\nexec "$@"\n' > /sbin/tini && chmod +x /sbin/tini)

COPY --from=builder /mrs /mrs

WORKDIR /mrs/apps/rt4d-engine

RUN addgroup -g 1001 -S rt4d && adduser -S -G rt4d -u 1001 rt4d \
  && chown -R rt4d:rt4d /mrs
USER rt4d

ENV RT4D_ENGINE_PORT=8020
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.RT4D_ENGINE_PORT||8020)+'/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

EXPOSE 8020

# Engine tsconfig is noEmit; run via tsx (devDependency present from filtered install).
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "exec", "tsx", "src/index.ts"]

LABEL org.opencontainers.image.title="@mrs/rt4d-engine"
LABEL org.opencontainers.image.description="Deterministic RT4D dimensional preview render service"
LABEL org.opencontainers.image.version="0.2.0"
LABEL org.opencontainers.image.source="https://github.com/warheart1984-ctrl/Mandala-Rendering-System-MRS-"
