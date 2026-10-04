#!/usr/bin/env bash
# Start the local dependencies (MongoDB, Redis, MinIO) in Docker and run the API and web app
# on the host with hot reload.
#
#   ./scripts/dev.sh            # deps + pnpm dev
#   ./scripts/dev.sh --deps     # deps only
#   ./scripts/dev.sh --down     # stop and remove the dependency containers

set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f infra/docker/docker-compose.dev.yml)
DEPS=(mongo redis minio minio-init)

if [[ "${1:-}" == "--down" ]]; then
  "${COMPOSE[@]}" down
  exit 0
fi

command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "docker daemon is not running" >&2; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm is required (corepack enable)" >&2; exit 1; }

[[ -f .env ]] || { cp .env.example .env; echo "created .env from .env.example"; }
[[ -f apps/api/.env ]] || { cp apps/api/.env.example apps/api/.env 2>/dev/null && echo "created apps/api/.env" || true; }
[[ -f apps/web/.env ]] || { cp apps/web/.env.example apps/web/.env 2>/dev/null && echo "created apps/web/.env" || true; }

echo "starting dependencies: ${DEPS[*]}"
"${COMPOSE[@]}" up -d --wait "${DEPS[@]}"

echo
echo "  MongoDB  mongodb://chatverse:chatverse123@localhost:27017/chatverse?authSource=admin"
echo "  Redis    redis://:chatverse123@localhost:6379/0"
echo "  MinIO    http://localhost:9001 (chatverse / chatverse123)"
echo

[[ "${1:-}" == "--deps" ]] && exit 0

pnpm install
exec pnpm dev
