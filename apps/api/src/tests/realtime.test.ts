import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import type { AuthResponse, Message } from '@chatverse/protocol';
import { uuid } from '../lib/ids.js';
import { bearer, boot, connectSocket, createDirect, createGroup, emitAck, registerUser, sendText, shutdown, sleep, waitFor, type TestContext } from './helpers.js';

let ctx: TestContext;
let alice: AuthResponse;
let bob: AuthResponse;
let carol: AuthResponse;

beforeAll(async () => {
  ctx = await boot();
  [alice, bob, carol] = await Promise.all([registerUser(ctx, 'alice'), registerUser(ctx, 'bob'), registerUser(ctx, 'carol')]);
});
afterAll(() => shutdown(ctx));

describe('realtime gateway', () => {
  it('rejects unauthenticated and revoked sessions', async () => {
    const err = await new Promise<Error & { data?: { code?: string } }>((resolve) => {
      const s = ioClient(ctx.url, { auth: { token: 'nope' }, transports: ['websocket'], reconnection: false });
      s.once('connect_error', (e) => {
        s.close();
        resolve(e as Error & { data?: { code?: string } });
      });
    });
    expect(err.data?.code).toBe('TOKEN_INVALID');

    const dave = await registerUser(ctx, 'dave');
    await ctx.api.post('/api/v1/auth/logout').send({ refreshToken: dave.refreshToken }).expect(200);
    await expect(connectSocket(ctx, dave)).rejects.toMatchObject({ data: { code: 'TOKEN_INVALID' } });
  });

  it('delivers messages to peers with correct seq, acks the sender, and supports edit/delete/reactions', async () => {
    const id = await createDirect(ctx, alice, bob);
    const [sa, sb] = await Promise.all([connectSocket(ctx, alice), connectSocket(ctx, bob)]);

    const join = await emitAck(sa, 'conversation:join', { conversationId: id });
    expect(join).toEqual({ ok: true, data: { headSeq: 0 } });

    const incoming = waitFor(sb, 'message:new');
    const ack = await emitAck(sa, 'message:send', { conversationId: id, clientMsgId: uuid(), kind: 'text', text: 'hello over ws' });
    expect(ack.ok).toBe(true);
    const sent = (ack as { ok: true; data: { message: Message } }).data.message;
    expect(sent.seq).toBe(1);
    expect((await incoming).message.id).toBe(sent.id);

    const updated = waitFor(sb, 'message:updated');
    await emitAck(sa, 'message:edit', { messageId: sent.id, text: 'edited over ws' });
    expect((await updated).message.text).toBe('edited over ws');

    const reacted = waitFor(sa, 'message:updated', (p) => p.message.reactions.length === 1);
    await emitAck(sb, 'reaction:toggle', { messageId: sent.id, emoji: '🎉' });
    expect((await reacted).message.reactions[0]!.userIds).toEqual([bob.user.id]);

    const deleted = waitFor(sb, 'message:deleted');
    expect((await emitAck(sa, 'message:delete', { messageId: sent.id })).ok).toBe(true);
    expect(await deleted).toEqual({ conversationId: id, messageId: sent.id, seq: 1 });
  });

  it('returns protocol errors in acks for invalid or unauthorised events', async () => {
    const id = await createDirect(ctx, alice, bob);
    const sc = await connectSocket(ctx, carol);
    const notMember = await emitAck(sc, 'message:send', { conversationId: id, clientMsgId: uuid(), kind: 'text', text: 'intruder' });
    expect(notMember).toMatchObject({ ok: false, error: { code: 'NOT_A_PARTICIPANT' } });
    const invalid = await emitAck(sc, 'message:send', { conversationId: 'bad', clientMsgId: 'x', kind: 'text' } as never);
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    const errorEvent = waitFor(sc, 'protocol:error');
    sc.emit('receipt:read', { conversationId: 'nope', seq: -1 } as never);
    expect((await errorEvent).code).toBe('VALIDATION_ERROR');
  });

  it('broadcasts receipt watermarks and typing indicators to the conversation', async () => {
    const id = await createDirect(ctx, alice, bob);
    const [sa, sb] = await Promise.all([connectSocket(ctx, alice), connectSocket(ctx, bob)]);
    await sendText(ctx, alice, id, 'one');
    await sendText(ctx, alice, id, 'two');

    const receipt = waitFor(sa, 'receipt:updated', (r) => r.userId === bob.user.id);
    sb.emit('receipt:delivered', { conversationId: id, seq: 2 });
    expect(await receipt).toEqual({ conversationId: id, userId: bob.user.id, lastDeliveredSeq: 2, lastReadSeq: 0 });
    const read = waitFor(sa, 'receipt:updated', (r) => r.lastReadSeq === 2);
    sb.emit('receipt:read', { conversationId: id, seq: 2 });
    expect((await read).lastDeliveredSeq).toBe(2);

    const typing = waitFor(sa, 'typing');
    sb.emit('typing', { conversationId: id, isTyping: true });
    expect(await typing).toEqual({ conversationId: id, userId: bob.user.id, isTyping: true });
  });

  it('tracks presence across devices and informs contacts on connect, status change and disconnect', async () => {
    const [eve, frank] = await Promise.all([registerUser(ctx, 'eve'), registerUser(ctx, 'frank')]);
    await createDirect(ctx, eve, frank);
    const sf = await connectSocket(ctx, frank);
    const online = waitFor(sf, 'presence:changed', (p) => p.userId === eve.user.id && p.status === 'online');
    const se1 = await connectSocket(ctx, eve, 'eve-phone-01');
    expect((await online).deviceCount).toBe(1);

    const two = waitFor(sf, 'presence:changed', (p) => p.userId === eve.user.id && p.deviceCount === 2);
    const se2 = await connectSocket(ctx, eve, 'eve-laptop-01');
    await two;

    const busy = waitFor(sf, 'presence:changed', (p) => p.userId === eve.user.id && p.status === 'busy');
    se1.emit('presence:set', { status: 'busy' });
    expect((await busy).deviceCount).toBe(2);

    const one = waitFor(sf, 'presence:changed', (p) => p.userId === eve.user.id && p.deviceCount === 1);
    se1.disconnect();
    expect((await one).status).toBe('busy'); // still online on the laptop
    const offline = waitFor(sf, 'presence:changed', (p) => p.userId === eve.user.id && p.status === 'offline');
    se2.disconnect();
    expect((await offline).deviceCount).toBe(0);

    const rest = await ctx.api.get(`/api/v1/users/presence?ids=${eve.user.id},${frank.user.id}`).set(bearer(frank)).expect(200);
    expect(rest.body.data).toEqual([expect.objectContaining({ userId: eve.user.id, status: 'offline' }), expect.objectContaining({ userId: frank.user.id, status: 'online', deviceCount: 1 })]);
  });

  it('fills gaps with sync:pull after missed broadcasts', async () => {
    const id = await createDirect(ctx, bob, carol);
    const sc = await connectSocket(ctx, carol);
    const first = waitFor(sc, 'message:new', (m) => m.message.seq === 1);
    await sendText(ctx, bob, id, 'a');
    await first;
    sc.disconnect(); // misses 2..6
    for (let i = 0; i < 5; i++) await sendText(ctx, bob, id, `missed ${i}`);
    const sc2 = await connectSocket(ctx, carol);
    const pull = await emitAck(sc2, 'sync:pull', { conversationId: id, afterSeq: 1, limit: 3 });
    expect(pull.ok).toBe(true);
    const page = (pull as { ok: true; data: { messages: Message[]; headSeq: number; hasMore: boolean } }).data;
    expect(page.messages.map((m) => m.seq)).toEqual([2, 3, 4]);
    expect(page).toMatchObject({ headSeq: 6, hasMore: true });
    const rest = (await emitAck(sc2, 'sync:pull', { conversationId: id, afterSeq: 4 })) as { ok: true; data: { messages: Message[]; hasMore: boolean } };
    expect(rest.data.messages.map((m) => m.seq)).toEqual([5, 6]);
    expect(rest.data.hasMore).toBe(false);
  });

  it('receives conversation:added and joins the room when added to a group live', async () => {
    const sc = await connectSocket(ctx, carol);
    const added = waitFor(sc, 'conversation:added');
    const id = await createGroup(ctx, alice, [bob, carol], 'live group');
    expect((await added).conversation.id).toBe(id);
    const msg = waitFor(sc, 'message:new');
    await sendText(ctx, alice, id, 'welcome');
    expect((await msg).message.conversationId).toBe(id);
    const removed = waitFor(sc, 'conversation:removed');
    await ctx.api.delete(`/api/v1/conversations/${id}/participants/${carol.user.id}`).set(bearer(alice)).expect(200);
    expect((await removed).conversationId).toBe(id);
    let leaked = false;
    sc.once('message:new', () => (leaked = true));
    await sendText(ctx, alice, id, 'after removal');
    await sleep(100);
    expect(leaked).toBe(false);
  });

  it('rate-limits bursts per event with a retry hint', async () => {
    const id = await createDirect(ctx, alice, bob);
    const sa = await connectSocket(ctx, alice);
    const limited = waitFor(sa, 'rate:limited');
    const results = await Promise.all(Array.from({ length: 40 }, () => emitAck(sa, 'message:send', { conversationId: id, clientMsgId: uuid(), kind: 'text', text: 'burst' })));
    const rejected = results.filter((r) => !r.ok) as Array<{ ok: false; error: { code: string; details?: { retryAfterMs?: number } } }>;
    expect(results.filter((r) => r.ok)).toHaveLength(30);
    expect(rejected).toHaveLength(10);
    expect(rejected[0]!.error.code).toBe('RATE_LIMITED');
    expect(rejected[0]!.error.details?.retryAfterMs).toBeGreaterThan(0);
    expect((await limited).event).toBe('message:send');
    // ping heartbeat works and returns server clock
    const pong = await emitAck(sa, 'ping');
    expect(pong).toMatchObject({ ok: true, data: { serverTime: expect.any(String), hlc: expect.any(String) } });
  });
});
