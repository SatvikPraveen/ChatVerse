# ChatVerse Wire Protocol (v1)

This document is the normative description of the protocol spoken between ChatVerse clients and
servers. The machine-readable contract lives in [`packages/protocol`](../packages/protocol); when
the two disagree, the code is wrong and should be fixed to match this document.

The key words MUST, MUST NOT, SHOULD and MAY are to be interpreted as in RFC 2119.

## 1. Design goals

| Goal | Mechanism |
| --- | --- |
| Exactly-once *visible* delivery over an at-least-once transport | Client idempotency keys (`clientMsgId`) + server-side unique index |
| Total order per conversation, gap detection, resumable sync | Dense per-conversation sequence numbers (`seq`) |
| Causally consistent order across conversations and nodes | Hybrid Logical Clock (`hlc`) |
| O(participants) receipt state | Per-participant delivered/read watermarks |
| Horizontal scalability | Room-based fan-out through a Redis-backed adapter |
| Confidentiality against the server | Opaque `EncryptedPayload`, keys never leave devices |

## 2. Transport

* REST over HTTPS under `/api/v1` for request/response operations.
* A single multiplexed Socket.IO connection for real-time events.
* All timestamps are ISO-8601 strings in UTC. All identifiers are opaque strings.

### 2.1 Envelopes

Every REST response and every socket acknowledgement uses the same envelope:

```ts
type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };
type ApiError = { code: ErrorCode; message: string; details?: object; requestId?: string };
```

Clients MUST branch on `error.code` (stable) and MUST NOT parse `error.message`.
The mapping from `ErrorCode` to HTTP status is fixed in `errors.ts`.

### 2.2 Authentication

* `POST /auth/login` returns a short-lived **access token** (JWT, default 15 min) and an opaque
  **refresh token** (default 30 days).
* REST requests carry `Authorization: Bearer <accessToken>`.
* The socket handshake carries `auth: { token: <accessToken>, deviceId }`.
* Refresh tokens are **rotated on every use** and belong to a *family*. Presenting a refresh
  token that was already rotated is treated as theft: the server returns `TOKEN_REUSED` and
  revokes the whole family (every session derived from that login).

## 3. Sequencing

Each conversation carries a monotonically increasing `headSeq`. When the server accepts a
message it assigns `seq = headSeq + 1` atomically. Consequently:

* `seq` values in one conversation are **dense**: 1, 2, 3, ... with no holes once all
  messages are received.
* A client that holds messages up to `k` and receives `seq = k + n` with `n > 1` has a **gap**
  and MUST recover it with `sync:pull { afterSeq: k }` (or `GET .../messages?afterSeq=k`).
* `Conversation.headSeq` tells a client how far behind it is without fetching anything.

Deleted messages keep their `seq` (they are tombstoned with `deletedAt`), so density is preserved.

Reference implementation: `INCR conv:{id}:seq` in Redis, seeded from the database on a cold
cache, with a fallback to an atomic `$inc` on the conversation document when Redis is down.
Either path yields the same dense sequence.

## 4. Idempotent sends

Every send carries a client-generated UUID `clientMsgId`. The server enforces a unique index on
`(conversationId, senderId, clientMsgId)`. If a client retries a send (after a timeout, a
reconnect, or from an offline outbox) the server returns the *original* message with its
original `seq` and `ok: true`. Clients therefore get exactly-once visible delivery without
distributed transactions.

Clients MUST generate `clientMsgId` once per logical message and reuse it on every retry.

## 5. Hybrid Logical Clock

Every message is stamped with `hlc`, an encoded (wallMs, counter, nodeId) triple as defined in
`hlc.ts`. Properties:

* Lexicographic order of the encoded string equals logical order.
* If message A causally precedes message B (same node, or B was created after A was received)
  then `hlc(A) < hlc(B)` regardless of clock skew between nodes.
* `wallMs` is within bounded drift of physical time, so `hlc` doubles as a trustworthy
  "created at" for cross-conversation views (search results, notification ordering).

Servers MUST call `receive()` with the HLC of any inbound timestamp they merge, and MUST reject
timestamps more than `HLC_MAX_DRIFT_MS` ahead of their physical clock.

## 6. Receipts

Receipts are **watermarks**, not per-message sets. Each participant has
`lastDeliveredSeq` and `lastReadSeq` per conversation.

