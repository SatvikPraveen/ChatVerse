# ADR 0002: Dense per-conversation sequence numbers

**Status:** Accepted · **Date:** 2026-10-03

## Context

Clients need to (a) display messages in a consistent order on every device, (b) detect that
they missed messages after a disconnect, and (c) resume synchronisation cheaply. Timestamps
cannot do this: two servers may assign the same millisecond, and a client cannot tell from
timestamps alone whether something is missing.

## Decision

Each conversation has a server-assigned, dense, monotonically increasing `seq`. The server keeps
`headSeq` on the conversation. `seq` is allocated with Redis `INCR` (seeded from the database on
a cold cache) and falls back to an atomic `$inc` on the conversation document when Redis is
unavailable.

## Alternatives considered

- **Timestamps only.** No gap detection, ties, clock skew.
- **ObjectId ordering.** Monotonic per process only, not dense, not comparable across nodes.
- **Global sequence (single counter).** Needless contention; ordering across conversations is
  provided by the HLC instead (ADR 0004).
- **Database-only `$inc`.** Correct but puts a write on the hot path of every message; Redis
  `INCR` is an order of magnitude cheaper and the fallback keeps correctness when Redis is down.

## Consequences

- Gap detection is `received.seq > known + 1`; recovery is `sync:pull { afterSeq: known }`.
- Unread counts are a subtraction, not a count query.
- Deletions must tombstone rather than remove, to keep the sequence dense.
- Allocating `seq` before the insert means a crash between the two leaves a hole. The
  reference implementation treats a hole older than a few seconds as a tombstone during sync.
- Allocation and broadcast are separate steps, so concurrent sends can be _emitted_ out of
  `seq` order even though `seq` itself is correct. The first benchmark run measured this at
  11% of deliveries on one node and 3% across two nodes. The send path therefore runs
  "allocate → persist → emit" inside a per-conversation critical section: a `KeyedQueue` on
  each node plus a Redis `SET NX PX` lock when nodes share a Redis. Both measurements dropped
  to zero (see `docs/EVALUATION.md`). Clients still order by `seq`, so a lost lock degrades
  only latency, never correctness.
