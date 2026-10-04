import { ErrorCode, type ApiError, type ApiResponse } from '@chatverse/protocol';

/**
 * Typed REST client.
 *
 *  - unwraps the `ApiResponse` envelope and throws `ApiClientError` on `ok: false`
 *  - attaches the bearer token from a `TokenProvider`
 *  - on 401 TOKEN_EXPIRED it refreshes once (single-flight across concurrent requests) and retries
 *  - supports AbortSignal and query-string serialisation
 */

export class ApiClientError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  static fromApiError(error: ApiError, status: number): ApiClientError {
    return new ApiClientError(error.code, error.message, status, error.details, error.requestId);
  }

  /** Errors that will not succeed on retry with the same input. */
  get isPermanent(): boolean {
    return this.status >= 400 && this.status < 500 && this.code !== ErrorCode.RATE_LIMITED;
  }
}

export interface TokenProvider {
  getAccessToken(): string | null;
  /** Return a fresh access token, or null if the session cannot be refreshed. */
  refresh(): Promise<string | null>;
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  query?: Query;
  signal?: AbortSignal;
  /** Skip auth header + refresh (login/register). */
  anonymous?: boolean;
}

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
}

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function createApiClient(opts: {
  baseUrl: string;
  tokens: TokenProvider;
  fetchImpl?: typeof fetch;
}): ApiClient {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  let refreshing: Promise<string | null> | null = null;

  const refreshOnce = () => {
    refreshing ??= opts.tokens.refresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  };

  async function request<T>(method: string, path: string, body: unknown, options: RequestOptions, retried = false): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (!options.anonymous) {
      const token = opts.tokens.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    if (options.signal) init.signal = options.signal;
    const response = await fetchImpl(`${opts.baseUrl}${path}${buildQuery(options.query)}`, init);

    let payload: ApiResponse<T> | null = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text) as ApiResponse<T>;
      } catch {
        payload = null;
      }
    }

    if (payload?.ok) return payload.data;

    const error: ApiError = payload && !payload.ok
      ? payload.error
      : { code: response.ok ? ErrorCode.INTERNAL : ErrorCode.SERVICE_UNAVAILABLE, message: `HTTP ${response.status}` };

    if (response.status === 401 && error.code === ErrorCode.TOKEN_EXPIRED && !options.anonymous && !retried) {
      const fresh = await refreshOnce();
      if (fresh) return request<T>(method, path, body, options, true);
    }
    throw ApiClientError.fromApiError(error, response.status);
  }

  return {
    get: (path, options = {}) => request('GET', path, undefined, options),
    post: (path, body, options = {}) => request('POST', path, body, options),
    put: (path, body, options = {}) => request('PUT', path, body, options),
    patch: (path, body, options = {}) => request('PATCH', path, body, options),
    delete: (path, body, options = {}) => request('DELETE', path, body, options),
  };
}
