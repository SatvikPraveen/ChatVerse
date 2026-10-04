# ADR 0003: Client-generated idempotency keys

**Status:** Accepted · **Date:** 2026-10-03

## Context

Sockets drop. A client that sent a message and never received the acknowledgement does not know
whether the server stored it. Retrying blindly creates duplicates; not retrying loses messages.
Offline outboxes make the problem routine rather than exceptional.

## Decision

Every send carries a client-generated UUID `clientMsgId`. A unique index on
`(conversationId, senderId, clientMsgId)` makes a retry a no-op: the server catches the duplicate
key error and returns the existing message (same `seq`, same `id`) with `ok: true`.

## Alternatives considered

- **Server-side de-duplication by content hash + time window.** Heuristic, rejects legitimate
  repeated messages ("ok", "ok").
- **Two-phase send (reserve id, then commit).** Twice the round trips for the common case.

## Consequences

- Clients get exactly-once _visible_ delivery on top of an at-least-once transport.
- Optimistic UI is straightforward: the pending message is keyed by `clientMsgId` and replaced
  in place when the authoritative message arrives, whether via ack or via `message:new`.
- The index costs one extra B-tree per message; acceptable.
