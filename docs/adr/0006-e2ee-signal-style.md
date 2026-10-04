# ADR 0006: Signal-style end-to-end encryption on @noble primitives

**Status:** Accepted · **Date:** 2026-10-03

## Context

A "secure" messenger that lets the operator read messages is not secure against the operator.
The server must be able to store and route messages without being able to read them, and a
one-time compromise of a device should not expose the whole history or the whole future.

## Decision

Implement the published Signal protocol family in TypeScript in `packages/crypto`:

- **X3DH** for asynchronous authenticated key agreement (pre-key bundles on the server).
- **Double Ratchet** for pairwise sessions (forward secrecy + post-compromise security).
- **Sender Keys** for groups (one encryption per message instead of one per member).

Primitives come from `@noble/curves`, `@noble/ciphers`, `@noble/hashes`: audited, pure
TypeScript, identical in browsers and Node, no WASM initialisation.

Deviation from Signal: a separate Ed25519 signing key instead of XEdDSA over the X25519 identity
key (same choice as Matrix/Olm).

## Alternatives considered

- **libsignal (WASM/native bindings).** Not available for the browser as a supported package;
  opaque to readers of this codebase.
- **MLS (RFC 9420).** Better group scalability (tree-based), but far larger to implement; Sender
  Keys are adequate for groups of a few hundred.
- **Server-side encryption at rest only.** Does not protect against the operator.
- **libsodium-wrappers.** Works, but requires async WASM init and ships C; @noble is auditable
  TypeScript.

## Consequences

- The server never sees plaintext of encrypted conversations; it cannot generate previews or
  search them.
- Clients must persist ratchet state after every operation; losing it loses the session.
- Property-based and adversarial tests cover reordering, loss, replay, tampering, persistence,
  and post-compromise security.
- Metadata is still visible to the server (documented in SECURITY.md).
