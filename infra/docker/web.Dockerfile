# syntax=docker/dockerfile:1.7
# ChatVerse web image: Vite static build served by nginx, which also proxies /api and
# /socket.io to the API service. Build from the repository root:
#   docker build -f infra/docker/web.Dockerfile -t chatverse-web .

FROM node:20-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/protocol/package.json packages/protocol/
COPY packages/crypto/package.json packages/crypto/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY bench/package.json bench/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/web ./apps/web
# The browser talks to the same origin; nginx forwards /api and /socket.io.
ARG VITE_API_URL=
ARG VITE_VAPID_PUBLIC_KEY=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
RUN pnpm --filter @chatverse/web build

FROM nginx:1.27-alpine AS runtime
# Upstream host for the API; override with --build-arg or by editing nginx.conf at runtime.
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
