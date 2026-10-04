import type { RequestHandler } from 'express';
import { ErrorCode } from '@chatverse/protocol';
import { AppError } from '../../lib/errors.js';
import type { TokenService } from '../../services/tokens.js';

/** Bearer access-token authentication. Populates `req.auth`. */
export function requireAuth(tokens: TokenService): RequestHandler {
  return (req, _res, next) => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) return next(new AppError(ErrorCode.UNAUTHENTICATED));
    try {
      const claims = tokens.verifyAccess(header.slice(7).trim());
      req.auth = { userId: claims.sub, sessionId: claims.sid, deviceId: claims.did };
      next();
    } catch (err) {
      next(err);
    }
  };
}
