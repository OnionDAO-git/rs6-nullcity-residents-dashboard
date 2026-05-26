import type { ControllerStatus, GatewayStatus, PatronActivitySummary, ResidentDashboardRow, SoulSummary } from '@nullcity-dashboard/shared';
import { describe, expect, test } from 'bun:test';
import { buildEventReadinessSummary } from './readiness';

const connectedGateway: GatewayStatus = {
  configuredUrl: 'http://127.0.0.1:4000',
  connected: true,
};

const availableController: ControllerStatus = {
  available: true,
  memoryRoot: '/tmp/memory',
  logsRoot: '/tmp/logs',
  soulsRoot: '/tmp/souls',
  residentsWithRuntime: 3,
};

const patronSummary: PatronActivitySummary = {
  totalPatrons: 2,
  totalShardBalance: 25,
  totalStandingPoints: 40,
  tierCounts: { stranger: 0, acquaintance: 1, ally: 1, officer: 0 },
  patrons: [],
};

const soul: SoulSummary = {
  id: 'res-agent',
  file: 'res-agent.md',
  title: 'Agent',
  errors: [],
};

describe('buildEventReadinessSummary', () => {
  test('marks the event stack ready when live residents, souls, patrons, letters, controller, and gateway are present', () => {
    const summary = buildEventReadinessSummary({
      now: '2026-05-25T20:00:00.000Z',
      gateway: connectedGateway,
      controller: availableController,
      residents: [
        { name: 'res:agent', online: true },
        { name: 'res:hans', online: false },
      ],
      souls: [soul],
      recentLetters: [
        {
          id: 'letter-1',
          kind: 'patron_thanks',
          subject: 'Thank you',
          recipient: 'patron-001',
          deliveryChannels: ['inbox'],
        },
      ],
      patrons: patronSummary,
    });

    expect(summary.level).toBe('ok');
    expect(summary.updatedAt).toBe('2026-05-25T20:00:00.000Z');
    expect(summary.checks.map(check => [check.id, check.level])).toEqual([
      ['gateway', 'ok'],
      ['controller', 'ok'],
      ['resident-cohort', 'ok'],
      ['souls', 'ok'],
      ['patrons', 'ok'],
      ['letters', 'ok'],
    ]);
    expect(summary.checks.find(check => check.id === 'resident-cohort')?.detail).toContain('1 online');
  });

  test('surfaces blocking and warning conditions without leaking raw patron data', () => {
    const summary = buildEventReadinessSummary({
      now: '2026-05-25T20:05:00.000Z',
      gateway: { ...connectedGateway, connected: false, lastError: 'ECONNREFUSED' },
      controller: { ...availableController, available: false, residentsWithRuntime: 0 },
      residents: [],
      souls: [],
      recentLetters: [],
      patrons: {
        ...patronSummary,
        totalPatrons: 1,
        totalShardBalance: 0,
        totalStandingPoints: 0,
      },
    });

    expect(summary.level).toBe('fail');
    expect(summary.checks.find(check => check.id === 'gateway')).toMatchObject({
      level: 'fail',
      detail: 'Gateway offline (connection refused)',
    });
    expect(summary.checks.find(check => check.id === 'resident-cohort')).toMatchObject({
      level: 'fail',
    });
    expect(summary.checks.find(check => check.id === 'patrons')).toMatchObject({
      level: 'warn',
      detail: '1 patrons registered, no Shards currently held',
    });
    expect(JSON.stringify(summary)).not.toContain('@');
  });

  test('redacts operational endpoints and raw filesystem or token-bearing errors', () => {
    const summary = buildEventReadinessSummary({
      now: '2026-05-25T20:10:00.000Z',
      gateway: {
        configuredUrl: 'ws://user:secret@internal.example.test:43595/path?token=abc123',
        connected: false,
        lastError: 'ECONNREFUSED /Users/james/private/controller.yml?token=abc123',
      },
      controller: {
        ...availableController,
        available: false,
        lastError: 'ENOENT /Users/james/private/controller.yml',
      },
      residents: [],
      souls: [],
      recentLetters: [],
    });

    const serialized = JSON.stringify(summary);
    expect(summary.checks.find(check => check.id === 'gateway')?.detail).toBe('Gateway offline (connection refused)');
    expect(summary.checks.find(check => check.id === 'controller')?.detail).toBe('Controller data unavailable (missing file)');
    expect(serialized).not.toContain('internal.example.test');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('/Users/');
  });

  test('warns when residents exist but none are currently visible online', () => {
    const summary = buildEventReadinessSummary({
      gateway: connectedGateway,
      controller: availableController,
      residents: [{ name: 'res:agent', online: false }],
      souls: [soul],
      recentLetters: [],
      patrons: { ...patronSummary, totalPatrons: 0, totalShardBalance: 0, totalStandingPoints: 0 },
    });

    expect(summary.level).toBe('warn');
    expect(summary.checks.find(check => check.id === 'resident-cohort')).toMatchObject({
      level: 'warn',
      detail: '1 residents known, none online',
    });
    expect(summary.checks.find(check => check.id === 'letters')?.level).toBe('warn');
  });
});
