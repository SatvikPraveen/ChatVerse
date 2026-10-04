# ADR 0008: MongoDB as the message store

**Status:** Accepted · **Date:** 2026-10-03

## Context

Messages are append-mostly, read by `(conversationId, seq)` ranges, and carry variable-shaped
payloads (attachments, reactions, opaque ciphertext).

## Decision

MongoDB with Mongoose. Indexes:

* `{ conversationId: 1, seq: 1 }` unique: range scans for history and sync, uniqueness of seq.
* `{ conversationId: 1, senderId: 1, clientMsgId: 1 }` unique: idempotent sends (ADR 0003).
* text index on `text`: search for plaintext conversations.
* optional TTL index on `createdAt`: retention policy.
* `directKey` unique sparse on conversations: at most one direct conversation per user pair.

## Alternatives considered

* **PostgreSQL.** Equally viable; JSONB for payloads. Chosen against only because the
  per-conversation range access pattern maps naturally onto a document store and the existing
  infrastructure already targeted MongoDB.
* **Cassandra / ScyllaDB.** Best fit for very large scale (partition by conversation), but
  operational cost is not justified for a reference implementation.

## Consequences

* All ordering invariants are enforced by unique indexes, not by application discipline.
* `mongodb-memory-server` lets the full test suite run without external services.
