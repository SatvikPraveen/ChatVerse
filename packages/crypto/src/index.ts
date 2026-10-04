/**
 * @chatverse/crypto — end-to-end encryption for ChatVerse.
 *
 * Layers (bottom-up):
 *   primitives  → named wrappers over @noble (X25519, Ed25519, HKDF, HMAC, XChaCha20-Poly1305)
 *   keys        → device identity, signed / one-time pre-keys, bundle verification, safety numbers
 *   x3dh        → asynchronous authenticated key agreement
 *   ratchet     → Double Ratchet with bounded skipped keys and transactional decrypt
 *   senderkey   → Sender Keys for O(1) group encryption
 *   envelope    → mapping to the opaque EncryptedPayload the server relays
 *   session     → PairwiseSession: the API applications use
 *
 * Security properties and the threat model are documented in docs/SECURITY.md.
 */
export * from './encoding.js';
export * from './primitives.js';
export * from './keys.js';
export * from './x3dh.js';
export * from './ratchet.js';
export * from './senderkey.js';
export * from './envelope.js';
export * from './session.js';
