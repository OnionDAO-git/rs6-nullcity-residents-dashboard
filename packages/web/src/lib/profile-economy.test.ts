import { describe, expect, test } from 'bun:test';
import type { PointLedgerEntry } from './city-api';
import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import { buildProfileEconomySummary } from './profile-economy';

const NOW = Date.parse('2026-05-30T18:00:00.000Z');

function ledger(overrides: Partial<PointLedgerEntry> = {}): PointLedgerEntry {
  return {
    id: 'ledger-1',
    cityUserId: 'city-1',
    resource: 'AP',
    delta: 10,
    balanceAfter: 110,
    sourceType: 'test',
    sourceId: 'source-1',
    metadata: {},
    createdAt: '2026-05-30T17:00:00.000Z',
    ...overrides,
  };
}

function resident(overrides: Partial<ResidentDashboardRow> = {}, options: { hasCoin995?: boolean } = {}): ResidentDashboardRow {
  const hasCoin995 = options.hasCoin995 ?? true;
  return {
    name: 'res:atlas',
    online: true,
    attention: 55,
    body: {
      latestPerception: {
        resident: {
          inventory: [
            ...(hasCoin995 ? [{ itemId: 995, amount: 40 }] : []),
          ],
        },
      },
      saved: {
        inventory: [],
      },
      events: [],
      actionLog: [],
      queuedActions: [],
      latestMoveIntent: null,
    },
    memory: {
      files: [],
    },
    logs: {
      actions: [],
      inference: [],
    },
    errors: [],
    ...overrides,
  } as ResidentDashboardRow;
}

describe('buildProfileEconomySummary', () => {
  test('builds an ok snapshot when balances, ledger activity, and resident AP pressure are healthy', () => {
    const summary = buildProfileEconomySummary({
      apBalance: 180,
      gpBalance: 65,
      ledger: [
        ledger({ id: 'ap-credit', resource: 'AP', delta: 80 }),
        ledger({ id: 'ap-debit', resource: 'AP', delta: -20 }),
        ledger({ id: 'gp-credit', resource: 'GP', delta: 35 }),
      ],
      residents: [resident()],
      nowMs: NOW,
    });

    expect(summary.tone).toBe('ok');
    expect(summary.warnings).toEqual([]);
    expect(summary.metrics.find(metric => metric.id === 'ap-net-24h')).toMatchObject({ value: '+60', tone: 'ok' });
    expect(summary.metrics.find(metric => metric.id === 'gp-net-24h')).toMatchObject({ value: '+35', tone: 'ok' });
    expect(summary.nextActions).toEqual(['Keep profile ledger and resident AP/GP snapshots refreshed for demos.']);
  });

  test('warns when AP is low, GP evidence is missing, and residents need AP', () => {
    const summary = buildProfileEconomySummary({
      apBalance: 7,
      gpBalance: 0,
      ledger: [
        ledger({ id: 'ap-debit', resource: 'AP', delta: -12 }),
      ],
      residents: [resident({ attention: 3 }, { hasCoin995: false })],
      nowMs: NOW,
    });

    expect(summary.tone).toBe('warn');
    expect(summary.warnings).toEqual([
      'AP is low (7); recharge soon to keep funding actions available.',
      'No GP in profile balance or resident coin-995 evidence.',
      '1 resident is low on AP.',
    ]);
    expect(summary.metrics.find(metric => metric.id === 'ap-balance')).toMatchObject({ tone: 'warn' });
    expect(summary.metrics.find(metric => metric.id === 'gp-balance')).toMatchObject({ tone: 'warn' });
    expect(summary.nextActions).toContain('Run check-in sync or request an AP grant before funding new actions.');
    expect(summary.nextActions).toContain('Run AP-for-GP or coin-995 resident proof before promising GP-backed flows.');
  });

  test('fails when AP is empty and no recent ledger activity exists', () => {
    const summary = buildProfileEconomySummary({
      apBalance: 0,
      gpBalance: 0,
      ledger: [
        ledger({
          id: 'stale-entry',
          createdAt: '2026-05-28T10:00:00.000Z',
          resource: 'AP',
          delta: 15,
        }),
      ],
      residents: [],
      nowMs: NOW,
    });

    expect(summary.tone).toBe('fail');
    expect(summary.warnings).toEqual([
      'AP is empty; profile actions are blocked until you top up.',
      'No AP/GP ledger events in the last 24h.',
      'No GP in profile balance or resident coin-995 evidence.',
    ]);
    expect(summary.metrics.find(metric => metric.id === 'ledger-24h')).toMatchObject({ value: '0', tone: 'warn' });
    expect(summary.nextActions).toContain('Generate fresh ledger activity so AP/GP claims are time-bounded.');
  });
});
