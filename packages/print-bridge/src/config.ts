import { createPrinterAdapter, type PrinterAdapterConfig } from './adapters';
import { HttpCityPrintQueueClient } from './city';
import { CommandSlicerRunner, DryRunSlicerRunner } from './slicer';
import type { CityPrintQueueClient, PrinterAdapter, SlicerRunner } from './types';

export interface PrintBridgeConfig {
  bridgeId: string;
  pollMs: number;
  heartbeatMs: number;
  workDir: string;
  city?: {
    baseUrl: string;
    token?: string | undefined;
  } | undefined;
  adapters: PrinterAdapterConfig[];
  slicer:
    | { kind: 'dry-run' }
    | { kind: 'command'; id: string; command: string; args: string[]; profile?: string | undefined };
}

export interface LoadedPrintBridge {
  config: PrintBridgeConfig;
  adapters: PrinterAdapter[];
  slicer: SlicerRunner;
  city?: CityPrintQueueClient | undefined;
}

export function loadPrintBridgeConfig(env: Record<string, string | undefined> = process.env): PrintBridgeConfig {
  const bridgeId = clean(env.PRINT_BRIDGE_ID) || 'nullcity-print-bridge';
  const adapterKind = clean(env.PRINT_BRIDGE_ADAPTER) || (env.PRINT_BRIDGE_DRY_RUN === 'false' ? 'fdm-monster' : 'dry-run');
  return {
    bridgeId,
    pollMs: numberEnv(env.PRINT_BRIDGE_POLL_MS, 10_000),
    heartbeatMs: numberEnv(env.PRINT_BRIDGE_HEARTBEAT_MS, 30_000),
    workDir: clean(env.PRINT_BRIDGE_WORK_DIR) || '.print-bridge',
    city: clean(env.PRINT_BRIDGE_CITY_BASE_URL)
      ? {
          baseUrl: clean(env.PRINT_BRIDGE_CITY_BASE_URL) || '',
          token: clean(env.PRINT_BRIDGE_CITY_TOKEN),
        }
      : undefined,
    adapters: adaptersFromEnv(adapterKind, env),
    slicer: slicerFromEnv(env),
  };
}

export function createPrintBridgeFromConfig(config: PrintBridgeConfig): LoadedPrintBridge {
  const loaded: LoadedPrintBridge = {
    config,
    adapters: config.adapters.map(createPrinterAdapter),
    slicer: config.slicer.kind === 'dry-run'
      ? new DryRunSlicerRunner()
      : new CommandSlicerRunner(config.slicer),
  };
  if (config.city) loaded.city = new HttpCityPrintQueueClient(config.city);
  return loaded;
}

export function redactCredentials<T>(value: T): T {
  return redactValue(value) as T;
}

function adaptersFromEnv(kind: string, env: Record<string, string | undefined>): PrinterAdapterConfig[] {
  const json = clean(env.PRINT_BRIDGE_ADAPTERS_JSON);
  if (json) return JSON.parse(json) as PrinterAdapterConfig[];
  const id = clean(env.PRINT_BRIDGE_PRINTER_ID) || `${kind}-printer`;
  switch (kind) {
    case 'fdm-monster':
      return [{
        kind: 'fdm-monster',
        id,
        baseUrl: clean(env.FDM_MONSTER_BASE_URL) || 'http://127.0.0.1:4000',
        apiKey: clean(env.FDM_MONSTER_API_KEY),
        printerId: clean(env.FDM_MONSTER_PRINTER_ID) || id,
      }];
    case 'moonraker':
      return [{
        kind: 'moonraker',
        id,
        baseUrl: clean(env.MOONRAKER_BASE_URL) || 'http://127.0.0.1:7125',
        apiKey: clean(env.MOONRAKER_API_KEY),
      }];
    case 'snapmaker-u1':
      return [{
        kind: 'snapmaker-u1',
        id,
        baseUrl: clean(env.SNAPMAKER_BASE_URL) || clean(env.MOONRAKER_BASE_URL) || 'http://127.0.0.1:7125',
        apiKey: clean(env.SNAPMAKER_API_KEY) || clean(env.MOONRAKER_API_KEY),
      }];
    case 'bambu-lan':
      return [{
        kind: 'bambu-lan',
        id,
        host: clean(env.BAMBU_LAN_HOST),
        accessCode: clean(env.BAMBU_LAN_ACCESS_CODE),
        serial: clean(env.BAMBU_LAN_SERIAL),
        mqttPort: numberEnv(env.BAMBU_LAN_MQTT_PORT, 8883),
        ftpPort: numberEnv(env.BAMBU_LAN_FTP_PORT, 990),
        uploadDirectory: clean(env.BAMBU_LAN_UPLOAD_DIRECTORY) || 'cache',
        timeoutMs: numberEnv(env.BAMBU_LAN_TIMEOUT_MS, 15_000),
      }];
    default:
      return [{ kind: 'dry-run', id, completeAfterMs: numberEnv(env.PRINT_BRIDGE_DRY_RUN_COMPLETE_MS, 30_000) }];
  }
}

function slicerFromEnv(env: Record<string, string | undefined>): PrintBridgeConfig['slicer'] {
  const command = clean(env.PRINT_BRIDGE_SLICER_COMMAND);
  if (!command) return { kind: 'dry-run' };
  return {
    kind: 'command',
    id: clean(env.PRINT_BRIDGE_SLICER_ID) || 'command',
    command,
    args: splitArgs(clean(env.PRINT_BRIDGE_SLICER_ARGS) || '{input} --output {output}'),
    profile: clean(env.PRINT_BRIDGE_SLICER_PROFILE),
  };
}

function splitArgs(value: string): string[] {
  return value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(part => part.replace(/^"|"$/g, '')) || [];
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function numberEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    shouldRedact(key) ? '[redacted]' : redactValue(entry),
  ]));
}

function shouldRedact(key: string): boolean {
  return /(token|secret|password|api[-_]?key|access[-_]?code|credential|authorization|auth)/i.test(key);
}
