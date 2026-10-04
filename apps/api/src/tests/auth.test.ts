import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, boot, registerUser, shutdown, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await boot();
});
afterAll(() => shutdown(ctx));

describe('auth', () => {
  it('registers, returns tokens and rejects duplicates with stable codes', async () => {
    const res = await ctx.api
      .post('/api/v1/auth/register')
      .send({ username: 'alice', email: 'Alice@Example.com', password: 'a very long password', displayName: 'Alice' })
      .expect(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.user.email).toBe('alice@example.com');
    expect(res.body.data.accessToken).toBeTypeOf('string');
    expect(res.body.data.refreshToken).toBeTypeOf('string');
    expect(res.body.data).not.toHaveProperty('passwordHash');

    const dupEmail = await ctx.api.post('/api/v1/auth/register').send({ username: 'alice2', email: 'alice@example.com', password: 'a very long password', displayName: 'A' }).expect(409);
    expect(dupEmail.body.error.code).toBe('EMAIL_TAKEN');
    const dupUser = await ctx.api.post('/api/v1/auth/register').send({ username: 'alice', email: 'other@example.com', password: 'a very long password', displayName: 'A' }).expect(409);
    expect(dupUser.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('validates input and reports field errors', async () => {
    const res = await ctx.api.post('/api/v1/auth/register').send({ username: 'x', email: 'nope', password: 'short', displayName: '' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details.fields)).toEqual(expect.arrayContaining(['username', 'email', 'password', 'displayName']));
    expect(res.body.error.requestId).toBeTypeOf('string');
  });

  it('logs in with correct credentials and rejects wrong ones uniformly', async () => {
    await registerUser(ctx, 'bob');
    const email = (await ctx.api.post('/api/v1/auth/register').send({ username: 'bobby', email: 'bobby@example.com', password: 'correct horse battery staple', displayName: 'B' }).expect(201)).body.data.user.email;
    const ok = await ctx.api.post('/api/v1/auth/login').send({ email, password: 'correct horse battery staple' }).expect(200);
    expect(ok.body.data.user.username).toBe('bobby');
    const bad = await ctx.api.post('/api/v1/auth/login').send({ email, password: 'wrong password!!' }).expect(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
    const unknown = await ctx.api.post('/api/v1/auth/login').send({ email: 'ghost@example.com', password: 'wrong password!!' }).expect(401);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('protects routes and distinguishes missing from invalid tokens', async () => {
    expect((await ctx.api.get('/api/v1/users/me').expect(401)).body.error.code).toBe('UNAUTHENTICATED');
    expect((await ctx.api.get('/api/v1/users/me').set('Authorization', 'Bearer not.a.jwt').expect(401)).body.error.code).toBe('TOKEN_INVALID');
    const auth = await registerUser(ctx);
    expect((await ctx.api.get('/api/v1/users/me').set(bearer(auth)).expect(200)).body.data.id).toBe(auth.user.id);
  });

  it('rotates refresh tokens and detects reuse by revoking the whole family', async () => {
    const auth = await registerUser(ctx);
    const r1 = await ctx.api.post('/api/v1/auth/refresh').send({ refreshToken: auth.refreshToken }).expect(200);
    expect(r1.body.data.refreshToken).not.toBe(auth.refreshToken);
    expect(r1.body.data.accessToken).toBeTypeOf('string');

    // Replaying the retired token is reuse → family revoked.
    const reuse = await ctx.api.post('/api/v1/auth/refresh').send({ refreshToken: auth.refreshToken }).expect(401);
    expect(reuse.body.error.code).toBe('TOKEN_REUSED');
    // ...which also kills the legitimate successor.
    const victim = await ctx.api.post('/api/v1/auth/refresh').send({ refreshToken: r1.body.data.refreshToken }).expect(401);
    expect(victim.body.error.code).toBe('TOKEN_INVALID');
  });

  it('logout revokes the refresh token', async () => {
    const auth = await registerUser(ctx);
    await ctx.api.post('/api/v1/auth/logout').send({ refreshToken: auth.refreshToken }).expect(200);
    expect((await ctx.api.post('/api/v1/auth/refresh').send({ refreshToken: auth.refreshToken }).expect(401)).body.error.code).toBe('TOKEN_INVALID');
  });
});
