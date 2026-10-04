# Runbook: incidents

Each entry: symptom → how to confirm → what to do. Metrics are from `GET /metrics`; logs are JSON
lines with `requestId`, `userId` and `event` fields.

## Readiness failing (`/health/ready` returns 503)

- **Confirm:** the response lists which check failed (`mongodb` or `redis`) with `error`.
- **Redis down:** nodes keep serving. Sequencing falls back to MongoDB `$inc`, rate limits to
  memory windows, presence and cross-node fan-out stop working (users on different nodes stop
  seeing each other's messages until Redis returns). Restore Redis; no data is lost because
  counters re-seed from `Conversation.headSeq`.
- **MongoDB down:** writes fail with `INTERNAL`; reads from caches continue. Restore MongoDB and
  watch `http_request_duration_seconds` for the backlog to drain.

## Users report missing messages

- **Confirm:** compare `Conversation.headSeq` with the highest `seq` the client holds. A client
  that is behind should be issuing `sync:pull`; look for `socket_event_duration_seconds{event="sync:pull"}`.
- **Hole in the sequence** (a `seq` with no message): a node crashed between allocating a seq
  and inserting the message. Sync treats it as a tombstone. If holes are frequent, check for
  OOM kills or forced restarts during traffic.
- **Fan-out stopped between nodes:** check that every node reports the same Redis in
  `/health/ready` and that the adapter is attached (`redis.shared` is logged at startup).

## Messages arrive out of order on clients

- The protocol orders by `seq` on the client, so visible order is always correct. Out-of-order
  _arrival_ shows as extra `sync:pull` calls.
- **Confirm:** run `pnpm bench -- --scenario fanout` against the cluster; `ordering violations`
  should be 0 (see `docs/EVALUATION.md`).
- **Cause:** the distributed send lock is disabled (Redis not shared) or being lost (TTL 2 s
  exceeded because MongoDB inserts are slow). Check `message_fanout_duration_seconds` p99.

## Elevated latency

- `nodejs_eventloop_lag_p99_seconds` > 50 ms: the node is CPU bound; add replicas (HPA) or raise
  limits.
- `message_fanout_duration_seconds` p99 high but event loop lag low: MongoDB write latency.
  Check the primary's disk and connection pool saturation.
- `http_request_duration_seconds` high only for `/auth/*`: scrypt cost is deliberate
  (N = 2^15); do not lower it, scale out instead.

## Rate limiting false positives

- Behind a proxy without `TRUST_PROXY=true` every client shares the proxy's IP. Set it.
- Load tests must raise `RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_MAX` explicitly.

## Suspected token theft

- `TOKEN_REUSED` in logs means a rotated refresh token was presented again; the family was
  revoked automatically and the user has to log in again. Investigate the `userId` and IPs.

## E2EE users see "waiting for keys"

- The recipient has not yet received the sender's key material (group sender key distribution
  or an X3DH first message addressed to another device). It resolves when the control message
  arrives; if it persists, the recipient's device may have reset its keys. Users can compare
  safety numbers to confirm identity after a reset.
- Check `GET /keys/count` for the device; an exhausted one-time pre-key supply still works
  (reduced forward secrecy), a missing device record means the client must re-upload its bundle.

## Rolling back a deploy

Images are immutable per tag; roll the Deployment back with `kubectl rollout undo`. Schema is
additive; no migration is needed between 2.x versions.
