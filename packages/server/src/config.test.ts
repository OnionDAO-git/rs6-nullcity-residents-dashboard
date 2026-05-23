import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { dashboardDataRoots } from './config';

describe('dashboardDataRoots', () => {
  test('defaults to controller-discoverable rs6 server data directories', () => {
    const roots = dashboardDataRoots('/tmp/rs6-nullcity-server');

    expect(roots.memoryRoot).toBe(path.join('/tmp/rs6-nullcity-server', 'data/controller/memory'));
    expect(roots.logsRoot).toBe(path.join('/tmp/rs6-nullcity-server', 'data/controller/logs'));
    expect(roots.soulsRoot).toBe(path.join('/tmp/rs6-nullcity-server', 'src/controller/soul/starter-souls'));
    expect(roots.agentLogsRoot).toBe(path.join('/tmp/rs6-nullcity-server', 'data/agent-logs'));
    expect(roots.residentSaveRoot).toBe(path.join('/tmp/rs6-nullcity-server', 'data/residents'));
    expect(roots.benchmarkRoot).toBe(path.join('/tmp/rs6-nullcity-server', 'data/benchmarks'));
  });
});
