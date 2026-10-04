import type { RequestHandler } from 'express';
import { ErrorCode } from '@chatverse/protocol';
import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';

/**
 * Fixed-window rate limit keyed by user (when authenticated) or client IP, shared across nodes via
 * Redis. Degrades to an in-memory window if Redis fails so an outage never turns into an open gate
 * or a closed one. Emits the IETF `RateLimit-*` headers.
 */
export function rateLimit(
  deps: Pick<Deps, 'redis' | 'env' | 'logger'>,
  opts: { windowSec?: number; max?: number; scope?: string } = {},
): RequestHandler {
  const windowSec = opts.windowSec ?? deps.env.RATE_LIMIT_WINDOW_SEC;
  const max = opts.max ?? deps.env.RATE_LIMIT_MAX;
  const scope = opts.scope ?? 'http';
  const memory = new Map<string, { count: number; resetAt: number }>();

  async function hit(id: string): Promise<{ count: number; resetSec: number }> {
    const windowId = Math.floor(Date.now() / 1000 / windowSec);
    const key = `rl:${scope}:${id}:${windowId}`;
    const resetSec = (windowId + 1) * windowSec - Math.floor(Date.now() / 1000);
    try {
      const [[, count]] = (await deps.redis.client
        .multi()
        .incr(key)
        .expire(key, windowSec + 1)
        .exec()) as [[null, number], unknown];
      return { count, resetSec };
    } catch (err) {
      deps.logger.warn({ err }, 'rate limiter: redis unavailable, using memory window');
      const now = Date.now();
      const entry = memory.get(key);
      if (!entry || entry.resetAt <= now) {
        memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
        if (memory.size > 10_000)
          for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
        return { count: 1, resetSec };
      }
      entry.count += 1;
      return { count: entry.count, resetSec };
    }
  }

  return async (req, res, next) => {
    const id = req.auth?.userId ?? req.ip ?? 'unknown';
    const { count, resetSec } = await hit(id);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - count)));
    res.setHeader('RateLimit-Reset', String(resetSec));
    if (count > max) {
      res.setHeader('Retry-After', String(resetSec));
      return next(
        new AppError(ErrorCode.RATE_LIMITED, 'Too many requests', {
          retryAfterMs: resetSec * 1000,
          limit: max,
          windowSec,
        }),
      );
    }
    next();
  };
}
