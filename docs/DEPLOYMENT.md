# Deployment

## Local development

```bash
corepack enable && pnpm install
cp .env.example .env                                   # or apps/api/.env.example → apps/api/.env
docker compose -f infra/docker/docker-compose.dev.yml up -d mongo redis   # minio optional
pnpm --filter @chatverse/api seed                      # alice / bob / carol, password "password123!"
pnpm dev                                               # API :4000, web :5173 (proxies /api and /socket.io)
```

`scripts/dev.sh` wraps the same steps (`--deps` starts only the containers, `--down` stops them).
Without `REDIS_URL` the API runs single-node with an in-process Redis emulator; this is fine for
development and is what the test suite uses.

## Full stack with Docker Compose

`infra/docker/docker-compose.dev.yml` starts everything:

| Service         | Port        | Purpose                                                                   |
| --------------- | ----------- | ------------------------------------------------------------------------- |
| `api`           | 4000        | Server (built from `infra/docker/api.Dockerfile`)                         |
| `web`           | 8080        | nginx serving the Vite build, proxying `/api` and `/socket.io` to the API |
| `mongo`         | 27017       | MongoDB 7                                                                 |
| `redis`         | 6379        | Redis 7 with AOF                                                          |
| `minio`         | 9000 / 9001 | S3-compatible object storage; `minio-init` creates the bucket             |
| `prometheus`    | 9090        | Scrapes `api:/metrics`                                                    |
| `grafana`       | 3002        | Provisioned datasource + "ChatVerse API" dashboard                        |
| `mongo-express` | 8081        | Only with `--profile tools`                                               |

```bash
pnpm docker:dev        # docker compose -f infra/docker/docker-compose.dev.yml up --build
pnpm docker:down
```

### Two-node cluster (benchmarks)

`infra/docker/docker-compose.bench.yml` runs `api-1` and `api-2` behind an nginx load balancer on
`:4000` (nodes also exposed on `:4001` / `:4002`) with a shared Redis, which exercises cross-node
fan-out through the Socket.IO Redis adapter and the distributed send lock. See `bench/README.md`.

## Container images

- `infra/docker/api.Dockerfile`: multi-stage; installs with a frozen lockfile, builds the tsup
  bundle, then `pnpm deploy --prod` produces a runtime layer with production dependencies only.
  Runs as a non-root user under `tini` with a `HEALTHCHECK` on `/health/live`.
- `infra/docker/web.Dockerfile`: Vite build served by `nginx:alpine` with SPA fallback, gzip,
  long-lived asset caching and the API/WebSocket reverse proxy (`infra/docker/nginx.conf`).

Tagged releases (`v*`) build multi-architecture images and push them to
`ghcr.io/satvikpraveen/chatverse-api` and `ghcr.io/satvikpraveen/chatverse-web`
(`.github/workflows/release.yml`).

## Kubernetes

Manifests in `infra/k8s/` (apply in numeric order; see its README):

- `20-api.yaml`: 2 replicas, startup/liveness/readiness probes on `/health/*`, resource
  requests/limits, pod anti-affinity, restricted security context, a `Service` with
  `ClientIP` session affinity and a `PodDisruptionBudget`.
- `40-ingress.yaml`: ingress-nginx with WebSocket-friendly timeouts and cookie affinity, which
  the long-polling fallback needs; WebSocket-only clients do not.
- `50-hpa.yaml`: CPU-based autoscaling with a commented example for scaling on
  `socket_connections`.

Every pod derives `NODE_ID` from its pod name; nodes never need to know about each other because
Redis carries sequencing, presence, locks and fan-out.

## AWS (Terraform skeleton)

`infra/terraform/aws/` describes a VPC, DocumentDB (MongoDB-compatible), ElastiCache Redis with
TLS, an S3 bucket for attachments, and ECS Fargate services behind an ALB with sticky sessions
and a 3600 s idle timeout for WebSockets. It is a starting point, not a turnkey production
module: review instance sizes, backup policies and IAM before use.

## Configuration

All variables are documented in `apps/api/.env.example` and `apps/web/.env.example`. The
important ones for production:

| Variable                                  | Notes                                                             |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `MONGODB_URI`, `REDIS_URL`                | Required; Redis must be shared by all nodes                       |
| `REDIS_ADAPTER_URL`                       | Optional; a second Redis that carries only Socket.IO fan-out      |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | ≥ 32 random characters each, distinct                             |
| `CORS_ORIGINS`                            | Comma-separated browser origins                                   |
| `TRUST_PROXY`                             | `true` behind a load balancer so rate limits key on the client IP |
| `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`   | Per-minute budgets; keep the auth budget small                    |
| `S3_*`                                    | Optional; attachments disabled when unset                         |
| `VAPID_*`                                 | Optional; web push disabled when unset                            |
| `MESSAGE_RETENTION_DAYS`                  | `0` keeps messages forever; otherwise a TTL index is created      |
| `METRICS_ENABLED`                         | Expose `/metrics`; restrict it at the ingress                     |

## Operational checklist

1. `GET /health/ready` must return 200 on every node before it receives traffic.
2. Scrape `/metrics`; alert on `nodejs_eventloop_lag_p99_seconds`, 5xx rate, and the
   `message_fanout_duration_seconds` p99.
3. Back up MongoDB; Redis data is reconstructible (counters re-seed from MongoDB, presence and
   rate-limit windows are transient, refresh sessions simply force a re-login).
4. Rotate JWT secrets by deploying with both old and new values only if you extend
   `services/tokens.ts` to accept a secondary key; otherwise rotation invalidates all sessions.
5. Keep the `CI` and `Security` workflows green; CodeQL and `pnpm audit` run on every push.
