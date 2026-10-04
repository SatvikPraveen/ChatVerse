# Architecture

ChatVerse is a pnpm monorepo with two applications, three shared packages and a benchmark
harness. The server is a stateless Node process that can be scaled horizontally behind a load
balancer; MongoDB holds durable state and Redis coordinates the nodes.

```
                 ┌──────────────────────────────── browsers ────────────────────────────────┐
                 │  apps/web (React PWA)                                                     │
                 │  @chatverse/crypto: keys & ratchets in IndexedDB · outbox · sync · stores │
                 └───────────────┬───────────────────────────────────┬──────────────────────┘
                     REST /api/v1 (HTTPS)                     Socket.IO (WebSocket)
                                 │                                   │
                 ┌───────────────▼───────────────────────────────────▼──────────────────────┐
   ingress /     │  apps/api  node 1 ─┐   ┌─ node 2 ─┐   ┌─ node N                          │
   load balancer │  http/  (Express)  │   │          │   │   gateway (Socket.IO)             │
                 │  services/ ◄───────┴───┴──────────┴───┴── realtime handlers              │
                 └──────┬──────────────────────────┬───────────────────────────┬────────────┘
                        │                          │                           │
                 ┌──────▼──────┐          ┌────────▼────────┐          ┌───────▼────────┐
                 │  MongoDB    │          │  Redis           │          │  S3 / MinIO    │
                 │  users,     │          │  seq counters,   │          │  attachments   │
                 │  convs,     │          │  presence, locks,│          │  (presigned)   │
                 │  messages,  │          │  rate limits,    │          └────────────────┘
                 │  keys       │          │  socket.io pub/sub│
                 └─────────────┘          └─────────────────┘
```

## Workspace layout

| Path                     | Package                    | Role                                                                                 |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------------ |
| `packages/protocol`      | `@chatverse/protocol`      | Wire contract: models, typed socket events, REST DTOs, zod schemas, error codes, HLC |
| `packages/crypto`        | `@chatverse/crypto`        | X3DH, Double Ratchet, Sender Keys, envelopes, session persistence                    |
| `packages/eslint-config` | `@chatverse/eslint-config` | Shared lint rules                                                                    |
| `apps/api`               | `@chatverse/api`           | Reference server                                                                     |
| `apps/web`               | `@chatverse/web`           | Reference client                                                                     |
| `bench`                  | `@chatverse/bench`         | Load generator and report tooling                                                    |
| `infra`                  | –                          | Docker Compose, Kubernetes, Terraform, Prometheus/Grafana                            |
| `docs`                   | –                          | Protocol, security, ADRs, evaluation, deployment, runbooks                           |

Packages ship TypeScript source; the API bundles them with tsup and the web client with Vite.

## Server (`apps/api/src`)

```
config/env.ts            zod-validated environment, fails fast with every problem listed
deps.ts                  dependency container: env, logger, mongo, redis, hub, clock, metrics
server.ts / index.ts     startServer() shared by production and tests; bootstrap + graceful shutdown
infra/                   logger (pino), mongo (mongoose), redis (ioredis or in-process emulator), metrics (prom-client)
lib/                     errors, ids, cursors, HLC instance, KeyedQueue, DistributedLock
domain/models/           User, Conversation, Message, Attachment, DeviceKeys, PushSubscription
services/                auth, users, conversations, sequencer, messages, receipts, presence, keys, push, uploads
http/                    Express app, middleware (requestId, auth, validate, rateLimit, errorHandler), routes
realtime/                Socket.IO gateway, hub (room fan-out), per-event rate limiter, validated handlers
tests/                   vitest suites on mongodb-memory-server + ioredis-mock
```

### Request path for a message send

```
socket 'message:send' ──► rateLimiter (token bucket per event)
                      ──► validate (messageSendSchema)
                      ──► messages.send()
                            ├─ load conversation, check membership & encryption policy
                            ├─ resolve attachments / replyTo
                            ├─ ordered section (per conversation):
                            │     KeyedQueue (this node) → DistributedLock (cluster, if Redis is shared)
                            │     ├─ sequencer.next()  → Redis INCR (seeded from Mongo, 1 round trip)
                            │     ├─ MessageModel.create()  (unique {conv,seq}, {conv,sender,clientMsgId})
                            │     │     duplicate clientMsgId → return original message (idempotent retry)
                            │     └─ hub.toConversation('message:new')  → local sockets + Redis adapter
                            ├─ Conversation.updateOne($max headSeq, lastMessage)
                            └─ push.notifyNewMessage() (fire and forget, offline participants only)
                      ──► ack { ok: true, data: { message } }
```

The ordered section is what guarantees that broadcasts leave in `seq` order; everything that does
not affect ordering happens outside it. See ADR 0002 and `docs/EVALUATION.md` for measurements with
and without the cluster lock.

### Coordination through Redis

