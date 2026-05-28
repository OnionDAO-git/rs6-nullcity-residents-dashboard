import { afterEach, describe, expect, test } from 'bun:test';
import { CityApiError, cityApi, setCityCsrfToken } from './city-api';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  setCityCsrfToken(undefined);
});

describe('cityApi', () => {
  test('sends CSRF only on mutating requests', async () => {
    const calls: Array<{ path: string; headers: Headers; method: string }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        path: String(input),
        headers: new Headers(init?.headers),
        method: init?.method || 'GET',
      });
      return new Response(JSON.stringify(input === '/api/session' ? { authenticated: false, loginUrl: '/login' } : { ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    setCityCsrfToken('csrf-123');
    await cityApi.session();
    await cityApi.syncCheckins();

    expect(calls[0]?.path).toBe('/api/session');
    expect(calls[0]?.headers.get('x-csrf-token')).toBeNull();
    expect(calls[1]?.path).toBe('/api/points/sync-checkins');
    expect(calls[1]?.method).toBe('POST');
    expect(calls[1]?.headers.get('x-csrf-token')).toBe('csrf-123');
  });

  test('turns unauthenticated responses into login-aware errors', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'unauthenticated', loginUrl: '/login?returnTo=%2Fprofile' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    await expect(cityApi.profile()).rejects.toMatchObject({
      name: 'CityApiError',
      status: 401,
      message: 'unauthenticated',
      loginUrl: '/login?returnTo=%2Fprofile',
    } satisfies Partial<CityApiError>);
  });
});
