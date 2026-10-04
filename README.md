<div align="center">

# ChatVerse

**An end-to-end encrypted, real-time messaging platform with ordered, idempotent delivery and reproducible benchmarks.**

[![CI](https://github.com/SatvikPraveen/ChatVerse/actions/workflows/ci.yml/badge.svg)](https://github.com/SatvikPraveen/ChatVerse/actions/workflows/ci.yml)
[![Security](https://github.com/SatvikPraveen/ChatVerse/actions/workflows/security.yml/badge.svg)](https://github.com/SatvikPraveen/ChatVerse/actions/workflows/security.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node 20](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](./.nvmrc)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](./tsconfig.base.json)
[![pnpm](https://img.shields.io/badge/pnpm-9-F69220?logo=pnpm&logoColor=white)](./package.json)

[Protocol](./docs/PROTOCOL.md) · [Architecture](./docs/ARCHITECTURE.md) · [Security model](./docs/SECURITY.md) · [Evaluation](./docs/EVALUATION.md) · [API](./docs/API_REFERENCE.md) · [ADRs](./docs/adr/README.md) · [Deployment](./docs/DEPLOYMENT.md)

</div>

---

ChatVerse is a reference implementation of a modern messenger built to be _studied_ as much as
used. Every guarantee it makes is written down in a protocol specification, enforced by a
database index or a cryptographic primitive, covered by a test, and measured by a benchmark
whose results are checked into the repository.

## What makes it different

| Property                                                          | How ChatVerse achieves it                                                                                                     | Where to look                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Exactly-once visible delivery** over an at-least-once transport | Client idempotency keys + a unique `(conversation, sender, clientMsgId)` index; retries return the original message           | [ADR 0003](./docs/adr/0003-client-idempotency-keys.md), `messages.service.ts`       |
| **Total order and gap detection** per conversation                | Dense server-assigned `seq` numbers (Redis `INCR`, Mongo fallback); clients resume with `sync:pull`                           | [ADR 0002](./docs/adr/0002-dense-sequence-numbers.md), `sequencer.ts`               |
| **Ordered fan-out across nodes**                                  | Per-conversation critical section: in-process queue + Redis lock around allocate → persist → emit                             | [Evaluation §4](./docs/EVALUATION.md), `distributedLock.ts`                         |
| **Causal timestamps across nodes**                                | Hybrid Logical Clocks (Kulkarni et al. 2014) with bounded drift, property-tested                                              | [ADR 0004](./docs/adr/0004-hybrid-logical-clock.md), `packages/protocol/src/hlc.ts` |
| **End-to-end encryption** the server cannot undo                  | X3DH + Double Ratchet for direct chats, Sender Keys for groups, on audited `@noble` primitives; keys live only in the browser | [Security model](./docs/SECURITY.md), `packages/crypto`                             |
| **O(participants) receipts**                                      | Delivered/read watermarks per participant instead of per-message read sets                                                    | [ADR 0005](./docs/adr/0005-receipt-watermarks.md)                                   |
| **Horizontal scalability**                                        | Stateless nodes; Redis for sequencing, presence, locks, rate limits and Socket.IO fan-out                                     | [ADR 0007](./docs/adr/0007-redis-presence-and-fanout.md)                            |
| **Reproducible performance claims**                               | A load generator that speaks the real protocol and records config, git SHA and machine with every run                         | [`bench/`](./bench/README.md), [Evaluation](./docs/EVALUATION.md)                   |

## Measured on this repository

Single API node, native Node 20 on a 10-core Apple M5, MongoDB 7 and Redis 7 in Docker,
load generator on the same machine (so absolute numbers are conservative):

| Scenario                                                                | Result                                                                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 200 users, 20 groups × 10, 2 msg/s each (400 msg/s, 4,000 deliveries/s) | **100.00 %** delivered, **0** duplicates, **0** ordering violations, end-to-end **p50 2 ms**, p95 6 ms, p99 109 ms |
| 500 users, 50 groups × 10 (≈ 900 msg/s, 9,000 deliveries/s)             | 100.00 % delivered, 0 duplicates, 0 ordering violations; node saturated (p50 349 ms)                               |
| 50 clients, half forcibly disconnected for 3 s under 5 msg/s            | **0 lost**, 0 duplicates, reconnect p50 34 ms, gap recovery p50 40 ms / p99 53 ms                                  |
| HTTP, 100 connections                                                   | `/health/live` 13.6k req/s (p99 17 ms); authenticated `/conversations` 3.7k req/s (p99 63 ms)                      |

The full methodology, the two-node cluster results, and the bottleneck analysis that led to the
ordered send section are in [docs/EVALUATION.md](./docs/EVALUATION.md). Raw result files are in
[`bench/results/`](./bench/results/).

## Repository layout

```
packages/protocol   wire contract: models, typed Socket.IO events, REST DTOs, zod schemas, errors, HLC
packages/crypto     X3DH, Double Ratchet, Sender Keys, envelopes, session persistence (browser + Node)
apps/api            Express + Socket.IO server: sequencing, idempotency, receipts, presence, keys, metrics
apps/web            React PWA: client-side E2EE, optimistic sends, gap-detecting sync, offline outbox
bench               load generator (fanout / http / reconnect scenarios) and report tooling
infra               Docker Compose (dev + two-node bench cluster), Kubernetes, Terraform, Prometheus/Grafana
docs                protocol spec, architecture, security model, evaluation, ADRs, API reference, runbooks
```

## Quick start

```bash
corepack enable                 # pnpm 9 is pinned in package.json
pnpm install
docker compose -f infra/docker/docker-compose.dev.yml up -d mongo redis
cp apps/api/.env.example apps/api/.env
pnpm --filter @chatverse/api seed      # alice / bob / carol, password "password123!"
pnpm dev                               # API http://localhost:4000, web http://localhost:5173
```

Open two browsers, log in as `alice@example.com` and `bob@example.com`, start a direct chat and
toggle "end-to-end encrypted" when creating it: the safety number in the info panel will match on
both sides, and the server's `lastMessage.text` stays `null`.

Everything else:

```bash
pnpm test            # protocol, crypto, api (mongodb-memory-server + ioredis-mock), web — no services needed
pnpm test:e2e        # Playwright: real browsers against the real API and web client (needs MongoDB)
pnpm lint && pnpm type-check && pnpm build
pnpm docker:dev      # full stack incl. MinIO, Prometheus, Grafana (:3002)
docker compose -f infra/docker/docker-compose.bench.yml up -d --wait   # two API nodes behind nginx
pnpm bench -- --scenario fanout --users 200 --groups 20 --rate 2 --duration 30
```

## How a message travels

```
composer ─► clientMsgId + optional E2EE ─► outbox (IndexedDB) ─► socket 'message:send'
                                                                      │
   server: rate limit ─► validate ─► membership & encryption policy ─► ordered section
                                                                      │  (per conversation)
                                               Redis INCR seq ─► Mongo insert (unique indexes) ─► emit to room
                                                                      │
   receivers: order by seq ─► detect gaps ─► sync:pull ─► decrypt ─► receipt:delivered / receipt:read
```

## Protocol at a glance

- REST under `/api/v1` plus one multiplexed Socket.IO connection; every mutating event is
  acknowledged with `{ ok, data | error }` and stable error codes.
- Short-lived access JWTs and rotating refresh tokens with family-wide revocation on reuse.
- Messages carry `seq` (dense per conversation), `clientMsgId` (idempotency), `hlc` (causal
  timestamp) and, for encrypted conversations, an opaque `{ suite, header, ciphertext }`.
- Presence is per device, aggregated per user, and only broadcast to users who share a
  conversation.

The normative description is [docs/PROTOCOL.md](./docs/PROTOCOL.md); the machine-readable
contract is [`packages/protocol`](./packages/protocol).

## Security in one paragraph

Passwords are hashed with scrypt; sessions use rotating refresh tokens with reuse detection;
every request and socket event is validated against shared zod schemas; rate limits are
enforced per IP, per user and per socket event. Encrypted conversations use the Signal protocol
family implemented in TypeScript on audited primitives: X3DH for asynchronous key agreement,
the Double Ratchet (forward secrecy and post-compromise security, tested) for pairwise sessions,
and Sender Keys for groups. The server stores only public keys and ciphertext. Limits, including
visible metadata and the single-device assumption of the web client, are stated in
[docs/SECURITY.md](./docs/SECURITY.md).

## Testing

| Suite               | Tests | Highlights                                                                                                                                            |
| ------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/protocol` | 13    | HLC monotonicity and causality as fast-check properties                                                                                               |
| `packages/crypto`   | 23    | reordering, loss, replay, tampering, persistence, post-compromise security, forged bundles                                                            |
| `apps/api`          | 47    | token rotation/reuse, idempotent resend, dense seq under 50 concurrent sends, realtime fan-out, rate limits, lock and queue primitives                |
| `apps/web`          | 25    | refresh-and-retry, gap detection, outbox, E2EE between simulated devices, optimistic store                                                            |
| `e2e` (Playwright)  | 4     | real browsers, server and crypto: auth, encrypted direct chat with matching safety numbers, encrypted group with removal, offline catch-up and outbox |

The unit and integration suites run without external services. The browser suite needs only a
MongoDB (`pnpm test:e2e`, see [e2e/README.md](./e2e/README.md)). CI runs lint, format check,
type check, tests with coverage, build, the browser suite and a Docker build on every push;
CodeQL and `pnpm audit` run in a separate workflow.

## Documentation map

|                                                  |                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| [docs/PROTOCOL.md](./docs/PROTOCOL.md)           | the wire protocol, normative                                        |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)   | components, send path, Redis coordination, data model               |
| [docs/SECURITY.md](./docs/SECURITY.md)           | threat model and cryptographic design with a property-to-test table |
| [docs/EVALUATION.md](./docs/EVALUATION.md)       | benchmark methodology, results, bottleneck analysis                 |
| [docs/adr/](./docs/adr/README.md)                | nine architecture decision records                                  |
| [docs/API_REFERENCE.md](./docs/API_REFERENCE.md) | every route and response shape                                      |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)       | local, Compose, Kubernetes, AWS                                     |
| [docs/RUNBOOKS/](./docs/RUNBOOKS/)               | incidents and scaling                                               |

## Citing

If this work is useful in research, please cite it using the metadata in
[`CITATION.cff`](./CITATION.cff).

## Contributing and license

See [CONTRIBUTING.md](./CONTRIBUTING.md). Security issues: [SECURITY.md](./SECURITY.md).
Released under the [MIT License](./LICENSE).

<div align="center">
<sub>Built and maintained by <a href="https://github.com/SatvikPraveen">Satvik Praveen</a>.</sub>
</div>
