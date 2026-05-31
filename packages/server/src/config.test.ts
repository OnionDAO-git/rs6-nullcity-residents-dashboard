import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { dashboardDataRoots, dashboardRequestIdleTimeoutSeconds, defaultServerRoot, normalizeRsClientHost, parseRsClientHost } from './config';

describe('defaultServerRoot', () => {
  test('points at the sibling rs6-nullcity-server checkout used by the weekend automation', () => {
    expect(defaultServerRoot('/tmp/oniondao')).toBe(path.join('/tmp/oniondao', 'rs6-nullcity-server'));
  });
});

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

describe('dashboardRequestIdleTimeoutSeconds', () => {
  test('keeps slow live overview reads above the default 10s Bun cutoff', () => {
    expect(dashboardRequestIdleTimeoutSeconds).toBeGreaterThanOrEqual(30);
  });
});

describe('parseRsClientHost', () => {
  test('accepts bare host and port values for the raw game gateway', () => {
    expect(parseRsClientHost('127.0.0.1:43594')).toEqual({ host: '127.0.0.1', port: 43594 });
    expect(parseRsClientHost('[::1]:43594')).toEqual({ host: '[::1]', port: 43594 });
  });

  test('normalizes tcp-style URLs while rejecting browser websocket URLs', () => {
    expect(normalizeRsClientHost('tcp://game.internal:43594')).toBe('game.internal:43594');
    expect(() => normalizeRsClientHost('ws://game.internal:43594')).toThrow(/raw TCP game gateway/);
    expect(() => normalizeRsClientHost('https://game.internal:43594')).toThrow(/raw TCP game gateway/);
  });

  test('catches common wrong Null City ports before the client times out', () => {
    expect(() => normalizeRsClientHost('127.0.0.1:43595')).toThrow(/AgentGateway/);
    expect(() => normalizeRsClientHost('127.0.0.1:43592')).toThrow(/login or update server/);
    expect(() => normalizeRsClientHost('127.0.0.1:43591')).toThrow(/login or update server/);
  });
});
