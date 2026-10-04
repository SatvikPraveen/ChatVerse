import { describe, expect, it } from 'vitest';
import { SOCKET_RATE_LIMITS } from '@chatverse/protocol';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';
import { AppError } from '../lib/errors.js';
import { SocketRateLimiter } from '../realtime/rateLimiter.js';
import { hashPassword, verifyPassword } from '../services/password.js';
import { loadEnv } from '../config/env.js';

describe('SocketRateLimiter', () => {
  it('allows `points` events per window then refills over time', () => {
    const limiter = new SocketRateLimiter();
    const { points, windowSec } = SOCKET_RATE_LIMITS.typing;
    let now = 1_000_000;
    for (let i = 0; i < points; i++) expect(limiter.consume('typing', now)).toBe(0);
    const wait = limiter.consume('typing', now);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual((windowSec * 1000) / points + 1);
    now += wait;
    expect(limiter.consume('typing', now)).toBe(0);
    // independent buckets per event
    expect(limiter.consume('message:send', now)).toBe(0);
  });
});

describe('cursor', () => {
  it('round-trips and rejects garbage', () => {
    const c = { t: new Date().toISOString(), id: 'a'.repeat(24) };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor(undefined)).toBeNull();
    expect(() => decodeCursor('zzz')).toThrow(AppError);
  });
});

describe('password hashing', () => {
  it('verifies the right password only and is salted', async () => {
    const h1 = await hashPassword('hunter2 hunter2');
    const h2 = await hashPassword('hunter2 hunter2');
    expect(h1).not.toBe(h2);
    expect(await verifyPassword('hunter2 hunter2', h1)).toBe(true);
    expect(await verifyPassword('hunter2 hunter3', h1)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
});

describe('env', () => {
  it('lists every problem at once and treats empty strings as unset', () => {
    expect(() => loadEnv({ MONGODB_URI: '', JWT_ACCESS_SECRET: 'short' })).toThrow(/MONGODB_URI[\s\S]*JWT_ACCESS_SECRET[\s\S]*JWT_REFRESH_SECRET/);
    const env = loadEnv({ MONGODB_URI: 'mongodb://x', JWT_ACCESS_SECRET: 'a'.repeat(32), JWT_REFRESH_SECRET: 'b'.repeat(32), CORS_ORIGINS: 'http://a, http://b', TRUST_PROXY: 'yes', REDIS_URL: '' });
    expect(env.CORS_ORIGINS).toEqual(['http://a', 'http://b']);
    expect(env.TRUST_PROXY).toBe(true);
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.PORT).toBe(4000);
  });
});
