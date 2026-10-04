import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthResponse, Message } from '@chatverse/protocol';
import { uuid } from '../lib/ids.js';
import { bearer, boot, createDirect, createGroup, registerUser, sendText, shutdown, type TestContext } from './helpers.js';

let ctx: TestContext;
let alice: AuthResponse;
let bob: AuthResponse;
let carol: AuthResponse;

beforeAll(async () => {
  ctx = await boot();
  [alice, bob, carol] = await Promise.all([registerUser(ctx, 'alice'), registerUser(ctx, 'bob'), registerUser(ctx, 'carol')]);
});
afterAll(() => shutdown(ctx));

describe('messages', () => {
  it('assigns dense, strictly increasing seqs under 50 concurrent sends', async () => {
    const id = await createDirect(ctx, alice, bob);
    const sends = Array.from({ length: 50 }, (_, i) => sendText(ctx, i % 2 ? alice : bob, id, `m${i}`));
    const msgs = await Promise.all(sends);
    const seqs = msgs.map((m) => m.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    const conv = await ctx.api.get(`/api/v1/conversations/${id}`).set(bearer(alice)).expect(200);
    expect(conv.body.data.headSeq).toBe(50);
    expect(conv.body.data.lastMessage.seq).toBe(50);
    // HLC order agrees with seq order within the conversation
    const byHlc = [...msgs].sort((a, b) => (a.hlc < b.hlc ? -1 : 1)).map((m) => m.seq);
    expect(byHlc).toEqual(seqs);
  });

  it('is idempotent on clientMsgId: a retry returns the original message and seq', async () => {
    const id = await createDirect(ctx, alice, carol);
    const clientMsgId = uuid();
    const first = await sendText(ctx, alice, id, 'once', clientMsgId);
    const retry = await sendText(ctx, alice, id, 'once (retried)', clientMsgId);
    expect(retry.id).toBe(first.id);
    expect(retry.seq).toBe(first.seq);
    expect(retry.text).toBe('once');
    const concurrent = await Promise.all([sendText(ctx, alice, id, 'race', uuid()), ...Array.from({ length: 5 }, () => sendText(ctx, carol, id, 'dup', 'd1b5b9d2-0d6a-4a5a-9f2e-0e2a3d4b5c6f'))]);
    expect(new Set(concurrent.slice(1).map((m) => m.id)).size).toBe(1);
    const history = await ctx.api.get(`/api/v1/conversations/${id}/messages`).set(bearer(alice)).expect(200);
    expect(history.body.data.items).toHaveLength(3);
  });

  it('pages history backwards and catches up forwards', async () => {
    const id = await createDirect(ctx, bob, carol);
    for (let i = 1; i <= 7; i++) await sendText(ctx, bob, id, `h${i}`);
    const latest = await ctx.api.get(`/api/v1/conversations/${id}/messages?limit=3`).set(bearer(carol)).expect(200);
    expect(latest.body.data.items.map((m: Message) => m.seq)).toEqual([5, 6, 7]);
    expect(latest.body.data.hasMore).toBe(true);
    expect(latest.body.data.headSeq).toBe(7);
    const older = await ctx.api.get(`/api/v1/conversations/${id}/messages?limit=3&beforeSeq=5`).set(bearer(carol)).expect(200);
    expect(older.body.data.items.map((m: Message) => m.seq)).toEqual([2, 3, 4]);
    const oldest = await ctx.api.get(`/api/v1/conversations/${id}/messages?limit=3&beforeSeq=2`).set(bearer(carol)).expect(200);
    expect(oldest.body.data.items.map((m: Message) => m.seq)).toEqual([1]);
    expect(oldest.body.data.hasMore).toBe(false);
    const catchUp = await ctx.api.get(`/api/v1/conversations/${id}/messages?afterSeq=4&limit=2`).set(bearer(carol)).expect(200);
    expect(catchUp.body.data.items.map((m: Message) => m.seq)).toEqual([5, 6]);
    expect(catchUp.body.data.hasMore).toBe(true);
    await ctx.api.get(`/api/v1/conversations/${id}/messages?afterSeq=1&beforeSeq=3`).set(bearer(carol)).expect(400);
  });

  it('enforces encryption policy per conversation', async () => {
    const plain = await createDirect(ctx, alice, bob);
    const secure = await createGroup(ctx, alice, [bob], 'secure');
    // make the group encrypted via creation flag
    const enc = (await ctx.api.post('/api/v1/conversations').set(bearer(alice)).send({ kind: 'group', name: 'E2EE', participantIds: [bob.user.id], encrypted: true }).expect(201)).body.data.id;
    const payload = { v: 1, suite: 'x3dh-dr-xchacha20-v1', header: 'aGVhZGVy', ciphertext: 'Y2lwaGVy' };

    const r1 = await ctx.api.post(`/api/v1/conversations/${enc}/messages`).set(bearer(alice)).send({ kind: 'text', text: 'leak', clientMsgId: uuid() }).expect(422);
    expect(r1.body.error.code).toBe('ENCRYPTION_REQUIRED');
    const r2 = await ctx.api.post(`/api/v1/conversations/${plain}/messages`).set(bearer(alice)).send({ kind: 'encrypted', encrypted: payload, clientMsgId: uuid() }).expect(403);
    expect(r2.body.error.code).toBe('PLAINTEXT_NOT_ALLOWED');
    const ok = await ctx.api.post(`/api/v1/conversations/${enc}/messages`).set(bearer(alice)).send({ kind: 'encrypted', encrypted: payload, clientMsgId: uuid() }).expect(201);
    expect(ok.body.data.text).toBeNull();
    expect(ok.body.data.encrypted).toEqual(payload);
    const conv = await ctx.api.get(`/api/v1/conversations/${enc}`).set(bearer(bob)).expect(200);
    expect(conv.body.data.lastMessage.text).toBeNull();
    expect(secure).toBeTypeOf('string');
  });

  it('edit and delete follow sender/admin rules and deleted messages lose their content', async () => {
    const id = await createGroup(ctx, alice, [bob, carol]);
    const m = await sendText(ctx, bob, id, 'original');
    expect((await ctx.api.patch(`/api/v1/messages/${m.id}`).set(bearer(carol)).send({ text: 'hijack' }).expect(403)).body.error.code).toBe('FORBIDDEN');
    const edited = await ctx.api.patch(`/api/v1/messages/${m.id}`).set(bearer(bob)).send({ text: 'edited' }).expect(200);
    expect(edited.body.data.text).toBe('edited');
    expect(edited.body.data.editedAt).toBeTypeOf('string');
    // carol (member) cannot delete bob's message; alice (owner) can
    expect((await ctx.api.delete(`/api/v1/messages/${m.id}`).set(bearer(carol)).expect(403)).body.error.code).toBe('FORBIDDEN');
    await ctx.api.delete(`/api/v1/messages/${m.id}`).set(bearer(alice)).expect(200);
    const history = await ctx.api.get(`/api/v1/conversations/${id}/messages`).set(bearer(carol)).expect(200);
    const deleted = history.body.data.items.find((x: Message) => x.id === m.id) as Message;
    expect(deleted.deletedAt).toBeTypeOf('string');
    expect(deleted.text).toBeNull();
    expect(deleted.seq).toBe(m.seq); // tombstone keeps its slot so seqs stay dense
    expect((await ctx.api.patch(`/api/v1/messages/${m.id}`).set(bearer(bob)).send({ text: 'zombie' }).expect(409)).body.error.code).toBe('MESSAGE_IMMUTABLE');
  });

  it('toggles reactions and validates replyTo', async () => {
    const id = await createDirect(ctx, alice, bob);
    const m = await sendText(ctx, alice, id, 'react to me');
    const on = await ctx.api.post(`/api/v1/messages/${m.id}/reactions`).set(bearer(bob)).send({ emoji: '👍' }).expect(200);
    expect(on.body.data.reactions).toEqual([{ emoji: '👍', userIds: [bob.user.id] }]);
    const off = await ctx.api.post(`/api/v1/messages/${m.id}/reactions`).set(bearer(bob)).send({ emoji: '👍' }).expect(200);
    expect(off.body.data.reactions).toEqual([]);
    const reply = await ctx.api.post(`/api/v1/conversations/${id}/messages`).set(bearer(bob)).send({ kind: 'text', text: 'reply', clientMsgId: uuid(), replyTo: m.id }).expect(201);
    expect(reply.body.data.replyTo).toBe(m.id);
    const other = await createDirect(ctx, alice, carol);
    const bad = await ctx.api.post(`/api/v1/conversations/${other}/messages`).set(bearer(alice)).send({ kind: 'text', text: 'x', clientMsgId: uuid(), replyTo: m.id }).expect(400);
    expect(bad.body.error.details.replyTo).toBe('invalid');
  });

  it('searches plaintext across the caller’s conversations only', async () => {
    const mine = await createDirect(ctx, alice, bob);
    const theirs = await createDirect(ctx, bob, carol);
    await sendText(ctx, alice, mine, 'the quantum sequencer paper');
    await sendText(ctx, bob, theirs, 'quantum gossip you cannot see');
    const res = await ctx.api.get('/api/v1/messages/search?q=quantum').set(bearer(alice)).expect(200);
    expect(res.body.data.map((m: Message) => m.conversationId)).toEqual([mine]);
    expect((await ctx.api.get(`/api/v1/messages/search?q=quantum&conversationId=${theirs}`).set(bearer(alice)).expect(403)).body.error.code).toBe('NOT_A_PARTICIPANT');
  });
});
