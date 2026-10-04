# ADR 0007: Redis for presence, sequencing and cross-node fan-out

**Status:** Accepted · **Date:** 2026-10-03

## Context

Running more than one API node requires (a) a message emitted on node A to reach sockets on
node B, (b) presence that reflects every node, and (c) sequence allocation that is atomic
across nodes.

## Decision

Redis is the coordination layer:

* `@socket.io/redis-adapter` propagates room emits and `socketsJoin`/`socketsLeave` across
  nodes.
* Presence is a set of socket ids per user plus a per-socket heartbeat key with TTL, so a node
  crash cannot leave ghosts online.
* Sequence allocation is `INCR` on a per-conversation key (ADR 0002).
* HTTP and socket rate limiters use Redis counters so limits are global, not per node.

Every use has an in-process fallback (used in tests and single-node development) that preserves
semantics on one node.

## Alternatives considered

* **Sticky sessions only.** Users with two devices on different nodes would not see each other.
* **NATS / Kafka.** Heavier operational footprint; Redis already needed for presence.
* **Database polling.** Latency and load scale badly.

## Consequences

* Redis is a hard dependency for multi-node deployments; the readiness probe reports it.
* Fan-out latency includes one Redis pub/sub hop between nodes; measured in `bench/`.
