# Lean multi-stage image for @mrs/engine3d-core
# Headless null renderer — no X11/GL/Dawn packages required.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
COPY demo ./demo
RUN npm run build
RUN npm run test:engine3d

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# demo script already compiled under dist/demo
CMD ["node", "dist/demo/demo-engine3d.js"]
