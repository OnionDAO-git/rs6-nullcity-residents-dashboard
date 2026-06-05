import { describe, expect, test } from 'bun:test';
import { cityConfigFromEnv } from './config';
import { createLandingSessionAuthenticator } from './landing-session';

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
