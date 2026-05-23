import path from 'node:path';

const repoRoot = path.resolve(import.meta.dir, '../../../..');
const serverRoot = process.env.NULLCITY_SERVER_ROOT || path.join(repoRoot, 'rs6-nullcity-server');
const defaultGatewayUrl = 'ws://127.0.0.1:43595';
const defaultGatewayToken = 'nullcity-local-dev';

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

export const config: DashboardConfig = {
  host: process.env.DASHBOARD_HOST || '127.0.0.1',
  port: Number(process.env.DASHBOARD_PORT || 8787),
  gatewayUrl: normalizeAgentGatewayUrl(process.env.AGENT_GATEWAY_URL),
  gatewayToken: process.env.AGENT_GATEWAY_TOKEN || defaultGatewayToken,
  rsClientHost: process.env.NULLCITY_RS_HOST || '127.0.0.1:43594',
  rsClientSecure: process.env.NULLCITY_RS_SECURE === 'true',
  serverRoot,
  memoryRoot: process.env.NULLCITY_MEMORY_ROOT || dataRoots.memoryRoot,
  logsRoot: process.env.NULLCITY_LOGS_ROOT || dataRoots.logsRoot,
  agentLogsRoot: process.env.NULLCITY_AGENT_LOGS_ROOT || dataRoots.agentLogsRoot,
  soulsRoot: process.env.NULLCITY_SOULS_ROOT || dataRoots.soulsRoot,
  residentSaveRoot: process.env.NULLCITY_RESIDENT_SAVE_ROOT || dataRoots.residentSaveRoot,
  benchmarkRoot: process.env.NULLCITY_BENCHMARK_ROOT || dataRoots.benchmarkRoot,
  webDist: process.env.DASHBOARD_WEB_DIST || path.resolve(import.meta.dir, '../../web/dist'),
  webDevOrigin: process.env.DASHBOARD_WEB_DEV_ORIGIN,
};

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