| Concern          | Keys                                                                                  | Notes                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Sequence numbers | `conv:{id}:seq`                                                                       | `INCR`; seeded with `SET NX` from `Conversation.headSeq`; Mongo `$inc` fallback               |
| Send ordering    | `lock:conv:{id}`                                                                      | `SET NX PX` + Lua compare-and-delete; only when Redis is shared                               |
| Presence         | `presence:{uid}` hash, `presence:{uid}:sockets`, `presence:{uid}:hb:{sid}` (TTL 45 s) | A user is online while any heartbeat key exists                                               |
| Rate limits      | `rl:{scope}:{id}:{window}`                                                            | Fixed window; memory fallback                                                                 |
| Refresh sessions | `sess:*`                                                                              | Token family with rotation and reuse detection                                                |
| Fan-out          | Socket.IO adapter channels                                                            | `io.in(room).emit`, `socketsJoin/Leave` across nodes; dedicated Redis via `REDIS_ADAPTER_URL` |

When `REDIS_URL` is unset in development or test the same code runs against an in-process
emulator (`ioredis-mock`); production refuses to start without a real Redis.

### Data model (MongoDB)

| Collection          | Key indexes                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `users`             | `username` unique, `email` unique, text on username/displayName                                                               |
| `conversations`     | `participants.userId`, `updatedAt`, `directKey` unique sparse                                                                 |
| `messages`          | `{conversationId, seq}` unique, `{conversationId, senderId, clientMsgId}` unique, text on `text`, optional TTL on `createdAt` |
| `devicekeys`        | `{userId, deviceId}` unique, `lastActiveAt`                                                                                   |
| `attachments`       | `ownerId`, `status`                                                                                                           |
| `pushsubscriptions` | `userId`, `endpoint` unique                                                                                                   |

## Client (`apps/web/src`)

```
lib/api.ts, endpoints.ts      typed fetch with envelope unwrapping and refresh-and-retry
lib/socket.ts, realtime.ts    typed Socket.IO client; server events → stores
lib/sync.ts                   Synchronizer: highest contiguous seq per conversation, gap → sync:pull, reconnect resume
lib/outbox.ts                 IndexedDB outbox: in-order per conversation, idempotent on clientMsgId, backoff
lib/messaging.ts              ingest / decrypt / send / edit / delete / react / typing
lib/receipts.ts               delivered (debounced to max seq) and read (visible + focused) watermarks
lib/crypto/keystore.ts        DeviceKeyStore persistence (private keys never leave IndexedDB)
lib/crypto/e2ee.ts            PairwiseSession per peer, Sender Keys per group, control messages, plaintext cache
stores/                       zustand: auth, conversations, messages (optimistic pending entries), presence, typing, users, ui
components/, pages/           chat UI, settings, auth pages
sw.ts                         service worker: push notifications, offline shell
```

### Message lifecycle on the client

1. The composer creates a `clientMsgId`, encrypts if the conversation is encrypted, and appends
   an optimistic pending entry.
2. The outbox persists the send and flushes it over the socket; retries reuse the same
   `clientMsgId`, so a lost ack can never duplicate a message.
3. The ack (or the `message:new` broadcast, whichever arrives first) replaces the pending entry
   by `clientMsgId`.
4. Every received message updates the contiguous-seq watermark; a gap triggers `sync:pull`.
5. `receipt:delivered` is emitted for the highest received seq; `receipt:read` when the
   conversation is visible.

## Observability

- `GET /metrics`: `http_request_duration_seconds`, `socket_event_duration_seconds` (by event and
  outcome), `message_fanout_duration_seconds`, `messages_sent_total`, `socket_connections`,
  plus Node process metrics. All labelled with `node`.
- Structured JSON logs (pino) with request ids; `pino-pretty` in development.
- `GET /health/live` (process up) and `GET /health/ready` (MongoDB + Redis with latency).
- Grafana dashboard provisioned in `infra/docker/grafana`.

## Testing strategy

| Layer    | Tool                                                      | What is covered                                                                                                                                                                           |
| -------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| protocol | vitest + fast-check                                       | schema edge cases; HLC monotonicity and causality properties                                                                                                                              |
| crypto   | vitest + fast-check                                       | ratchet round trips, reordering/loss, replay, tampering, persistence, post-compromise security, X3DH bundle verification, sender keys                                                     |
| api      | vitest + supertest + mongodb-memory-server + ioredis-mock | auth rotation/reuse, conversations, idempotent sends, dense seq under concurrency, history/sync, receipts, keys, realtime fan-out, rate limits, health/metrics, queue and lock primitives |
| web      | vitest + jsdom                                            | api refresh/retry, sync gap detection, outbox, E2EE between simulated devices, message store, page smoke test                                                                             |
| system   | bench                                                     | delivery ratio, duplicates, ordering, latency percentiles, gap recovery, two-node fan-out                                                                                                 |
