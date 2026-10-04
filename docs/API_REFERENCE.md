# API Reference

Base URL: `/api/v1`. Every response is wrapped:

```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": { "code": "NOT_A_PARTICIPANT", "message": "...", "details": { }, "requestId": "..." } }
```

Error codes and their HTTP statuses are listed in
[`packages/protocol/src/errors.ts`](../packages/protocol/src/errors.ts). Request bodies are
validated with the zod schemas in
[`packages/protocol/src/schemas.ts`](../packages/protocol/src/schemas.ts); unknown fields are
rejected with `VALIDATION_ERROR` and field-level `details`.

Authenticated routes require `Authorization: Bearer <accessToken>`. Rate-limit state is reported
in `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` and, on 429, `Retry-After`.

## Auth

| Method | Path             | Body                                         | Returns                                     |
| ------ | ---------------- | -------------------------------------------- | ------------------------------------------- |
| POST   | `/auth/register` | `{ username, email, password, displayName }` | `AuthResponse` (201)                        |
| POST   | `/auth/login`    | `{ email, password, deviceId? }`             | `AuthResponse`                              |
| POST   | `/auth/refresh`  | `{ refreshToken }`                           | `AuthResponse` with a rotated refresh token |
| POST   | `/auth/logout`   | `{ refreshToken }`                           | `{ loggedOut: true }`                       |

`AuthResponse = { user: UserProfile, accessToken, expiresIn, refreshToken }`.
Credential endpoints have their own per-IP budget (`AUTH_RATE_LIMIT_MAX`, default 20/min).
Presenting an already-rotated refresh token returns `TOKEN_REUSED` and revokes every session in
that token family.

## Users

| Method | Path              | Query / body                                    | Returns        |
| ------ | ----------------- | ----------------------------------------------- | -------------- |
| GET    | `/users/me`       |                                                 | `UserProfile`  |
| PATCH  | `/users/me`       | `{ displayName?, bio?, avatarUrl?, settings? }` | `UserProfile`  |
| GET    | `/users/search`   | `?q=&limit=`                                    | `PublicUser[]` |
| GET    | `/users/presence` | `?ids=a,b,c`                                    | `Presence[]`   |
| GET    | `/users/:id`      |                                                 | `PublicUser`   |

## Conversations

| Method | Path                                      | Query / body                                          | Returns                                                            |
| ------ | ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| GET    | `/conversations`                          | `?cursor=&limit=`                                     | `Page<Conversation>` ordered by `updatedAt` desc                   |
| POST   | `/conversations`                          | `{ kind, participantIds, name?, topic?, encrypted? }` | `Conversation` (201; direct conversations are idempotent per pair) |
| GET    | `/conversations/:id`                      |                                                       | `Conversation`                                                     |
| PATCH  | `/conversations/:id`                      | `{ name?, topic?, avatarUrl? }`                       | `Conversation` (admin/owner)                                       |
| POST   | `/conversations/:id/participants`         | `{ userIds }`                                         | `Conversation` (admin/owner)                                       |
| DELETE | `/conversations/:id/participants/:userId` |                                                       | `Conversation` (admin/owner, or self)                              |
| POST   | `/conversations/:id/leave`                |                                                       | `{ left: true }`                                                   |
| POST   | `/conversations/:id/read`                 | `{ seq }`                                             | `ReceiptUpdate` or `null` if the watermark did not move            |
| GET    | `/conversations/:id/messages`             | `?beforeSeq=` or `?afterSeq=`, `&limit=`              | `{ items, headSeq, hasMore }` (items ascending by seq)             |
| POST   | `/conversations/:id/messages`             | `MessageSendInput` without `conversationId`           | `Message` (201; idempotent on `clientMsgId`)                       |

Participants carry `role`, `lastReadSeq`, `lastDeliveredSeq` and `muted`; `headSeq` is the
highest sequence number in the conversation, so `headSeq - lastReadSeq` is the unread count.

## Messages

| Method | Path                      | Query / body                  | Returns                                                               |
| ------ | ------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| GET    | `/messages/search`        | `?q=&conversationId?=&limit=` | `Message[]` (plaintext conversations only)                            |
| PATCH  | `/messages/:id`           | `{ text }` or `{ encrypted }` | `Message` (sender only)                                               |
| DELETE | `/messages/:id`           |                               | `{ messageId }` (sender, admin or owner; tombstones keep their `seq`) |
| POST   | `/messages/:id/reactions` | `{ emoji }`                   | `Message` (toggle)                                                    |

Edits and deletes are broadcast as `message:updated` / `message:deleted`.

## Keys (end-to-end encryption)

| Method | Path                   | Query / body                   | Returns                                                                                                                                |
| ------ | ---------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| PUT    | `/keys/bundle`         | `PreKeyBundleUpload`           | `{ deviceId, oneTimePreKeys }`                                                                                                         |
| POST   | `/keys/one-time`       | `{ deviceId, oneTimePreKeys }` | `{ deviceId, oneTimePreKeys }`                                                                                                         |
| GET    | `/keys/count`          | `?deviceId=`                   | `{ deviceId, oneTimePreKeys }` (404 `NOT_FOUND` for an unknown device)                                                                 |
| GET    | `/keys/bundle/:userId` | `?deviceId?=`                  | `PreKeyBundle` for the most recently active device; **consumes one one-time pre-key** atomically; `oneTimePreKey: null` when exhausted |

## Uploads

| Method | Path                    | Body                           | Returns                                                      |
| ------ | ----------------------- | ------------------------------ | ------------------------------------------------------------ |
| POST   | `/uploads/presign`      | `{ fileName, size, mimeType }` | `{ attachmentId, uploadUrl, headers, publicUrl, expiresAt }` |
| POST   | `/uploads/:id/complete` |                                | `Attachment` with `status: 'ready'`                          |

Returns `SERVICE_UNAVAILABLE` when object storage is not configured.

## Push

| Method | Path                  | Body                                               | Returns                      |
| ------ | --------------------- | -------------------------------------------------- | ---------------------------- |
| GET    | `/push/vapid`         |                                                    | `{ enabled, publicKey }`     |
| POST   | `/push/subscriptions` | `{ endpoint, keys: { p256dh, auth }, userAgent? }` | `{ subscribed: true }` (201) |
| DELETE | `/push/subscriptions` | `{ endpoint }`                                     | `{ unsubscribed: true }`     |

## Operational endpoints (outside `/api/v1`)

| Method | Path            | Returns                                                            |
| ------ | --------------- | ------------------------------------------------------------------ |
| GET    | `/health/live`  | `{ status: 'ok', nodeId, uptimeSec }`                              |
| GET    | `/health/ready` | `HealthResponse` with MongoDB and Redis checks (503 when degraded) |
| GET    | `/metrics`      | Prometheus exposition (when `METRICS_ENABLED`)                     |

## Socket.IO

Connect to the same origin with `auth: { token: <accessToken>, deviceId }`. The full event
reference, acknowledgement envelope and rate limits are in [`PROTOCOL.md`](./PROTOCOL.md#13-event-reference).
