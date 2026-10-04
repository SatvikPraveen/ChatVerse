import { ERROR_HTTP_STATUS, ErrorCode, type ApiError } from '@chatverse/protocol';

/** Application error carrying a stable protocol code. Everything thrown on purpose is one of these. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message ?? defaultMessage(code));
    this.name = 'AppError';
    this.status = ERROR_HTTP_STATUS[code];
  }

  toApiError(requestId?: string): ApiError {
    const out: ApiError = { code: this.code, message: this.message };
    if (this.details) out.details = this.details;
    if (requestId) out.requestId = requestId;
    return out;
  }
}

function defaultMessage(code: ErrorCode): string {
  switch (code) {
    case ErrorCode.NOT_FOUND:
      return 'Resource not found';
    case ErrorCode.UNAUTHENTICATED:
      return 'Authentication required';
    case ErrorCode.FORBIDDEN:
      return 'You are not allowed to do that';
    case ErrorCode.NOT_A_PARTICIPANT:
      return 'You are not a participant of this conversation';
    case ErrorCode.RATE_LIMITED:
      return 'Too many requests';
    case ErrorCode.VALIDATION_ERROR:
      return 'Request failed validation';
    case ErrorCode.INVALID_CREDENTIALS:
      return 'Invalid email or password';
    default:
      return code.toLowerCase().replace(/_/g, ' ');
  }
}

export const notFound = (what = 'Resource'): AppError => new AppError(ErrorCode.NOT_FOUND, `${what} not found`);
export const forbidden = (message?: string): AppError => new AppError(ErrorCode.FORBIDDEN, message);

/** MongoDB duplicate-key error (E11000). */
export function isDuplicateKeyError(err: unknown): err is { code: 11000; keyPattern?: Record<string, number> } {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}
