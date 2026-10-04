import { randomBytes, randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  ApiResponse,
  AuthResponse,
  ClientToServerEvents,
  Conversation,
  Message,
  MessagesResponse,
  ServerToClientEvents,
} from '@chatverse/protocol';

/**
 * Minimal HTTP + Socket.IO client for virtual users. It talks the protocol defined in
 * @chatverse/protocol and nothing else, so it doubles as a conformance check of the server.
 */

export type BenchSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface VirtualUser {
  index: number;
  username: string;
  email: string;
  password: string;
  deviceId: string;
  userId: string;
  accessToken: string;
}

const API_PREFIX = '/api/v1';

export class ApiClient {
  constructor(public readonly baseUrl: string) {}

  async request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${this.baseUrl}${API_PREFIX}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: ApiResponse<T>;
    try {
      parsed = JSON.parse(text) as ApiResponse<T>;
    } catch {
      throw new Error(
        `${method} ${path} -> HTTP ${res.status} (non-JSON body: ${text.slice(0, 120)})`,
      );
    }
    if (!parsed.ok) {
      throw new Error(`${method} ${path} -> ${parsed.error.code}: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  /** Register a fresh user; falls back to login if the run id collided (re-runs). */
  async provisionUser(runId: string, index: number): Promise<VirtualUser> {
    const username = `bench_${runId}_${index}`.toLowerCase();
    const email = `${username}@bench.local`;
    const password = `bench-${runId}-${randomBytes(6).toString('hex')}`;
    const deviceId = `bench-${randomBytes(8).toString('hex')}`;
    let auth: AuthResponse;
    try {
      auth = await this.request<AuthResponse>('POST', '/auth/register', {
        username,
        email,
        password,
        displayName: `Bench ${index}`,
      });
    } catch (err) {
      if (!String(err).includes('TAKEN')) throw err;
      auth = await this.request<AuthResponse>('POST', '/auth/login', { email, password, deviceId });
    }
    return {
      index,
      username,
      email,
      password,
      deviceId,
      userId: auth.user.id,
      accessToken: auth.accessToken,
    };
  }

  createGroup(owner: VirtualUser, name: string, participantIds: string[]): Promise<Conversation> {
    return this.request<Conversation>(
      'POST',
      '/conversations',
      { kind: 'group', participantIds, name },
      owner.accessToken,
    );
  }

  listConversations(user: VirtualUser): Promise<unknown> {
    return this.request('GET', '/conversations', undefined, user.accessToken);
  }

  fetchAfter(
    user: VirtualUser,
    conversationId: string,
    afterSeq: number,
    limit = 200,
  ): Promise<MessagesResponse> {
    return this.request<MessagesResponse>(
      'GET',
      `/conversations/${conversationId}/messages?afterSeq=${afterSeq}&limit=${limit}`,
      undefined,
      user.accessToken,
    );
  }

  /** Scrape Prometheus text format into a name -> summed value map. Returns null if unreachable. */
  async scrapeMetrics(): Promise<Record<string, number> | null> {
    try {
      const res = await fetch(`${this.baseUrl}/metrics`);
      if (!res.ok) return null;
      const values: Record<string, number> = {};
      for (const rawLine of (await res.text()).split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([-+0-9.eE]+|NaN|[+-]Inf)/.exec(
          line,
        );
        if (!match) continue;
        const name = match[1]!;
        const value = Number(match[3]);
        if (!Number.isFinite(value)) continue;
        values[name] = (values[name] ?? 0) + value;
      }
      return values;
    } catch {
      return null;
    }
  }
}

export function connectSocket(
  baseUrl: string,
  user: VirtualUser,
  timeoutMs = 15_000,
): Promise<BenchSocket> {
  return new Promise((resolve, reject) => {
    const socket: BenchSocket = io(baseUrl, {
      transports: ['websocket'],
      auth: { token: user.accessToken, deviceId: user.deviceId },
      reconnection: true,
      reconnectionDelay: 250,
      reconnectionDelayMax: 2_000,
      timeout: timeoutMs,
      forceNew: true,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`socket connect timeout for ${user.username}`));
    }, timeoutMs);
    socket.once('session:ready', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      socket.close();
      reject(new Error(`socket connect error for ${user.username}: ${err.message}`));
    });
  });
}

export function joinConversation(socket: BenchSocket, conversationId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    socket.emit('conversation:join', { conversationId }, (ack: Ack<{ headSeq: number }>) => {
      if (ack.ok) resolve(ack.data.headSeq);
      else reject(new Error(`conversation:join failed: ${ack.error.code}`));
    });
  });
}

export interface SendOutcome {
  clientMsgId: string;
  sentAt: number;
  ackAt: number;
  message: Message | null;
  error: string | null;
}

/** Send a plaintext message whose body carries the send timestamp for end-to-end latency. */
export function sendTimed(
  socket: BenchSocket,
  conversationId: string,
  index: number,
): Promise<SendOutcome> {
  const clientMsgId = randomUUID();
  const sentAt = Date.now();
  const text = JSON.stringify({ t: sentAt, i: index, id: clientMsgId });
  return new Promise((resolve) => {
    socket.emit(
      'message:send',
      { conversationId, clientMsgId, kind: 'text', text },
      (ack: Ack<{ message: Message }>) => {
        const ackAt = Date.now();
        if (ack.ok) resolve({ clientMsgId, sentAt, ackAt, message: ack.data.message, error: null });
        else resolve({ clientMsgId, sentAt, ackAt, message: null, error: ack.error.code });
      },
    );
  });
}

export interface TimedPayload {
  t: number;
  i: number;
  id: string;
}

export function parseTimedPayload(message: Message): TimedPayload | null {
  if (!message.text) return null;
  try {
    const parsed = JSON.parse(message.text) as Partial<TimedPayload>;
    if (typeof parsed.t === 'number' && typeof parsed.id === 'string') {
      return { t: parsed.t, i: typeof parsed.i === 'number' ? parsed.i : -1, id: parsed.id };
    }
  } catch {
    /* not a bench message */
  }
  return null;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Spread `count` tasks over `windowMs` with uniform jitter, limiting concurrency. */
export async function rampUp<T>(
  count: number,
  windowMs: number,
  concurrency: number,
  task: (index: number) => Promise<T>,
): Promise<T[]> {
  const results: T[] = new Array(count);
  const slot = count > 0 ? windowMs / count : 0;
  let next = 0;
  const worker = async () => {
    while (next < count) {
      const i = next++;
      const target = i * slot + Math.random() * slot;
      const wait = target - (Date.now() - start);
      if (wait > 0) await sleep(wait);
      results[i] = await task(i);
    }
  };
  const start = Date.now();
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, count)) }, worker));
  return results;
}

export function newRunId(): string {
  return `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
}
