import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ErrorCode, type ApiResponse } from '@chatverse/protocol';
import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import { requestIdOf } from './requestId.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(ErrorCode.NOT_FOUND, `No route for ${req.method} ${req.path}`));
};

/** Translate every failure into the ApiResponse envelope with a stable code. */
export function errorHandler(deps: Pick<Deps, 'logger' | 'env'>): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    const requestId = requestIdOf(req);
    let appErr: AppError;
    if (err instanceof AppError) {
      appErr = err;
    } else if (err instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) fields[issue.path.join('.') || '_'] = issue.message;
      appErr = new AppError(ErrorCode.VALIDATION_ERROR, 'Request failed validation', { fields });
    } else if (isBodyParserError(err)) {
      appErr =
        err.type === 'entity.too.large'
          ? new AppError(ErrorCode.PAYLOAD_TOO_LARGE)
          : new AppError(ErrorCode.VALIDATION_ERROR, 'Malformed request body');
    } else {
      deps.logger.error({ err, requestId, path: req.path }, 'unhandled error');
      appErr = new AppError(
        ErrorCode.INTERNAL,
        deps.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : String((err as Error)?.message ?? err),
      );
    }
    if (appErr.status >= 500) deps.logger.error({ err: appErr, requestId }, appErr.message);
    const body: ApiResponse<never> = { ok: false, error: appErr.toApiError(requestId) };
    res.status(appErr.status).json(body);
  };
}

function isBodyParserError(err: unknown): err is { type: string; status: number } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    typeof (err as { type: unknown }).type === 'string' &&
    'status' in err
  );
}
