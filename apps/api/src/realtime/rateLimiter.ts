import { ErrorCode, SOCKET_RATE_LIMITS, type Ack, type RateLimitedEvent } from '@chatverse/protocol';
import { AppError } from '../lib/errors.js';

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * Per-socket token bucket, one bucket per event type, sized from the protocol's
 * SOCKET_RATE_LIMITS. A socket is local to one node, so an in-memory bucket is exact; no Redis
 * round-trip is needed on the hot path.
 */
export class SocketRateLimiter {
  private buckets = new Map<RateLimitedEvent, Bucket>();

  /** Returns 0 when allowed, otherwise the number of ms until the next token. */
  consume(event: RateLimitedEvent, now = Date.now()): number {
    const limit = SOCKET_RATE_LIMITS[event];
    const refillPerMs = limit.points / (limit.windowSec * 1000);
    const bucket = this.buckets.get(event) ?? { tokens: limit.points, updatedAt: now };
    bucket.tokens = Math.min(limit.points, bucket.tokens + (now - bucket.updatedAt) * refillPerMs);
    bucket.updatedAt = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.buckets.set(event, bucket);
      return 0;
    }
    this.buckets.set(event, bucket);
    return Math.ceil((1 - bucket.tokens) / refillPerMs);
  }
}

export function rateLimitedAck<T>(event: string, retryAfterMs: number): Ack<T> {
  return { ok: false, error: new AppError(ErrorCode.RATE_LIMITED, `Rate limit exceeded for ${event}`, { retryAfterMs }).toApiError() };
}
