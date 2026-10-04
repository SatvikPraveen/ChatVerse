# ChatVerse benchmark harness

Reproducible load tests that treat the server as a black box speaking `@chatverse/protocol`.
Every run records its full configuration, git SHA, Node version and machine so results can be
compared across commits and hardware.

## Scenarios

| scenario    | what it measures                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `fanout`    | End-to-end delivery latency and throughput of group messaging; delivery ratio, duplicates, ordering |
| `http`      | REST throughput and latency for an unauthenticated and an authenticated endpoint (autocannon)       |
| `reconnect` | Reconnect time and gap-recovery time of clients that drop mid-stream; loss across live + sync       |

### Definitions

- **End-to-end latency**: wall clock on the receiver when `message:new` arrives minus the send
  timestamp embedded in the message text. Senders and receivers run in the same process, so no
  clock synchronisation is needed.
- **Ack latency**: `message:send` emit → acknowledgement. Covers validation, sequencing,
  persistence and the start of fan-out.
- **Delivery ratio**: delivered / expected, where expected = Σ over senders of
  messages × group size (senders receive their own messages too).
- **Ordering violation**: a receiver sees a `seq` that is not strictly greater than the previous
  `seq` it saw for that conversation. The protocol guarantees zero.
- **Duplicate**: the same `clientMsgId` delivered twice to the same receiver. Zero expected.
- **Gap recovery**: after `session:ready` on reconnect, time until the client holds every `seq`
  up to the server's `headSeq`, using `GET /conversations/:id/messages?afterSeq=`.

Percentiles are nearest-rank over all samples (no sketching), so p99.9 is exact.

## Running

Start a server (for example `pnpm docker:dev`, or `docker compose -f infra/docker/docker-compose.bench.yml up`
for a two-node cluster behind nginx), then:

```bash
# 200 users, 20 groups of 10, 2 msg/s per member for 30 s
pnpm bench -- --scenario fanout --users 200 --groups 20 --group-size 10 --rate 2 --duration 30 --url http://localhost:4000

# REST
pnpm bench -- --scenario http --connections 100 --duration 15

# 50 receivers, half of them drop for 3 s while 5 msg/s flow
pnpm bench -- --scenario reconnect --connections 50 --rate 5 --duration 30 --outage 3000

# Verify the harness itself without a server
pnpm bench -- --scenario fanout --dry-run --no-out

# Collate results/*.json into results/REPORT.md
pnpm --filter @chatverse/bench report
```

Results land in `bench/results/<timestamp>-<scenario>.json`. The process exits with code 2 when
a correctness invariant is violated (delivery < 99.9 %, any ordering violation, any loss after
recovery), which lets CI gate on protocol guarantees rather than only on speed.

## Methodology notes

1. **Warm-up**: run each scenario once and discard it; JIT, connection pools and indexes warm up.
2. **Repeat**: at least 3 runs per configuration; report medians of the percentiles.
3. **Isolation**: run the client on a different machine (or at least pin the server to separate
   cores) for absolute numbers. Same-machine runs are fine for relative comparisons across commits.
4. **Ramp-up**: connections are spread over `--ramp` ms with jitter to avoid measuring a thundering
   herd that a real deployment would not see.
5. **Drain**: after the last send the harness waits up to 5 s for in-flight deliveries before
   computing the delivery ratio.
6. **Server metrics**: `/metrics` is scraped before and after `fanout` and stored in the result for
   correlating client-side latency with server-side histograms.

Bench users are registered as `bench_<runId>_<n>@bench.local`; point the harness at a disposable
database.
