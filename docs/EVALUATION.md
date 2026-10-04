# Evaluation

This document records how ChatVerse was measured, what the numbers are, what they revealed, and
how to reproduce them. Raw results live in [`bench/results/`](../bench/results/) as JSON files
that carry the full configuration, git SHA, Node version and machine description of each run;
[`bench/results/REPORT.md`](../bench/results/REPORT.md) is generated from them.

## 1. Questions

1. Does the protocol deliver its correctness guarantees under load: every message delivered
   exactly once, in sequence order, with no loss across disconnects?
2. What latency and throughput does one node sustain, and where is the bottleneck?
3. What does a second node cost, and does cross-node fan-out preserve the guarantees?

## 2. Method

### Harness

`bench/` is a TypeScript load generator that speaks the real protocol with `socket.io-client`
and the REST API. It is a black-box client: it has no access to server internals beyond
`GET /metrics`, which it scrapes before and after a run.

| Metric             | Definition                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| End-to-end latency | receiver wall clock at `message:new` − send timestamp embedded in the message text (sender and receivers share one process and clock) |
| Ack latency        | `message:send` emit → acknowledgement                                                                                                 |
| Delivery ratio     | delivered ÷ expected, where expected = Σ messages × group size (senders receive their own messages)                                   |
| Duplicate          | the same `clientMsgId` delivered twice to the same receiver                                                                           |
| Ordering violation | a receiver observes a `seq` not strictly greater than the previous `seq` it saw for that conversation                                 |
| Gap recovery       | after reconnect, time until a client holds every `seq` up to the server's `headSeq` via `GET …/messages?afterSeq=`                    |

Percentiles are nearest-rank over every sample (no sketches). Connections ramp up over 5 s with
jitter; senders are de-phased with a per-sender offset so the load is not a square wave; the
harness drains for up to 5 s after the last send before computing delivery.

### Scenarios

| Scenario              | Configuration                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `fanout` (baseline)   | 200 users, 20 groups × 10 members, every member sends 2 msg/s for 30 s → 400 msg/s, 4,000 deliveries/s       |
| `fanout` (saturation) | 500 users, 50 groups × 10, 2 msg/s for 30 s → target 1,000 msg/s, 10,000 deliveries/s                        |
| `http`                | autocannon, 100 connections, 15 s each against `/health/live` and the authenticated `/api/v1/conversations`  |
| `reconnect`           | 50 receivers, 5 msg/s flowing; 25 clients forcibly disconnected for 3 s, then reconnect and recover via sync |

### Environments

| Label    | Server                                                       | MongoDB / Redis   | Load generator |
| -------- | ------------------------------------------------------------ | ----------------- | -------------- |
| native-1 | one `node dist/index.js` process on the host                 | Docker containers | same host      |
| docker-1 | one API container (direct to node 1, bypassing the balancer) | Docker containers | same host      |
| docker-2 | two API containers behind nginx (`least_conn`), shared Redis | Docker containers | same host      |

Hardware: Apple M5, 10 cores, 24 GB, macOS; Node 20.20.0; MongoDB 7; Redis 7. Running the
generator on the same machine makes absolute numbers conservative (the generator competes for
CPU and parses 4,000–10,000 JSON frames per second) but keeps relative comparisons valid.

## 3. Results

### 3.1 Correctness under load

| Run                         | Delivered                                 | Duplicates | Ordering violations | Lost after recovery |
| --------------------------- | ----------------------------------------- | ---------- | ------------------- | ------------------- |
| fanout baseline, native-1   | 120,000 / 120,000 (100 %)                 | 0          | 0                   | –                   |
| fanout saturation, native-1 | 300,000 / 300,000 (100 %)                 | 0          | 0                   | –                   |
| fanout baseline, docker-1   | 120,000 / 120,000 (100 %)                 | 0          | 0                   | –                   |
| fanout baseline, docker-2   | 120,000 / 120,000 (100 %)                 | 0          | 0                   | –                   |
| reconnect, native-1         | 5,550 live + 400 via sync = 5,950 / 5,950 | 0          | 0                   | 0                   |

