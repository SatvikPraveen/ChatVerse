import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiResponse } from '@chatverse/protocol';

export function ok<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { ok: true, data };
  res.status(status).json(body);
}

/** Wrap an async handler so rejections reach the error handler (Express 4 does not do this). */
export function wrap(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** `req.auth` is guaranteed by `requireAuth`; this narrows it for handlers. */
export function authOf(req: Request): { userId: string; sessionId: string; deviceId: string } {
  if (!req.auth) throw new Error('route is missing requireAuth');
  return req.auth;
}
