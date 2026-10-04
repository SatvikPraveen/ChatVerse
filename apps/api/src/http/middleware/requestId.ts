import type { RequestHandler } from 'express';
import { uuid } from '../../lib/ids.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; sessionId: string; deviceId: string };
    }
  }
}

/** Propagate or mint an X-Request-Id so logs, errors and metrics can be correlated. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  req.id = incoming && /^[A-Za-z0-9_-]{8,128}$/.test(incoming) ? incoming : uuid();
  res.setHeader('X-Request-Id', String(req.id));
  next();
};

export function requestIdOf(req: { id?: unknown }): string | undefined {
  return typeof req.id === 'string' || typeof req.id === 'number' ? String(req.id) : undefined;
}
