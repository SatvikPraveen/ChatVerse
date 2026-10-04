# syntax=docker/dockerfile:1.7
# ChatVerse API image. Build from the repository root:
#   docker build -f infra/docker/api.Dockerfile -t chatverse-api .

# ---------------------------------------------------------------------------
# 1. Install the full workspace (dev deps included) and build the API bundle.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /repo

# Copy manifests first so dependency installation is cached across source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/protocol/package.json packages/protocol/
COPY packages/crypto/package.json packages/crypto/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY bench/package.json bench/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @chatverse/api build

# `pnpm deploy` writes an isolated copy of the API with only its production dependencies,
# which keeps the runtime image free of the workspace, TypeScript and test tooling.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @chatverse/api deploy --prod /out && cp -r apps/api/dist /out/dist

# ---------------------------------------------------------------------------
# 2. Minimal runtime image.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0
WORKDIR /app

# tini reaps zombies and forwards signals so graceful shutdown works under docker/k8s.
RUN apk add --no-cache tini wget \
 && addgroup -S chatverse && adduser -S -G chatverse chatverse

COPY --from=build --chown=chatverse:chatverse /out/package.json ./package.json
COPY --from=build --chown=chatverse:chatverse /out/node_modules ./node_modules
COPY --from=build --chown=chatverse:chatverse /out/dist ./dist

USER chatverse
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health/live" || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
