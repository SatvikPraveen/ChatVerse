# Architecture Decision Records

Each record captures one decision, its context, the alternatives considered and the
consequences. Records are immutable; a changed decision gets a new record that supersedes the old
one.

| #                                           | Decision                                                               | Status   |
| ------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| [0001](./0001-shared-protocol-package.md)   | One shared protocol package is the contract between server and clients | Accepted |
| [0002](./0002-dense-sequence-numbers.md)    | Dense per-conversation sequence numbers for ordering and sync          | Accepted |
| [0003](./0003-client-idempotency-keys.md)   | Client-generated idempotency keys for exactly-once visible delivery    | Accepted |
| [0004](./0004-hybrid-logical-clock.md)      | Hybrid logical clocks for cross-node causal timestamps                 | Accepted |
| [0005](./0005-receipt-watermarks.md)        | Receipts as per-participant watermarks                                 | Accepted |
| [0006](./0006-e2ee-signal-style.md)         | Signal-style E2EE (X3DH + Double Ratchet + Sender Keys) on @noble      | Accepted |
| [0007](./0007-redis-presence-and-fanout.md) | Redis for presence, sequencing and cross-node fan-out                  | Accepted |
| [0008](./0008-mongodb-document-store.md)    | MongoDB as the message store                                           | Accepted |
| [0009](./0009-benchmarks-as-first-class.md) | Reproducible benchmarks are part of the repository                     | Accepted |
