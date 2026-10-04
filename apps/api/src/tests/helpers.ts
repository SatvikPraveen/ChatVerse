import mongoose from 'mongoose';
import { io as ioClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import type { AuthResponse, ClientToServerEvents, Message, ServerToClientEvents } from '@chatverse/protocol';
import { uuid } from '../lib/ids.js';
import { startServer, type RunningServer } from '../server.js';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface TestContext {
  server: RunningServer;
  api: ReturnType<typeof request>;
  url: string;
  sockets: ClientSocket[];
}

/** Start a full server on a random port with wiped collections. */
export async function boot(): Promise<TestContext> {
  const server = await startServer({ PORT: 0 });
  await wipe();
  return { server, api: request(server.app), url: `http://127.0.0.1:${server.port}`, sockets: [] };
}

export async function shutdown(ctx: TestContext): Promise<void> {
  for (const s of ctx.sockets) s.disconnect();
  ctx.sockets = [];
  await ctx.server.stop();
}

export async function wipe(): Promise<void> {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
  await mongoose.connection.db!.admin().command({ ping: 1 });
}

let userCounter = 0;

export async function registerUser(ctx: TestContext, name = `user${++userCounter}`): Promise<AuthResponse> {
  const res = await ctx.api
    .post('/api/v1/auth/register')
    .send({ username: `${name}${Date.now().toString(36)}${userCounter}`.toLowerCase().slice(0, 30), email: `${name}-${userCounter}-${Date.now()}@example.com`, password: 'correct horse battery staple', displayName: name })
    .expect(201);
  return res.body.data as AuthResponse;
}

export function bearer(auth: AuthResponse): { Authorization: string } {
  return { Authorization: `Bearer ${auth.accessToken}` };
}

export async function createDirect(ctx: TestContext, a: AuthResponse, b: AuthResponse, encrypted = false): Promise<string> {
  const res = await ctx.api.post('/api/v1/conversations').set(bearer(a)).send({ kind: 'direct', participantIds: [b.user.id], encrypted }).expect(201);
  return res.body.data.id as string;
}

export async function createGroup(ctx: TestContext, owner: AuthResponse, members: AuthResponse[], name = 'Group'): Promise<string> {
  const res = await ctx.api.post('/api/v1/conversations').set(bearer(owner)).send({ kind: 'group', name, participantIds: members.map((m) => m.user.id) }).expect(201);
  return res.body.data.id as string;
}

export async function sendText(ctx: TestContext, auth: AuthResponse, conversationId: string, text: string, clientMsgId = uuid()): Promise<Message> {
  const res = await ctx.api.post(`/api/v1/conversations/${conversationId}/messages`).set(bearer(auth)).send({ kind: 'text', text, clientMsgId }).expect(201);
  return res.body.data as Message;
}

/** Connect a socket.io client and wait for `session:ready`. */
export function connectSocket(ctx: TestContext, auth: AuthResponse, deviceId = `device-${uuid().slice(0, 8)}`): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket: ClientSocket = ioClient(ctx.url, { auth: { token: auth.accessToken, deviceId }, transports: ['websocket'], forceNew: true, reconnection: false });
    ctx.sockets.push(socket);
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 10_000);
    socket.once('session:ready', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Resolve with the next payload of `event` that satisfies `predicate`. */
export function waitFor<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
  predicate: (payload: Parameters<ServerToClientEvents[E]>[0]) => boolean = () => true,
  timeoutMs = 5_000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler as never);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload: Parameters<ServerToClientEvents[E]>[0]) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler as never);
      resolve(payload);
    };
    socket.on(event, handler as never);
  });
}

/** Promisified emit-with-ack. */
export function emitAck<E extends keyof ClientToServerEvents>(
  socket: ClientSocket,
  event: E,
  ...args: Parameters<ClientToServerEvents[E]> extends [...infer P, (ack: infer _A) => void] ? P : never
): Promise<AckOf<E>> {
  return new Promise((resolve) => {
    (socket.emit as unknown as (event: string, ...rest: unknown[]) => void)(event, ...args, (ack: AckOf<E>) => resolve(ack));
  });
}

type AckOf<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]> extends [...unknown[], (ack: infer A) => void] ? A : never;

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