Every guarantee in `docs/PROTOCOL.md` held in every run of the final code. Section 4 describes
the two runs in which they did not hold before the send path was fixed.

### 3.2 Latency and throughput, single node

| Run                  | msg/s | deliveries/s | e2e p50 | p90    | p95    | p99      | p99.9    | ack p50 | ack p99  |
| -------------------- | ----- | ------------ | ------- | ------ | ------ | -------- | -------- | ------- | -------- |
| baseline, native-1   | 400   | 4,000        | 2 ms    | 4 ms   | 6 ms   | 109 ms   | 315 ms   | 2 ms    | 117 ms   |
| baseline, docker-1   | 400   | 4,000        | 2 ms    | 32 ms  | 61 ms  | 175 ms   | 295 ms   | 3 ms    | 190 ms   |
| saturation, native-1 | 888   | 8,879        | 349 ms  | 705 ms | 784 ms | 1,161 ms | 1,435 ms | 386 ms  | 1,263 ms |

At 400 msg/s the median message reaches all ten recipients in 2 ms; the server-side
`message_fanout_duration_seconds` histogram (allocate → insert → emit) puts p50 under 5 ms and
p99 under 50 ms, so the client-observed p99 tail is mostly MongoDB write latency on a virtualised
disk plus generator scheduling.

At the saturation point one process stops keeping up: senders fall behind their schedule (888
instead of 1,000 msg/s) and queueing dominates latency, while correctness is unaffected. Server
CPU averaged ~0.6 cores across the whole session with event-loop lag p99 at 14 ms, which points
at the per-send database round trips (membership load, insert, bookkeeping update) rather than
CPU as the limit. Horizontal scaling (3.4) and batching the bookkeeping write are the obvious
next steps.

### 3.3 HTTP

| Endpoint                                                | req/s  | p50   | p95   | p99   | errors |
| ------------------------------------------------------- | ------ | ----- | ----- | ----- | ------ |
| `GET /health/live`                                      | 13,564 | 6 ms  | 12 ms | 17 ms | 0      |
| `GET /api/v1/conversations` (JWT, DB read, cursor page) | 3,717  | 23 ms | 54 ms | 63 ms | 0      |

### 3.4 Reconnect and gap recovery

| Metric                                                   | p50   | p90   | p99   | max   |
| -------------------------------------------------------- | ----- | ----- | ----- | ----- |
| Reconnect time (socket re-established + `session:ready`) | 34 ms | 47 ms | 48 ms | 48 ms |
| Gap recovery (every missed `seq` fetched)                | 40 ms | 51 ms | 53 ms | 53 ms |

400 of 5,950 deliveries (the messages sent during the 3 s outages) were recovered through
`afterSeq` catch-up with zero loss and zero duplicates, which is the protocol working as
designed: dense sequence numbers make "what did I miss" a single range query.

### 3.5 Two nodes

| Run                           | Split (node 1 / node 2) | Delivered | Ordering violations | e2e p50 | p90    | p95    | p99    |
| ----------------------------- | ----------------------- | --------- | ------------------- | ------- | ------ | ------ | ------ |
| docker-1 (reference)          | 12,000 / –              | 100 %     | 0                   | 2 ms    | 32 ms  | 61 ms  | 175 ms |
| docker-2, before cluster lock | 5,940 / 6,060           | 100 %     | **3,960**           | 2 ms    | 161 ms | 291 ms | 461 ms |
| docker-2, with cluster lock   | 6,180 / 5,820           | 100 %     | **0**               | 3 ms    | 15 ms  | 85 ms  | 338 ms |

With the load spread almost evenly, every message crosses the Redis adapter to reach the
sockets on the other node. The median cost of that hop is about 1 ms. The cluster lock not only
removed all reordering but also improved the tail (p90 161 → 15 ms), because serialising a
conversation's sends across nodes prevents the two nodes from interleaving their MongoDB
inserts for the same hot conversation.

