import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, boot, registerUser, shutdown, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await boot();
});
afterAll(() => shutdown(ctx));

describe('health & metrics', () => {
  it('liveness and readiness report dependency status', async () => {
    const live = await ctx.api.get('/health/live').expect(200);
    expect(live.body).toMatchObject({ status: 'ok', nodeId: 'test-node' });
    const ready = await ctx.api.get('/health/ready').expect(200);
    expect(ready.body.status).toBe('ok');
    expect(ready.body.checks.mongodb.status).toBe('ok');
    expect(ready.body.checks.redis.status).toBe('ok');
    expect(ready.body.checks.mongodb.latencyMs).toBeTypeOf('number');
  });

  it('exposes Prometheus metrics with request and message counters', async () => {
    const auth = await registerUser(ctx);
    await ctx.api.get('/api/v1/users/me').set(bearer(auth)).expect(200);
    const res = await ctx.api.get('/metrics').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('http_request_duration_seconds_bucket');
    expect(res.text).toMatch(
      /http_request_duration_seconds_count\{[^}]*route="\/api\/v1\/users\/me"/,
    );
    expect(res.text).toContain('socket_connections');
    expect(res.text).toContain('messages_sent_total');
  });

  it('answers unknown routes with the error envelope and a request id', async () => {
    const res = await ctx.api.get('/nope').set('X-Request-Id', 'req-123456789').expect(404);
    expect(res.body).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: expect.any(String), requestId: 'req-123456789' },
    });
    expect(res.headers['x-request-id']).toBe('req-123456789');
  });

  it('applies the HTTP rate limit headers', async () => {
    const auth = await registerUser(ctx);
    const res = await ctx.api.get('/api/v1/users/me').set(bearer(auth)).expect(200);
    expect(res.headers['ratelimit-limit']).toBe('300');
    expect(Number(res.headers['ratelimit-remaining'])).toBeLessThan(300);
  });
});
