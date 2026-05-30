import { describe, expect, test } from 'bun:test';
import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { NullCityNcriRecord, ResidentTrade } from './city-api';
import { printResidentSignals } from './print-resident-signals';

function resident(overrides: Partial<ResidentDashboardRow> = {}): ResidentDashboardRow {
  return {
    name: 'res:atlas',
    online: true,
    attention: 42,
    ...overrides,
  };
}

function ncri(overrides: Partial<NullCityNcriRecord> = {}): NullCityNcriRecord {
  return {
    schemaVersion: 1,
    id: 'ncri-1',
    itemId: 4151,
    displayName: 'Whip of Ash',
    lore: 'Test lore',
    owner: 'res:atlas',
    approvalStatus: 'approved',
    redemptionStatus: 'available',
    createdAt: '2026-05-30T00:00:00.000Z',
    updatedAt: '2026-05-30T00:01:00.000Z',
    ...overrides,
  };
}

function trade(overrides: Partial<ResidentTrade> = {}): ResidentTrade {
  return {
    id: 'trade-1',
    cityUserId: 'city-1',
    residentId: 'res:atlas',
    status: 'pending_nullcity',
    offeredResource: 'AP',
    offeredAmount: 25,
    requestedItem: 'NCRI #4',
    pointLedgerEntryId: 'ledger-1',
    metadata: {},
    createdAt: '2026-05-30T00:00:00.000Z',
    updatedAt: '2026-05-30T00:02:00.000Z',
    ...overrides,
  };
}

describe('printResidentSignals', () => {
  test('deduplicates resident involvement across NCRI registry and trades, newest first', () => {
    const rows = [
      resident({ name: 'res:atlas' }),
      resident({ name: 'res:brim', attention: 6, online: false }),
    ];

    const signals = printResidentSignals(
      rows,
      [
        ncri({ owner: 'res:atlas', updatedAt: '2026-05-30T00:01:00.000Z' }),
        ncri({ id: 'ncri-2', owner: 'res:brim', updatedAt: '2026-05-30T00:04:00.000Z' }),
      ],
      [
        trade({ id: 'trade-1', residentId: 'res:atlas', updatedAt: '2026-05-30T00:05:00.000Z' }),
        trade({ id: 'trade-2', residentId: 'res:brim', updatedAt: '2026-05-30T00:03:00.000Z' }),
      ],
      5,
    );

    expect(signals).toHaveLength(2);
    expect(signals[0]).toMatchObject({
      residentId: 'res:atlas',
      sources: ['ncri_registry', 'ncri_trade'],
      latestAt: '2026-05-30T00:05:00.000Z',
      resident: { name: 'res:atlas' },
    });
    expect(signals[1]).toMatchObject({
      residentId: 'res:brim',
      sources: ['ncri_registry', 'ncri_trade'],
      latestAt: '2026-05-30T00:04:00.000Z',
      resident: { name: 'res:brim' },
    });
  });

  test('keeps unknown resident ids when NCRI/Trade activity exists, and ignores non-NCRI trades', () => {
    const signals = printResidentSignals(
      [resident({ name: 'res:atlas' })],
      [ncri({ owner: 'res:ghost', updatedAt: '2026-05-30T00:06:00.000Z' })],
      [
        trade({ id: 'trade-ncri', residentId: 'res:ghost', requestedItem: 'NCRI transfer', updatedAt: '2026-05-30T00:07:00.000Z' }),
        trade({ id: 'trade-gp', residentId: 'res:atlas', requestedItem: 'coin-995 GP', updatedAt: '2026-05-30T00:08:00.000Z' }),
      ],
      5,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      residentId: 'res:ghost',
      sources: ['ncri_registry', 'ncri_trade'],
      latestAt: '2026-05-30T00:07:00.000Z',
    });
    expect(signals[0]?.resident).toBeUndefined();
  });
});