* A client emits `receipt:delivered { conversationId, seq }` after persisting a message
  locally and `receipt:read` when the user has seen it. Clients SHOULD debounce and send only
  the highest `seq`.
* The server applies the update only if it is **greater** than the stored value (monotonic).
* The server broadcasts `receipt:updated` to the conversation room.
* A message with `seq ≤ lastReadSeq` of participant P has been read by P.

Unread count for the current user is simply `headSeq - myParticipant.lastReadSeq`.

## 7. Presence

Presence is tracked per **device** and aggregated per user:

* On connect the server records the socket under the user with a heartbeat TTL; on
  disconnect (or TTL expiry after a crash) it is removed.
* `Presence.deviceCount` is the number of live sockets; `status = 'offline'` iff it is zero.
* Presence changes are broadcast only to users that share at least one conversation with the
  subject, never globally.
* `presence:set` lets a client choose `online | away | busy`; `offline` is derived, never set.

## 8. Typing

`typing { conversationId, isTyping }` is fire-and-forget and MUST be rate limited. Receivers
MUST expire a typing indicator locally after a few seconds even without a stop event.

## 9. Rooms and fan-out

The server keeps every socket joined to `u:{userId}` and to `c:{conversationId}` for each
conversation the user participates in. Message events are emitted to the conversation room,
user-targeted events to the user room. With the Redis adapter, `io.in(room).socketsJoin(...)`
is used so membership changes propagate to sockets on every node.

## 10. End-to-end encryption

A conversation with `encrypted: true` accepts only `kind: 'encrypted'` messages and the server
rejects plaintext with `PLAINTEXT_NOT_ALLOWED`; a plaintext conversation rejects encrypted
payloads with `ENCRYPTION_REQUIRED` semantics inverted (`VALIDATION_ERROR`). The payload is:

```ts
{ v: 1, suite: string, header: base64url, ciphertext: base64url }
```

The server stores and forwards it unchanged, derives no preview (`lastMessage.text = null`) and
cannot search it. Key distribution uses the pre-key bundle endpoints (`/keys/*`); the
cryptographic protocol is specified in [`SECURITY.md`](./SECURITY.md) and implemented in
[`packages/crypto`](../packages/crypto).

## 11. Rate limiting

* REST: fixed window per user (or IP before authentication) with `RateLimit-*` headers.
* Socket: token bucket per socket per event (`SOCKET_RATE_LIMITS`). Exceeding it yields an
  ack with `RATE_LIMITED` (for acknowledged events) or a `rate:limited` event, both carrying
  `retryAfterMs`.

## 12. Versioning

`PROTOCOL_VERSION` is sent in `session:ready`. Additive changes (new optional fields, new
events) do not bump the version. Removing or changing the meaning of a field does.

## 13. Event reference

| Direction | Event | Payload | Ack |
| --- | --- | --- | --- |
| C→S | `conversation:join` | `{ conversationId }` | `{ headSeq }` |
| C→S | `conversation:leave` | `{ conversationId }` | – |
| C→S | `message:send` | `MessageSendInput` | `{ message }` |
| C→S | `message:edit` | `MessageEditInput` | `{ message }` |
| C→S | `message:delete` | `{ messageId }` | `{ messageId }` |
| C→S | `reaction:toggle` | `{ messageId, emoji }` | `{ message }` |
| C→S | `receipt:delivered` / `receipt:read` | `{ conversationId, seq }` | – |
| C→S | `typing` | `{ conversationId, isTyping }` | – |
| C→S | `presence:set` | `{ status }` | – |
| C→S | `sync:pull` | `{ conversationId, afterSeq, limit? }` | `SyncPullResult` |
| C→S | `ping` | – | `{ serverTime, hlc }` |
| S→C | `session:ready` | `{ user, serverTime, hlc, nodeId, protocolVersion }` | |
| S→C | `message:new` / `message:updated` | `{ message }` | |
| S→C | `message:deleted` | `{ conversationId, messageId, seq }` | |
| S→C | `receipt:updated` | `ReceiptUpdate` | |
| S→C | `typing` | `{ conversationId, userId, isTyping }` | |
| S→C | `presence:changed` | `Presence` | |
| S→C | `conversation:added` / `updated` | `{ conversation }` | |
| S→C | `conversation:removed` | `{ conversationId }` | |
| S→C | `user:updated` | `{ user }` | |
| S→C | `rate:limited` | `{ event, retryAfterMs }` | |
| S→C | `protocol:error` | `ApiError` | |
