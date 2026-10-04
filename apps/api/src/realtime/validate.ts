import type { ZodError, ZodTypeAny, z } from 'zod';
import { ErrorCode, SOCKET_RATE_LIMITS, type AckFn, type RateLimitedEvent } from '@chatverse/protocol';
import { AppError } from '../lib/errors.js';
import type { GatewayContext, AppSocket } from './types.js';
import { rateLimitedAck, SocketRateLimiter } from './rateLimiter.js';

type Handler<S extends ZodTypeAny, R> = (input: z.infer<S>, socket: AppSocket) => Promise<R>;

export interface EventBinder {
  /** Request/response event: validates, rate-limits, times, and always acknowledges. */
  ack<S extends ZodTypeAny, R>(event: string, schema: S, handler: Handler<S, R>): (raw: unknown, ack?: AckFn<R>) => void;
  /** Fire-and-forget event: failures are reported on `protocol:error`. */
  fire<S extends ZodTypeAny>(event: string, schema: S, handler: Handler<S, void>): (raw: unknown) => void;
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (isZodError(err)) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join('.') || '_'] = issue.message;
    return new AppError(ErrorCode.VALIDATION_ERROR, 'Event payload failed validation', { fields });
  }
  return new AppError(ErrorCode.INTERNAL, 'Unexpected server error');
}

function isZodError(err: unknown): err is ZodError {
  return typeof err === 'object' && err !== null && (err as { name?: string }).name === 'ZodError';
}

/**
 * Builds the per-socket event wrappers. Every handler gets the same treatment: zod validation of
 * the raw payload, token-bucket rate limiting, latency metrics, and translation of thrown errors
 * into the protocol's error envelope. Handlers never see unvalidated input.
 */
export function createBinder(ctx: GatewayContext, socket: AppSocket): EventBinder {
  const limiter = new SocketRateLimiter();
  const { metrics, logger } = ctx.deps;

  function limited(event: string): number {
    if (!(event in SOCKET_RATE_LIMITS)) return 0;
    const wait = limiter.consume(event as RateLimitedEvent);
    if (wait > 0) socket.emit('rate:limited', { event, retryAfterMs: wait });
    return wait;
  }

  function report(err: unknown, event: string): AppError {
    const appErr = toAppError(err);
    if (appErr.status >= 500) logger.error({ err, event, userId: socket.data.userId }, 'socket handler failed');
    return appErr;
  }

  return {
    ack<S extends ZodTypeAny, R>(event: string, schema: S, handler: Handler<S, R>) {
      return (raw: unknown, ack?: AckFn<R>): void => {
        const reply: AckFn<R> = typeof ack === 'function' ? ack : () => undefined;
        const end = metrics.socketEventDuration.startTimer({ event });
        const wait = limited(event);
        if (wait > 0) {
          end({ outcome: 'rate_limited' });
          reply(rateLimitedAck<R>(event, wait));
          return;
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          end({ outcome: 'invalid' });
          reply({ ok: false, error: toAppError(parsed.error).toApiError() });
          return;
        }
        handler(parsed.data, socket)
          .then((data) => {
            end({ outcome: 'ok' });
            reply({ ok: true, data });
          })
          .catch((err: unknown) => {
            end({ outcome: 'error' });
            reply({ ok: false, error: report(err, event).toApiError() });
          });
      };
    },

    fire<S extends ZodTypeAny>(event: string, schema: S, handler: Handler<S, void>) {
      return (raw: unknown): void => {
        const end = metrics.socketEventDuration.startTimer({ event });
        if (limited(event) > 0) {
          end({ outcome: 'rate_limited' });
          return;
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          end({ outcome: 'invalid' });
          socket.emit('protocol:error', toAppError(parsed.error).toApiError());
          return;
        }
        handler(parsed.data, socket)
          .then(() => end({ outcome: 'ok' }))
          .catch((err: unknown) => {
            end({ outcome: 'error' });
            socket.emit('protocol:error', report(err, event).toApiError());
          });
      };
    },
  };
}
