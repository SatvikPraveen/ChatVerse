import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthResponse, PreKeyBundle } from '@chatverse/protocol';
import { bearer, boot, registerUser, shutdown, type TestContext } from './helpers.js';

let ctx: TestContext;
let alice: AuthResponse;
let bob: AuthResponse;

const b64 = (n: number, seed = 'A') => seed.repeat(n);

function bundle(deviceId: string, opkCount: number) {
  return {
    deviceId,
    identityKey: b64(43, 'I'),
    signingKey: b64(43, 'S'),
    signedPreKey: { id: 1, publicKey: b64(43, 'P'), signature: b64(86, 'G') },
    oneTimePreKeys: Array.from({ length: opkCount }, (_, i) => ({ id: i + 2, publicKey: b64(43, 'O') })),
  };
}

beforeAll(async () => {
  ctx = await boot();
  [alice, bob] = await Promise.all([registerUser(ctx, 'alice'), registerUser(ctx, 'bob')]);
});
afterAll(() => shutdown(ctx));

describe('keys', () => {
  it('publishes a bundle and hands out each one-time pre-key exactly once, even under concurrency', async () => {
    await ctx.api.put('/api/v1/keys/bundle').set(bearer(bob)).send(bundle('bob-device-01', 5)).expect(200);
    expect((await ctx.api.get('/api/v1/keys/count?deviceId=bob-device-01').set(bearer(bob)).expect(200)).body.data.oneTimePreKeys).toBe(5);

    const fetches = await Promise.all(Array.from({ length: 8 }, () => ctx.api.get(`/api/v1/keys/bundle/${bob.user.id}`).set(bearer(alice)).expect(200)));
    const bundles = fetches.map((f) => f.body.data as PreKeyBundle);
    const opkIds = bundles.map((b) => b.oneTimePreKey?.id ?? null);
    const handedOut = opkIds.filter((x): x is number => x !== null);
    expect(new Set(handedOut).size).toBe(5); // all five keys used, none twice
    expect(opkIds.filter((x) => x === null)).toHaveLength(3); // the rest degrade gracefully
    expect(bundles[0]!.signedPreKey.signature).toBe(b64(86, 'G'));
    expect((await ctx.api.get('/api/v1/keys/count?deviceId=bob-device-01').set(bearer(bob)).expect(200)).body.data.oneTimePreKeys).toBe(0);
  });

  it('replenishes one-time pre-keys and caps them', async () => {
    const more = { deviceId: 'bob-device-01', oneTimePreKeys: Array.from({ length: 3 }, (_, i) => ({ id: 100 + i, publicKey: b64(43, 'Q') })) };
    expect((await ctx.api.post('/api/v1/keys/one-time').set(bearer(bob)).send(more).expect(200)).body.data.oneTimePreKeys).toBe(3);
    expect((await ctx.api.get(`/api/v1/keys/bundle/${bob.user.id}`).set(bearer(alice)).expect(200)).body.data.oneTimePreKey.id).toBe(100);
  });

  it('prefers the most recently active device and 404s for users without keys', async () => {
    await ctx.api.put('/api/v1/keys/bundle').set(bearer(bob)).send(bundle('bob-device-02', 1)).expect(200);
    expect((await ctx.api.get(`/api/v1/keys/bundle/${bob.user.id}`).set(bearer(alice)).expect(200)).body.data.deviceId).toBe('bob-device-02');
    expect((await ctx.api.get(`/api/v1/keys/bundle/${bob.user.id}?deviceId=bob-device-01`).set(bearer(alice)).expect(200)).body.data.deviceId).toBe('bob-device-01');
    expect((await ctx.api.get(`/api/v1/keys/bundle/${alice.user.id}`).set(bearer(bob)).expect(404)).body.error.code).toBe('NOT_FOUND');
    await ctx.api.put('/api/v1/keys/bundle').set(bearer(bob)).send({ ...bundle('bad', 0), identityKey: 'not base64url!' }).expect(400);
  });
});
