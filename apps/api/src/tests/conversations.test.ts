import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthResponse } from '@chatverse/protocol';
import {
  bearer,
  boot,
  createGroup,
  registerUser,
  sendText,
  shutdown,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let alice: AuthResponse;
let bob: AuthResponse;
let carol: AuthResponse;

beforeAll(async () => {
  ctx = await boot();
  [alice, bob, carol] = await Promise.all([
    registerUser(ctx, 'alice'),
    registerUser(ctx, 'bob'),
    registerUser(ctx, 'carol'),
  ]);
});
afterAll(() => shutdown(ctx));

describe('conversations', () => {
  it('creating a direct conversation is idempotent from either side', async () => {
    const first = await ctx.api
      .post('/api/v1/conversations')
      .set(bearer(alice))
      .send({ kind: 'direct', participantIds: [bob.user.id] })
      .expect(201);
    const again = await ctx.api
      .post('/api/v1/conversations')
      .set(bearer(bob))
      .send({ kind: 'direct', participantIds: [alice.user.id] })
      .expect(201);
    expect(again.body.data.id).toBe(first.body.data.id);
    expect(first.body.data.participants).toHaveLength(2);
    expect(first.body.data.headSeq).toBe(0);
  });

  it('survives a concurrent double-create of the same direct conversation', async () => {
    const [a, b] = await Promise.all([
      ctx.api
        .post('/api/v1/conversations')
        .set(bearer(alice))
        .send({ kind: 'direct', participantIds: [carol.user.id] }),
      ctx.api
        .post('/api/v1/conversations')
        .set(bearer(carol))
        .send({ kind: 'direct', participantIds: [alice.user.id] }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.data.id).toBe(b.body.data.id);
  });

  it('rejects unknown participants and direct conversations with self only', async () => {
    const r = await ctx.api
      .post('/api/v1/conversations')
      .set(bearer(alice))
      .send({ kind: 'direct', participantIds: ['f'.repeat(24)] })
      .expect(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
    const self = await ctx.api
      .post('/api/v1/conversations')
      .set(bearer(alice))
      .send({ kind: 'direct', participantIds: [alice.user.id] })
      .expect(400);
    expect(self.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('enforces roles for group management', async () => {
    const id = await createGroup(ctx, alice, [bob]);
    // member cannot rename or add
    expect(
      (
        await ctx.api
          .patch(`/api/v1/conversations/${id}`)
          .set(bearer(bob))
          .send({ name: 'Nope' })
          .expect(403)
      ).body.error.code,
    ).toBe('FORBIDDEN');
    expect(
      (
        await ctx.api
          .post(`/api/v1/conversations/${id}/participants`)
          .set(bearer(bob))
          .send({ userIds: [carol.user.id] })
          .expect(403)
      ).body.error.code,
    ).toBe('FORBIDDEN');
    // non-member cannot read
    expect(
      (await ctx.api.get(`/api/v1/conversations/${id}`).set(bearer(carol)).expect(403)).body.error
        .code,
    ).toBe('NOT_A_PARTICIPANT');
    // owner can do both
    const renamed = await ctx.api
      .patch(`/api/v1/conversations/${id}`)
      .set(bearer(alice))
      .send({ name: 'Renamed', topic: 'T' })
      .expect(200);
    expect(renamed.body.data.name).toBe('Renamed');
    const added = await ctx.api
      .post(`/api/v1/conversations/${id}/participants`)
      .set(bearer(alice))
      .send({ userIds: [carol.user.id] })
      .expect(200);
    expect(added.body.data.participants.map((p: { userId: string }) => p.userId)).toContain(
      carol.user.id,
    );
    // member cannot remove another member, but may remove themself
    expect(
      (
        await ctx.api
          .delete(`/api/v1/conversations/${id}/participants/${bob.user.id}`)
          .set(bearer(carol))
          .expect(403)
      ).body.error.code,
    ).toBe('FORBIDDEN');
    await ctx.api
      .delete(`/api/v1/conversations/${id}/participants/${carol.user.id}`)
      .set(bearer(carol))
      .expect(200);
    // owner cannot be removed by an admin-less member; owner leaving hands ownership over
    await ctx.api.post(`/api/v1/conversations/${id}/leave`).set(bearer(alice)).expect(200);
    const after = await ctx.api.get(`/api/v1/conversations/${id}`).set(bearer(bob)).expect(200);
    expect(after.body.data.participants).toEqual([
      expect.objectContaining({ userId: bob.user.id, role: 'owner' }),
    ]);
  });

  it('direct conversations cannot be edited or left', async () => {
    const id = (
      await ctx.api
        .post('/api/v1/conversations')
        .set(bearer(alice))
        .send({ kind: 'direct', participantIds: [bob.user.id] })
    ).body.data.id;
    await ctx.api
      .patch(`/api/v1/conversations/${id}`)
      .set(bearer(alice))
      .send({ name: 'x' })
      .expect(403);
    await ctx.api.post(`/api/v1/conversations/${id}/leave`).set(bearer(alice)).expect(403);
  });

  it('lists conversations most-recently-active first with stable cursor pagination', async () => {
    const dave = await registerUser(ctx, 'dave');
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await createGroup(ctx, dave, [alice], `g${i}`));
    await sendText(ctx, dave, ids[0]!, 'bump'); // activity moves g0 to the top

    const p1 = await ctx.api.get('/api/v1/conversations?limit=2').set(bearer(dave)).expect(200);
    expect(p1.body.data.items.map((c: { id: string }) => c.id)).toEqual([ids[0], ids[4]]);
    expect(p1.body.data.nextCursor).toBeTypeOf('string');
    const p2 = await ctx.api
      .get(`/api/v1/conversations?limit=2&cursor=${encodeURIComponent(p1.body.data.nextCursor)}`)
      .set(bearer(dave))
      .expect(200);
    expect(p2.body.data.items.map((c: { id: string }) => c.id)).toEqual([ids[3], ids[2]]);
    const p3 = await ctx.api
      .get(`/api/v1/conversations?limit=2&cursor=${encodeURIComponent(p2.body.data.nextCursor)}`)
      .set(bearer(dave))
      .expect(200);
    expect(p3.body.data.items.map((c: { id: string }) => c.id)).toEqual([ids[1]]);
    expect(p3.body.data.nextCursor).toBeNull();
    expect(
      (await ctx.api.get('/api/v1/conversations?cursor=garbage').set(bearer(dave)).expect(400)).body
        .error.code,
    ).toBe('VALIDATION_ERROR');
  });
});
