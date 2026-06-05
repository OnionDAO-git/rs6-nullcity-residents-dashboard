import { describe, expect, test } from 'bun:test';
import { cityConfigFromEnv } from './config';

describe('cityConfigFromEnv', () => {
  test('enables the Null City control bridge only from explicit dashboard bridge env', () => {
    const config = cityConfigFromEnv({
      NULLCITY_CITY_API_URL: 'http://controller.test/api/nullcity',
      NULLCITY_CITY_API_TOKEN: 'city-token',
    });

    expect(config.nullcityControlBaseUrl).toBe('http://controller.test/api/nullcity');
    expect(config.nullcityControlToken).toBe('city-token');
  });

  test('normalizes bare City API hosts to the controller Null City route prefix', () => {
    const config = cityConfigFromEnv({
      NULLCITY_CITY_API_URL: 'http://controller.test:43611',
      NULLCITY_CITY_API_TOKEN: 'city-token',
    });

    expect(config.nullcityControlBaseUrl).toBe('http://controller.test:43611/api/nullcity');
    expect(config.nullcityControlToken).toBe('city-token');
  });

  test('preserves explicitly prefixed City API hosts after trimming trailing slashes', () => {
    const config = cityConfigFromEnv({
      NULLCITY_CITY_API_URL: 'http://controller.test:43611/api/nullcity/',
      NULLCITY_CITY_API_TOKEN: 'city-token',
    });

    expect(config.nullcityControlBaseUrl).toBe('http://controller.test:43611/api/nullcity');
  });

  test('does not auto-enable the admin control bridge from generic controller env', () => {
    const config = cityConfigFromEnv({
      CONTROLLER_CITY_HTTP_PORT: '8787',
      CONTROLLER_CITY_HTTP_TOKEN: 'operator-token',
    });

    expect(config.nullcityControlBaseUrl).toBeUndefined();
    expect(config.nullcityControlToken).toBeUndefined();
  });

  test('enables dashboard dev auth only from explicit dev auth env', () => {
    const config = cityConfigFromEnv({
      DEV_AUTH_ENABLED: 'true',
      DEV_AUTH_DEFAULT_EMAIL: 'james@null.city',
    });

    expect(config.devAuthEnabled).toBe(true);
    expect(config.devAuthEmail).toBe('james@null.city');
  });
});
