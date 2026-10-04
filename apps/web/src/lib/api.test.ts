import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, buildQuery, createApiClient } from './api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('createApiClient', () => {
  it('unwraps the envelope and sends the bearer token', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
      return jsonResponse(200, { ok: true, data: { hello: 'world' } });
    });
    const api = createApiClient({
      baseUrl: 'http://x/api/v1',
      fetchImpl,
      tokens: { getAccessToken: () => 'tok-1', refresh: async () => null },
    });
    await expect(api.get<{ hello: string }>('/ping', { query: { a: 1, b: undefined } })).resolves.toEqual({ hello: 'world' });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://x/api/v1/ping?a=1');
  });

  it('refreshes once on TOKEN_EXPIRED and retries with the new token', async () => {
    let token = 'expired';
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (auth === 'Bearer expired') {
        return jsonResponse(401, { ok: false, error: { code: 'TOKEN_EXPIRED', message: 'expired' } });
      }
      return jsonResponse(200, { ok: true, data: 'fresh-data' });
    });
    const refresh = vi.fn(async () => {
      token = 'fresh';
      return token;
    });
    const api = createApiClient({ baseUrl: 'http://x', fetchImpl, tokens: { getAccessToken: () => token, refresh } });
    // Two concurrent requests share a single refresh.
    const [a, b] = await Promise.all([api.get<string>('/a'), api.get<string>('/b')]);
    expect(a).toBe('fresh-data');
    expect(b).toBe('fresh-data');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('throws ApiClientError with the server code when refresh fails', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, { ok: false, error: { code: 'TOKEN_EXPIRED', message: 'expired' } }),
    );
    const api = createApiClient({
      baseUrl: 'http://x',
      fetchImpl,
      tokens: { getAccessToken: () => 't', refresh: async () => null },
    });
    await expect(api.get('/a')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED', status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps non-JSON failures to SERVICE_UNAVAILABLE and marks 4xx as permanent', async () => {
    const api = createApiClient({
      baseUrl: 'http://x',
      fetchImpl: async () => new Response('<html>', { status: 502 }),
      tokens: { getAccessToken: () => null, refresh: async () => null },
    });
    const err = await api.get('/a').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).code).toBe('SERVICE_UNAVAILABLE');
    expect((err as ApiClientError).isPermanent).toBe(false);
    expect(new ApiClientError('VALIDATION_ERROR', 'x', 400).isPermanent).toBe(true);
    expect(new ApiClientError('RATE_LIMITED', 'x', 429).isPermanent).toBe(false);
  });

  it('serialises query strings', () => {
    expect(buildQuery({ q: 'a b', n: 2, skip: null })).toBe('?q=a+b&n=2');
    expect(buildQuery()).toBe('');
  });
});
