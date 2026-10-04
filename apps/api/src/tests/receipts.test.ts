import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthResponse, Participant } from '@chatverse/protocol';
import {
  bearer,
  boot,
  createDirect,
  registerUser,
  sendText,
  shutdown,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let alice: AuthResponse;
let bob: AuthResponse;

beforeAll(async () => {
  ctx = await boot();
  [alice, bob] = await Promise.all([registerUser(ctx, 'alice'), registerUser(ctx, 'bob')]);
});
afterAll(() => shutdown(ctx));

async function watermarks(id: string, who: AuthResponse, userId: string): Promise<Participant> {
  const res = await ctx.api.get(`/api/v1/conversations/${id}`).set(bearer(who)).expect(200);
  return res.body.data.participants.find((p: Participant) => p.userId === userId);
}

describe('receipts', () => {
  it('read watermarks are monotonic, clamped to headSeq and imply delivery', async () => {
    const id = await createDirect(ctx, alice, bob);
    for (let i = 0; i < 5; i++) await sendText(ctx, alice, id, `m${i}`);

    const r1 = await ctx.api
      .post(`/api/v1/conversations/${id}/read`)
      .set(bearer(bob))
      .send({ seq: 3 })
      .expect(200);
    expect(r1.body.data).toEqual({
      conversationId: id,
      userId: bob.user.id,
      lastDeliveredSeq: 3,
      lastReadSeq: 3,
    });

    // Going backwards is a no-op (returns null, nothing broadcast)
    const r2 = await ctx.api
      .post(`/api/v1/conversations/${id}/read`)
      .set(bearer(bob))
      .send({ seq: 1 })
      .expect(200);
    expect(r2.body.data).toBeNull();
    expect((await watermarks(id, alice, bob.user.id)).lastReadSeq).toBe(3);

    // Claims beyond the head are clamped
    const r3 = await ctx.api
      .post(`/api/v1/conversations/${id}/read`)
      .set(bearer(bob))
      .send({ seq: 999 })
      .expect(200);
    expect(r3.body.data.lastReadSeq).toBe(5);
    expect(r3.body.data.lastDeliveredSeq).toBe(5);
  });

  it('rejects receipts from non-participants', async () => {
    const carol = await registerUser(ctx, 'carol');
    const id = await createDirect(ctx, alice, bob);
    expect(
      (
        await ctx.api
          .post(`/api/v1/conversations/${id}/read`)
          .set(bearer(carol))
          .send({ seq: 1 })
          .expect(403)
      ).body.error.code,
    ).toBe('NOT_A_PARTICIPANT');
  });
});
