import { describe, expect, test } from 'bun:test';
import { loadPrintBridgeConfig, redactCredentials } from './config';

describe('print bridge config', () => {
  test('loads FDM Monster config from env without hardcoded credentials', () => {
    const config = loadPrintBridgeConfig({
      PRINT_BRIDGE_ID: 'bridge-a',
      PRINT_BRIDGE_ADAPTER: 'fdm-monster',
      PRINT_BRIDGE_CITY_BASE_URL: 'https://city.test',
      PRINT_BRIDGE_CITY_TOKEN: 'city-secret',
      FDM_MONSTER_BASE_URL: 'http://127.0.0.1:4000',
      FDM_MONSTER_API_KEY: 'fdm-secret',
      FDM_MONSTER_PRINTER_ID: 'printer-42',
    });

    expect(config.bridgeId).toBe('bridge-a');
    expect(config.city).toEqual({ baseUrl: 'https://city.test', token: 'city-secret' });
    expect(config.adapters[0]).toMatchObject({
      kind: 'fdm-monster',
      baseUrl: 'http://127.0.0.1:4000',
      apiKey: 'fdm-secret',
      printerId: 'printer-42',
    });
  });

  test('redacts nested credential fields', () => {
    expect(redactCredentials({
      cityToken: 'secret',
      adapter: { apiKey: 'fdm-secret', baseUrl: 'http://127.0.0.1:4000' },
      list: [{ accessCode: 'bambu-secret' }],
    })).toEqual({
      cityToken: '[redacted]',
      adapter: { apiKey: '[redacted]', baseUrl: 'http://127.0.0.1:4000' },
      list: [{ accessCode: '[redacted]' }],
    });
  });

  test('loads Bambu LAN transport settings from env', () => {
    const config = loadPrintBridgeConfig({
      PRINT_BRIDGE_ADAPTER: 'bambu-lan',
      PRINT_BRIDGE_PRINTER_ID: 'p2s-east',
      BAMBU_LAN_HOST: '192.168.1.50',
      BAMBU_LAN_ACCESS_CODE: '12345678',
      BAMBU_LAN_SERIAL: '01P00A123456789',
      BAMBU_LAN_MQTT_PORT: '8884',
      BAMBU_LAN_FTP_PORT: '991',
      BAMBU_LAN_UPLOAD_DIRECTORY: 'jobs',
      BAMBU_LAN_TIMEOUT_MS: '5000',
    });

    expect(config.adapters[0]).toMatchObject({
      kind: 'bambu-lan',
      id: 'p2s-east',
      host: '192.168.1.50',
      accessCode: '12345678',
      serial: '01P00A123456789',
      mqttPort: 8884,
      ftpPort: 991,
      uploadDirectory: 'jobs',
      timeoutMs: 5000,
    });
  });
});
