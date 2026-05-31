import path from 'node:path';

const repoRoot = path.resolve(import.meta.dir, '../../../..');
const serverRoot = process.env.NULLCITY_SERVER_ROOT || defaultServerRoot(repoRoot);
const defaultGatewayUrl = 'ws://127.0.0.1:43595';
const defaultGatewayToken = 'nullcity-local-dev';
export const dashboardRequestIdleTimeoutSeconds = 30;

export interface DashboardConfig {
  host: string;
  port: number;
  gatewayUrl: string;
  gatewayToken?: string;
  rsClientHost: string;
  rsClientSecure: boolean;
  serverRoot: string;
  memoryRoot: string;
  logsRoot: string;
  agentLogsRoot: string;
  soulsRoot: string;
  residentSaveRoot: string;
  benchmarkRoot: string;
  eventPublicRoot: string;
  webDist: string;
  webDevOrigin?: string;
}

export function dashboardDataRoots(root: string): Pick<
  DashboardConfig,
  'memoryRoot' | 'logsRoot' | 'agentLogsRoot' | 'soulsRoot' | 'residentSaveRoot' | 'benchmarkRoot'
> {
  return {
    memoryRoot: path.join(root, 'data/controller/memory'),
    logsRoot: path.join(root, 'data/controller/logs'),
    agentLogsRoot: path.join(root, 'data/agent-logs'),
    soulsRoot: path.join(root, 'src/controller/soul/starter-souls'),
    residentSaveRoot: path.join(root, 'data/residents'),
    benchmarkRoot: path.join(root, 'data/benchmarks'),
  };
}

const dataRoots = dashboardDataRoots(serverRoot);

export function defaultServerRoot(root: string): string {
  return path.join(root, 'rs6-nullcity-server');
}

export const config: DashboardConfig = {
  host: process.env.DASHBOARD_HOST || '127.0.0.1',
  port: portFromEnv(process.env.DASHBOARD_PORT, process.env.PORT, 8787),
  gatewayUrl: normalizeAgentGatewayUrl(process.env.AGENT_GATEWAY_URL),
  gatewayToken: process.env.AGENT_GATEWAY_TOKEN || defaultGatewayToken,
  rsClientHost: normalizeRsClientHost(process.env.NULLCITY_RS_HOST),
  rsClientSecure: process.env.NULLCITY_RS_SECURE === 'true',
  serverRoot,
  memoryRoot: process.env.NULLCITY_MEMORY_ROOT || dataRoots.memoryRoot,
  logsRoot: process.env.NULLCITY_LOGS_ROOT || dataRoots.logsRoot,
  agentLogsRoot: process.env.NULLCITY_AGENT_LOGS_ROOT || dataRoots.agentLogsRoot,
  soulsRoot: process.env.NULLCITY_SOULS_ROOT || dataRoots.soulsRoot,
  residentSaveRoot: process.env.NULLCITY_RESIDENT_SAVE_ROOT || dataRoots.residentSaveRoot,
  benchmarkRoot: process.env.NULLCITY_BENCHMARK_ROOT || dataRoots.benchmarkRoot,
  eventPublicRoot: process.env.DASHBOARD_EVENT_PUBLIC_ROOT || path.resolve(import.meta.dir, '../public'),
  webDist: process.env.DASHBOARD_WEB_DIST || path.resolve(import.meta.dir, '../../web/dist'),
  webDevOrigin: process.env.DASHBOARD_WEB_DEV_ORIGIN,
};

function portFromEnv(...values: Array<string | number | undefined>): number {
  for (const value of values) {
    const port = Number(value);
    if (Number.isInteger(port) && port > 0) return port;
  }
  return 8787;
}

function normalizeAgentGatewayUrl(value: string | undefined): string {
  if (!value) return defaultGatewayUrl;
  try {
    const url = new URL(value);
    if (url.port === '43594') {
      url.port = '43595';
      return url.toString();
    }
  } catch {
    return value;
  }
  return value;
}

export function normalizeRsClientHost(value: string | undefined): string {
  const host = value || '127.0.0.1:43594';
  const parsed = parseRsClientHost(host);
  if (parsed.port === 43595) {
    throw new Error('NULLCITY_RS_HOST points at the AgentGateway on port 43595. Use the RuneScape game gateway on port 43594.');
  }
  if (parsed.port === 43591 || parsed.port === 43592) {
    throw new Error('NULLCITY_RS_HOST must point at the RuneScape game gateway on port 43594, not the login or update server directly.');
  }
  return `${parsed.host}:${parsed.port}`;
}

export function parseRsClientHost(value: string): { host: string; port: number } {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('NULLCITY_RS_HOST must be host:port.');
  if (/^wss?:\/\//i.test(trimmed) || /^https?:\/\//i.test(trimmed)) {
    throw new Error('NULLCITY_RS_HOST must be the raw TCP game gateway host:port, not an HTTP or WebSocket URL.');
  }

  let hostPort = trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    hostPort = url.host;
  }

  const url = new URL(`tcp://${hostPort}`);
  const port = Number(url.port);
  if (!url.hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`NULLCITY_RS_HOST must be host:port, got ${value}`);
  }
  return { host: url.hostname, port };
}
