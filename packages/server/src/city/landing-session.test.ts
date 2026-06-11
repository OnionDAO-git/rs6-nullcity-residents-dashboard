import { describe, expect, test } from 'bun:test';
import { cityConfigFromEnv } from './config';
import {
  HttpLandingSessionReader,
  createLandingSessionAuthenticator,
  defaultLandingSessionReader,
} from './landing-session';

describe('landing session login URL', () => {
  test('uses the landing dev auth endpoint and canonical localhost return URLs when dev auth is enabled', () => {
    const config = cityConfigFromEnv({
      LANDING_AUTH_BASE_URL: 'http://localhost:5173',
      CITY_PUBLIC_BASE_URL: 'http://127.0.0.1:5174',
      CITY_DEV_AUTH_ENABLED: 'true',
      CITY_DEV_AUTH_EMAIL: 'james@null.city',
    });

    const auth = createLandingSessionAuthenticator(config, undefined);
    const login = new URL(auth.loginUrl(new URL('http://127.0.0.1:5174/api/session')));

    expect(login.origin).toBe('http://localhost:5173');
    expect(login.pathname).toBe('/api/dev/auth/login');
    expect(login.searchParams.get('email')).toBe('james@null.city');
    expect(login.searchParams.get('returnTo')).toBe('http://localhost:5174/api/session');
  });

  test('keeps the normal landing login path when dev auth is disabled', () => {
    const config = cityConfigFromEnv({
      LANDING_AUTH_BASE_URL: 'https://oniondao.dev',
      CITY_PUBLIC_BASE_URL: 'https://city.oniondao.dev',
    });

    const auth = createLandingSessionAuthenticator(config, undefined);
    const login = new URL(auth.loginUrl(new URL('https://city.oniondao.dev/api/session')));

    expect(login.origin).toBe('https://oniondao.dev');
    expect(login.pathname).toBe('/login');
    expect(login.searchParams.get('email')).toBeNull();
    expect(login.searchParams.get('returnTo')).toBe('https://city.oniondao.dev/api/session');
  });
});

type FetchCall = { url: string; init?: RequestInit };

function stubFetch(handler: (call: FetchCall) => Response | Promise<Response> | never): {
  fetchImpl: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return handler({ url, init });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('HttpLandingSessionReader', () => {
  test('returns a user for a valid cookie and forwards it to /api/public/session', async () => {
    const { fetchImpl, calls } = stubFetch(() =>
      Response.json({
        user: {
          id: 'user-123',
          email: 'james@null.city',
          name: 'James',
          handle: 'jamesc',
          avatarUrl: 'https://cdn.example/avatar.png',
          isAdmin: true,
          isStaff: false,
        },
      }),
    );
    const reader = new HttpLandingSessionReader({
      baseUrl: 'https://oniondao.dev',
      cookieName: 'session',
      fetchImpl,
    });

    const user = await reader.findUserBySessionToken('tok-abc');

    expect(user).toEqual({
      id: 'user-123',
      email: 'james@null.city',
      name: 'James',
      handle: 'jamesc',
      avatarUrl: 'https://cdn.example/avatar.png',
      isAdmin: true,
      // Landing's endpoint omits profile_claimed → defaults to false.
      profileClaimed: false,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://oniondao.dev/api/public/session');
    const cookie = new Headers(calls[0]?.init?.headers).get('cookie');
    expect(cookie).toBe('session=tok-abc');
  });

  test('returns null for an invalid/expired session ({ user: null }, HTTP 200)', async () => {
    const { fetchImpl } = stubFetch(() => Response.json({ user: null }));
    const reader = new HttpLandingSessionReader({
      baseUrl: 'https://oniondao.dev',
      cookieName: 'session',
      fetchImpl,
    });

    expect(await reader.findUserBySessionToken('expired')).toBeNull();
  });

  test('returns null on a non-2xx response', async () => {
    const { fetchImpl } = stubFetch(() => new Response('boom', { status: 500 }));
    const reader = new HttpLandingSessionReader({
      baseUrl: 'https://oniondao.dev',
      cookieName: 'session',
      fetchImpl,
    });

    expect(await reader.findUserBySessionToken('tok')).toBeNull();
  });

  test('fails closed (returns null) on a network error', async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    const reader = new HttpLandingSessionReader({
      baseUrl: 'https://oniondao.dev',
      cookieName: 'session',
      fetchImpl,
    });

    expect(await reader.findUserBySessionToken('tok')).toBeNull();
  });
});

describe('landing session reader selection', () => {
  test('uses the HTTP reader when LANDING_SESSION_MODE=api even with a DB url present', () => {
    const config = cityConfigFromEnv({
      LANDING_SESSION_MODE: 'api',
      LANDING_DATABASE_URL: 'postgres://ignored',
      LANDING_AUTH_BASE_URL: 'https://oniondao.dev',
    });
    expect(defaultLandingSessionReader(config)).toBeInstanceOf(HttpLandingSessionReader);
    expect(createLandingSessionAuthenticator(config).mode).toBe('landing-api');
  });

  test('uses the HTTP reader when LANDING_DATABASE_URL is unset (auto)', () => {
    const config = cityConfigFromEnv({ LANDING_AUTH_BASE_URL: 'https://oniondao.dev' });
    expect(defaultLandingSessionReader(config)).toBeInstanceOf(HttpLandingSessionReader);
    expect(createLandingSessionAuthenticator(config).mode).toBe('landing-api');
  });

  test('authenticates a request via the configured HTTP reader', async () => {
    const config = cityConfigFromEnv({
      LANDING_SESSION_MODE: 'api',
      LANDING_AUTH_BASE_URL: 'https://oniondao.dev',
    });
    const { fetchImpl } = stubFetch(() =>
      Response.json({ user: { id: 'u1', email: 'a@b.c', name: 'A', isAdmin: false } }),
    );
    const reader = new HttpLandingSessionReader({ baseUrl: config.landingAuthBaseUrl, cookieName: config.authCookieName, fetchImpl });
    const auth = createLandingSessionAuthenticator(config, reader);
    const result = await auth.authenticate(new Request('https://city.test/api/session', { headers: { cookie: 'session=tok' } }));
    expect(result.mode).toBe('landing-api');
    expect(result.user?.id).toBe('u1');
  });

  test('returns missing_cookie when no session cookie is present', async () => {
    const config = cityConfigFromEnv({ LANDING_SESSION_MODE: 'api', LANDING_AUTH_BASE_URL: 'https://oniondao.dev' });
    const reader = new HttpLandingSessionReader({ baseUrl: config.landingAuthBaseUrl, cookieName: config.authCookieName });
    const auth = createLandingSessionAuthenticator(config, reader);
    const result = await auth.authenticate(new Request('https://city.test/api/session'));
    expect(result.reason).toBe('missing_cookie');
    expect(result.user).toBeNull();
  });
});
