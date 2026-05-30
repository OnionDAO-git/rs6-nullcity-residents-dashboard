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

  test('does not auto-enable the admin control bridge from generic controller env', () => {
    const config = cityConfigFromEnv({
      CONTROLLER_CITY_HTTP_PORT: '8787',
      CONTROLLER_CITY_HTTP_TOKEN: 'operator-token',
    });

    expect(config.nullcityControlBaseUrl).toBeUndefined();
    expect(config.nullcityControlToken).toBeUndefined();
  });
});
