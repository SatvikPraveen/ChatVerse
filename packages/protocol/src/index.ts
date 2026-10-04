/**
 * @chatverse/protocol
 *
 * Single source of truth for everything that crosses a process boundary in ChatVerse:
 *  - domain models as they appear on the wire (dates are ISO-8601 strings)
 *  - the Socket.IO event maps (typed in both directions, every mutating event is acknowledged)
 *  - REST request/response contracts
 *  - zod schemas used for validation on the server and for form validation on clients
 *  - stable error codes
 *  - the hybrid logical clock used to stamp messages with causally consistent timestamps
 *
 * See docs/PROTOCOL.md for the normative description of the protocol.
 */
export const PROTOCOL_VERSION = 1 as const;

export * from './models.js';
export * from './socket.js';
export * from './http.js';
export * from './schemas.js';
export * from './errors.js';
export * from './hlc.js';
export * from './constants.js';
