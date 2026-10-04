import type { Ack, AckFn, ClientToServerEvents, ServerToClientEvents } from '@chatverse/protocol';
import { io, type Socket } from 'socket.io-client';
import { ApiClientError } from './api';
import { env } from './env';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Client events of the shape (input, ack) and their input/result types. */
type AckEventMap = {
  [K in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[K]> extends [infer I, AckFn<infer R>]
    ? { input: I; result: R }
    : never;
};
export type AckEventName = { [K in keyof AckEventMap]: AckEventMap[K] extends never ? never : K }[keyof AckEventMap];
export type AckInput<E extends AckEventName> = AckEventMap[E]['input'];
export type AckResult<E extends AckEventName> = AckEventMap[E]['result'];

const ACK_TIMEOUT_MS = 10_000;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket | null {
  return socket;
}

/**
 * Create (or replace) the singleton socket. socket.io handles reconnection with exponential
 * backoff + jitter; we only configure the bounds. The access token is read lazily on every
 * (re)connection attempt so a refreshed token is picked up automatically.
 */
export function connectSocket(opts: { getToken: () => string | null; deviceId: string }): AppSocket {
  disconnectSocket();
  const s: AppSocket = io(env.apiUrl || '/', {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 15_000,
    randomizationFactor: 0.5,
    timeout: 10_000,
    auth: (cb) => cb({ token: opts.getToken(), deviceId: opts.deviceId }),
  });
  socket = s;
  s.connect();
  return s;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export class SocketNotConnectedError extends Error {
  constructor() {
    super('socket is not connected');
    this.name = 'SocketNotConnectedError';
  }
}

/**
 * Emit an acknowledged event and resolve with its data, rejecting with `ApiClientError` on
 * `{ ok: false }` and with `SocketNotConnectedError` when offline (callers queue in the outbox).
 */
export function emitWithAck<E extends AckEventName>(event: E, input: AckInput<E>, s: AppSocket | null = socket): Promise<AckResult<E>> {
  if (!s || !s.connected) return Promise.reject(new SocketNotConnectedError());
  // The typed Socket's `timeout().emit` overloads do not model the ack parameter well; use a
  // narrow structural view instead of `any`.
  const emitter = s as unknown as {
    timeout(ms: number): { emit(ev: string, input: unknown, cb: (err: Error | null, ack?: Ack<unknown>) => void): void };
  };
  return new Promise((resolve, reject) => {
    emitter.timeout(ACK_TIMEOUT_MS).emit(event, input, (err, ack) => {
      if (err || !ack) return reject(new SocketNotConnectedError());
      if (ack.ok) return resolve(ack.data as AckResult<E>);
      reject(ApiClientError.fromApiError(ack.error, 0));
    });
  });
}

export function ping(s: AppSocket | null = socket): Promise<{ serverTime: string; hlc: string }> {
  if (!s || !s.connected) return Promise.reject(new SocketNotConnectedError());
  return new Promise((resolve, reject) => {
    s.timeout(ACK_TIMEOUT_MS).emit('ping', (err, ack) => {
      if (err || !ack) return reject(new SocketNotConnectedError());
      if (ack.ok) return resolve(ack.data);
      reject(ApiClientError.fromApiError(ack.error, 0));
    });
  });
}
