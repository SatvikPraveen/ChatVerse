# ADR 0004: Hybrid logical clocks for cross-node causal timestamps

**Status:** Accepted · **Date:** 2026-10-03

## Context

Per-conversation sequence numbers (ADR 0002) order messages *within* a conversation. Views that
span conversations (search results, notification feeds, "recent activity") need an order that is
consistent across server nodes whose wall clocks are not perfectly synchronised, and that never
places a reply before the message it replies to.

## Decision

Every message is stamped with a Hybrid Logical Clock timestamp (Kulkarni, Demirbas, Madappa,
Avva, Leone: *Logical Physical Clocks and Consistent Snapshots in Globally Distributed
Databases*, OPODIS 2014). Each server node runs one clock; the encoded timestamp
(`wallMs-counter-nodeId`, fixed width hex) is lexicographically ordered.

## Alternatives considered

* **NTP-disciplined wall clocks.** Still allow ties and small inversions; no causality.
* **Lamport clocks.** Causal but unrelated to physical time, useless as a displayed timestamp.
* **Vector clocks.** Size grows with the number of nodes; overkill for a total order.

## Consequences

* One 32-byte string per message, indexable as a plain string.
* `receive()` enforces a maximum drift (`HLC_MAX_DRIFT_MS`) so a node with a broken clock
  cannot poison the others.
* Property-based tests in `packages/protocol/src/hlc.test.ts` check monotonicity and causality.