## 4. What the benchmark found and changed

The harness was built to exit non-zero on correctness failures, and it did so on the first run.

**Finding 1: emission order ≠ sequence order (single node).** The first fan-out run reported
13,550 ordering violations out of 120,000 deliveries. The sequencer assigned dense, correct
`seq` values, but allocation and broadcast were separate awaits: with ten senders in a group,
message 6 regularly finished its insert and was emitted before message 5. Fix: a per-conversation
in-process queue (`KeyedQueue`) around allocate → persist → emit. Violations dropped to 0 and,
because the redundant read-before-write for idempotency was removed at the same time, p50
latency fell from 115 ms to 80 ms.

**Finding 2: the harness itself was wrong.** The remaining 80 ms median was suspicious given
server-side histograms of ~5 ms. The senders' schedule was anchored to a shared start time, so
the intended random de-phasing was undone on the first tick and all 200 senders fired in
lockstep every 500 ms. With a per-sender phase offset the same server showed p50 2 ms. This is
why the methodology section insists on recording the harness version with every result.

**Finding 3: emission order ≠ sequence order (two nodes).** The in-process queue cannot order
sends that land on different nodes: 3,960 violations (3.3 %) in the first two-node run. Fix: a
Redis `SET NX PX` lock per conversation (`DistributedLock`) nested inside the local queue, used
only when nodes share a Redis. Violations dropped to 0 at a cost of two Redis commands per send.
The protocol text was updated to state exactly what clients may rely on (`PROTOCOL.md` §3.1).

## 5. Threats to validity

- The load generator shares the machine with the server, which inflates tail latencies and
  caps the achievable load; absolute numbers should be re-measured with the generator on a
  separate host before being quoted for capacity planning.
- MongoDB and Redis run in Docker Desktop on macOS; disk and network virtualisation add
  latency that a Linux host would not.
- Each configuration was run once after a warm-up run; the methodology recommends three runs
  and medians for publication-quality numbers.
- Group size is fixed at 10. Fan-out cost grows linearly with group size; larger groups were
  not measured.
- Encrypted conversations were not benchmarked separately. The server treats ciphertext as an
  opaque string of similar size, so throughput is expected to be unchanged; client-side
  ratchet cost is not covered here.

## 6. Reproducing

```bash
# single node, native
docker run -d --rm --name mongo -p 27017:27017 mongo:7
docker run -d --rm --name redis -p 6379:6379 redis:7-alpine
pnpm --filter @chatverse/api build
NODE_ENV=production MONGODB_URI=mongodb://localhost:27017/chatverse_bench REDIS_URL=redis://localhost:6379 \
JWT_ACCESS_SECRET=$(openssl rand -hex 32) JWT_REFRESH_SECRET=$(openssl rand -hex 32) \
RATE_LIMIT_MAX=1000000 AUTH_RATE_LIMIT_MAX=1000000 LOG_LEVEL=warn node apps/api/dist/index.js &

pnpm bench -- --scenario fanout --users 200 --groups 20 --group-size 10 --rate 2 --duration 30
pnpm bench -- --scenario fanout --users 500 --groups 50 --group-size 10 --rate 2 --duration 30
pnpm bench -- --scenario http --connections 100 --duration 15
pnpm bench -- --scenario reconnect --connections 50 --rate 5 --duration 30 --outage 3000

# two nodes behind nginx with a shared Redis
docker compose -f infra/docker/docker-compose.bench.yml up -d --build --wait
pnpm bench -- --scenario fanout --users 200 --groups 20 --group-size 10 --rate 2 --duration 30 --url http://localhost:4000
pnpm bench -- --scenario fanout --users 200 --groups 20 --group-size 10 --rate 2 --duration 30 --url http://localhost:4001   # node 1 only

pnpm --filter @chatverse/bench report   # bench/results/REPORT.md
```

The harness exits with code 2 if delivery drops below 99.9 %, if any ordering violation occurs,
or if any message is lost after recovery, so these commands double as a protocol conformance
test for any server implementation.
