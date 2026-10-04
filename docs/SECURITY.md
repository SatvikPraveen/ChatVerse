# Security Model

This document states what ChatVerse protects, against whom, and how. It is written so that each
claim can be traced to code and, where possible, to a test.

## 1. Assets

1. Message content and attachments.
2. Message *metadata*: who talks to whom, when, how often.
3. Account credentials and sessions.
4. Availability of the service.

## 2. Adversaries

| Adversary | Capabilities | In scope? |
| --- | --- | --- |
| Network attacker | Observe/modify traffic between client and server | Yes (TLS + E2EE) |
| Malicious or compromised server | Read the database, replay or reorder stored payloads, serve forged key bundles | Yes for content (E2EE), partially for metadata |
| Other users | Send arbitrary API/socket traffic, attempt to read others' conversations, flood | Yes |
| Compromised device (one-time snapshot) | Obtain all keys and state on a device at one instant | Yes (forward secrecy, post-compromise security) |
| Persistent device malware | Continuous access to a device | No |
| Traffic analysis of encrypted channels | Timing and size correlation | No (sizes are not padded) |

## 3. Transport and account security

* TLS terminates at the ingress; HSTS and a strict CSP are set by `helmet`.
* Passwords are hashed with **scrypt** (N = 2^15, r = 8, p = 1, 32-byte salt) using Node's
  built-in implementation. Verification is constant-time.
* Access tokens are JWTs with a 15-minute lifetime; refresh tokens are 256-bit random values
  stored server-side with a TTL and **rotated on every use**. Reuse of a rotated token revokes
  the whole token family ("refresh token reuse detection").
* Every REST route validates its input with the shared zod schemas; the socket gateway does the
  same for every event. Unknown fields are rejected.
* Authorization is checked at the service layer: a user can only read or write conversations
  they participate in (`NOT_A_PARTICIPANT`), edit their own messages, and manage participants
  according to their role.
* Rate limits exist at three layers: per-IP/per-user HTTP fixed window, per-socket per-event
  token buckets, and connection-level limits at the ingress.
* Logs never contain tokens, passwords, or message bodies; request IDs allow correlation.

## 4. End-to-end encryption

ChatVerse implements the Signal-style trio of protocols in `packages/crypto`, built on the
audited `@noble` primitives (X25519, Ed25519, HKDF-SHA256, HMAC-SHA256, XChaCha20-Poly1305).

### 4.1 Key material per device

| Key | Type | Lifetime | Published |
| --- | --- | --- | --- |
| Identity key `IK` | X25519 | Device lifetime | Yes |
| Signing key `SK` | Ed25519 | Device lifetime | Yes |
| Signed pre-key `SPK` | X25519, signed by `SK` | Rotated periodically | Yes |
| One-time pre-keys `OPK` | X25519 | Single use | Yes, consumed on fetch |

Private halves are generated on the device and persisted only there (IndexedDB in the web
client). The server stores public halves and hands out one `OPK` per bundle fetch using an
atomic pop, so no `OPK` is ever used twice.

Design note: unlike Signal, which signs with an XEdDSA transform of the identity key, ChatVerse
keeps a separate Ed25519 signing key (as Matrix/Olm does). This keeps every primitive in its
standard form at the cost of one extra 32-byte public key.

### 4.2 Session establishment: X3DH

Alice fetches Bob's bundle, verifies the `SPK` signature, and computes

```
DH1 = DH(IK_A, SPK_B)   DH2 = DH(EK_A, IK_B)   DH3 = DH(EK_A, SPK_B)   DH4 = DH(EK_A, OPK_B)
SK  = HKDF-SHA256(0xFF*32 || DH1 || DH2 || DH3 || DH4, info = "ChatVerse-X3DH-v1")
AD  = IK_A || IK_B
```

Her first message carries `IK_A`, `EK_A` and the pre-key ids so Bob can derive the same `SK`.
`AD` is bound into every subsequent AEAD call, so a message can never be transplanted between
sessions.

### 4.3 Steady state: Double Ratchet

* Root chain: `KDF_RK(rk, dh) = HKDF(ikm = dh, salt = rk, info = "ChatVerse-DR-root-v1")`.
* Symmetric chains: `mk = HMAC(ck, 0x01)`, `ck' = HMAC(ck, 0x02)`.
* Message cipher: `(key, nonce) = HKDF(mk, info = "ChatVerse-DR-msg-v1")` then
  XChaCha20-Poly1305 with `AD || header` as associated data.
* Skipped message keys are stored for out-of-order delivery, bounded by `MAX_SKIP = 1000`.
* Decryption is **transactional**: a failed authentication restores the previous state, so an
  attacker cannot desynchronise a session by injecting garbage.

### 4.4 Groups: Sender Keys

Each member generates a chain key and an Ed25519 signing key per group, distributes them to the
other members over pairwise Double Ratchet sessions, and encrypts each group message once. Every
message is signed, so members cannot impersonate each other. Chains are rotated when membership
changes so that removed members cannot read new messages.

### 4.5 Properties and where they are tested

| Property | Mechanism | Test |
| --- | --- | --- |
| Confidentiality from the server | Opaque payloads; keys never uploaded | `session.test.ts` |
| Authentication of peers | X3DH DH1/DH2; bundle signature check | `session.test.ts` (forged bundle rejected) |
| Forward secrecy (per message) | One-time message keys from hash chains | `ratchet.test.ts` (replay rejected) |
| Post-compromise security | DH ratchet on every reply | `ratchet.test.ts` (leaked state useless after healing) |
| Integrity / no transplanting | AEAD with `AD || header` | `ratchet.test.ts` (tampering rejected) |
| Out-of-order tolerance, bounded memory | Skipped-key store with `MAX_SKIP` | `ratchet.test.ts` |
| Group sender authenticity | Ed25519 signature per message | `senderkey.test.ts` |
| Replay resistance in groups | Monotonic iteration, consumed keys | `senderkey.test.ts` |
| Key-server MITM detection | Safety numbers from both identity keys | `session.test.ts` |

### 4.6 Known limitations

* **Metadata** (participants, timing, sizes) is visible to the server by design.
* **Multi-device** is supported by the data model (bundles are per device) but the reference web
  client encrypts to a peer's most recently active device only.
* Messages are not padded; ciphertext length leaks plaintext length within 16 bytes.
* The web client's key store is only as safe as the browser profile; there is no secure enclave.
* Deniability (as in Signal's X3DH) holds for pairwise sessions but group messages are signed.
* No formal verification has been performed; the implementation follows the published
  specifications closely and is covered by property-based tests.

## 5. Reporting

Please report vulnerabilities privately to the maintainer (see repository profile) rather than
through public issues.
