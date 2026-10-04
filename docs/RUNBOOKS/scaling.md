# Runbook: scaling

## What scales how

| Component      | Scaling axis                                     | Limit to watch                                                                     |
| -------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| API nodes      | Horizontal; stateless                            | Event loop lag, open sockets per node (~10k–30k per core is typical for Socket.IO) |
| MongoDB        | Vertical, then sharding by `conversationId`      | Write latency; working set vs RAM                                                  |
| Redis          | Vertical; one instance is the coordination point | Ops/s (each send ≈ 3 commands + lock), pub/sub fan-out bandwidth                   |
| Object storage | Managed                                          | –                                                                                  |

## Capacity numbers (single node, see docs/EVALUATION.md)

- ~400 messages/s with 10× fan-out (4,000 deliveries/s): p50 end-to-end 2 ms, p99 ≈ 110 ms.
- ~900 messages/s (9,000 deliveries/s) saturates one node on the reference hardware: delivery
  stays at 100% and ordering intact, latency rises to p50 ≈ 350 ms. Add nodes before this point.
- REST: ~13.5k req/s on `/health/live`, ~3.7k req/s on an authenticated list endpoint.

## Adding API nodes

1. Ensure `REDIS_URL` points at the shared Redis on every node (readiness reports it).
2. Scale the Deployment (`kubectl scale deploy/chatverse-api --replicas=N`) or let the HPA do it.
3. Nothing else changes: rooms, presence, sequencing and send ordering are coordinated in Redis.

Cost of the second node: one Redis pub/sub hop for cross-node deliveries and the distributed
send lock (two Redis commands per message). Measured two-node numbers are in the evaluation.

## When Redis becomes the bottleneck

- Move Socket.IO adapter traffic to a dedicated Redis: set `REDIS_ADAPTER_URL` on every node.
  `REDIS_URL` keeps the coordination keys (sequencing, locks, presence, rate limits) and the
  adapter's pub/sub fan-out moves to the second instance. Nodes log
  `socket.io adapter on dedicated redis` at startup when it is active.
- Use Redis Cluster for coordination keys; all keys are prefixed per conversation or user, so
  they hash well. The adapter supports sharded pub/sub (`@socket.io/redis-adapter` ≥ 8.3).

## When MongoDB becomes the bottleneck

- Reads: add secondaries; history and sync queries are index-only range scans on
  `{conversationId, seq}`.
- Writes: shard on `conversationId` (hashed). Every hot query carries it.
- Retention: set `MESSAGE_RETENTION_DAYS` to bound collection size, or archive by `createdAt`.

## Large groups

Fan-out cost is O(members) per message. Measured on one node at constant delivery throughput
(docs/EVALUATION.md §3.6): median latency is flat at 2–3 ms up to 50 members and rises to 16 ms
(p99 359 ms) at 200, because one hot conversation serialises all its sends through the ordered
section. Groups up to `LIMITS.GROUP_PARTICIPANTS_MAX` (512) are supported; for larger audiences
introduce a "broadcast" conversation kind that stores one copy and lets clients pull, instead
of pushing to every socket.

## Load testing

```bash
docker compose -f infra/docker/docker-compose.bench.yml up -d --wait
pnpm bench -- --scenario fanout --users 500 --groups 50 --rate 2 --duration 60
pnpm bench -- --scenario reconnect --connections 100 --outage 5000
pnpm --filter @chatverse/bench report
```

Compare against `bench/results/baseline-*.json` from the same commit range before concluding a
regression.
