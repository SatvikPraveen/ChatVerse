# ADR 0001: One shared protocol package is the contract between server and clients

**Status:** Accepted · **Date:** 2026-10-03

## Context

The original scaffold had three incompatible descriptions of the same system: the shared types
used `username`/`displayName` and snake_case socket events, the server used `name` and
colon-separated events, and the web client used a third shape. Nothing compiled against
anything else.

## Decision

`@chatverse/protocol` is the single source of truth. It contains the wire models, the typed
Socket.IO event maps for both directions, the REST contracts, the zod schemas used for
validation, the error codes and their HTTP mapping, and the hybrid logical clock. Both the server
and every client depend on it; neither may define its own copy of a wire type.

The package ships TypeScript source (no build step) because every consumer bundles it: the API
with tsup, the web client with Vite.

## Alternatives considered

- **OpenAPI + AsyncAPI generated clients.** More tooling, two schema languages, and generated
  code that still has to be kept in sync with the zod validators.
- **Protobuf.** Binary efficiency is not the bottleneck; JSON keeps debugging and the browser
  story simple.

## Consequences

- A change to a wire type is a change to one file and fails compilation in every consumer.
- Validation limits are identical on both ends (`LIMITS`).
- The protocol has a human-readable normative spec (`docs/PROTOCOL.md`) that the package must
  follow.
