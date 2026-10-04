# ADR 0005: Receipts as per-participant watermarks

**Status:** Accepted · **Date:** 2026-10-03

## Context

The scaffold stored a `readBy: [{ user, readAt }]` array on every message. Marking a
conversation read then meant updating up to *N* message documents, and rendering read state
meant scanning those arrays. In a group of 100 people with 10,000 messages this is a million
array entries.

## Decision

Each participant record on the conversation carries `lastDeliveredSeq` and `lastReadSeq`.
Because `seq` is dense and monotonic (ADR 0002), "P has read message m" is simply
`m.seq ≤ P.lastReadSeq`. Updates are monotonic (never decrease) and are broadcast as
`receipt:updated` to the conversation room.

## Alternatives considered

* **Per-message read sets.** O(messages × participants) storage and writes.
* **Separate receipts collection.** Still O(messages) rows; adds a join to render.

## Consequences

* Receipt state is O(participants) per conversation and one field update per read.
* Clients compute unread counts locally as `headSeq - lastReadSeq`.
* Per-message granularity of *who* read *which* message is lost; the watermark says "everything
  up to here", which is what every mainstream messenger shows anyway.
