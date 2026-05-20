import path from 'node:path';

const repoRoot = path.resolve(import.meta.dir, '../../../..');
const serverRoot = process.env.NULLCITY_SERVER_ROOT || path.join(repoRoot, 'rs6-nullcity-server');
const defaultGatewayUrl = 'ws://127.0.0.1:43595';

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
  soulsRoot: string;
  webDist: string;
}

export const config: DashboardConfig = {
  host: process.env.DASHBOARD_HOST || '127.0.0.1',
  port: Number(process.env.DASHBOARD_PORT || 8787),
  gatewayUrl: normalizeAgentGatewayUrl(process.env.AGENT_GATEWAY_URL),
  gatewayToken: process.env.AGENT_GATEWAY_TOKEN || undefined,
  rsClientHost: process.env.NULLCITY_RS_HOST || '127.0.0.1:43594',
  rsClientSecure: process.env.NULLCITY_RS_SECURE === 'true',
  serverRoot,
  memoryRoot: process.env.NULLCITY_MEMORY_ROOT || path.join(serverRoot, 'data/memory'),
  logsRoot: process.env.NULLCITY_LOGS_ROOT || path.join(serverRoot, 'data/logs'),
  soulsRoot: process.env.NULLCITY_SOULS_ROOT || path.join(serverRoot, 'data/souls'),
  webDist: process.env.DASHBOARD_WEB_DIST || path.resolve(import.meta.dir, '../../web/dist'),
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
