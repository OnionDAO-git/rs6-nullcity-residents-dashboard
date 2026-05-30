import { describe, expect, test } from 'bun:test';
import { printQueueInsights } from './print-queue-insights';

import type { PrintQueueEntry, PrintRequest, ResidentTrade } from './city-api';

function request(overrides: Partial<PrintRequest> = {}): PrintRequest {
  return {
    id: 'req-1',
    cityUserId: 'city-1',
    status: 'draft',
    title: 'Test print',
    quantity: 1,
    createdAt: '2026-05-30T00:00:00.000Z',
    updatedAt: '2026-05-30T00:00:00.000Z',
    ...overrides,
  };
}

function queue(overrides: Partial<PrintQueueEntry> = {}): PrintQueueEntry {
  return {
    id: 'queue-1',
    printRequestId: 'req-1',
    status: 'queued',
    priority: 10,
    createdAt: '2026-05-30T00:00:00.000Z',
    updatedAt: '2026-05-30T00:00:00.000Z',
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
    pointLedgerEntryId: 'ledger-1',
    metadata: {},
    createdAt: '2026-05-30T00:00:00.000Z',
    updatedAt: '2026-05-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('printQueueInsights', () => {
  test('summarizes queue bottlenecks and queue-lagging paid requests', () => {
    const summary = printQueueInsights(
      [
        request({ id: 'r-await', status: 'awaiting_gp_confirmation' }),
        request({ id: 'r-paid', status: 'paid' }),
        request({ id: 'r-print', status: 'printing' }),
      ],
      [queue({ id: 'q-print', printRequestId: 'r-print', status: 'printing', printerId: 'printer-a' })],
      [],
    );

    expect(summary.activeRequests).toBe(3);
    expect(summary.awaitingPayment).toBe(1);
    expect(summary.paidWithoutQueue).toBe(1);
    expect(summary.inQueue).toBe(1);
    expect(summary.printing).toBe(1);
    expect(summary.queueHealth).toEqual({
      unassignedActive: 0,
      failed: 0,
      orphaned: 0,
      blockers: [],
    });
    expect(summary.warnings).toEqual([
      '1 request awaiting GP confirmation.',
      '1 paid request missing a queue entry.',
    ]);
  });

  test('extracts queue blockers for unassigned, failed, and orphaned entries', () => {
    const summary = printQueueInsights(
      [request({ id: 'req-live', status: 'approved' })],
      [
        queue({
          id: 'q-unassigned',
          printRequestId: 'req-live',
          status: 'queued',
          updatedAt: '2026-05-30T00:03:00.000Z',
        }),
        queue({
          id: 'q-failed',
          printRequestId: 'req-live',
          status: 'failed',
          printerId: 'printer-x',
          error: 'bed temp fault',
          updatedAt: '2026-05-30T00:02:00.000Z',
        }),
        queue({
          id: 'q-orphan',
          printRequestId: 'req-missing',
          status: 'queued',
          printerId: 'printer-y',
          updatedAt: '2026-05-30T00:01:00.000Z',
        }),
      ],
      [],
    );

    expect(summary.queueHealth.unassignedActive).toBe(1);
    expect(summary.queueHealth.failed).toBe(1);
    expect(summary.queueHealth.orphaned).toBe(1);
    expect(summary.queueHealth.blockers).toHaveLength(3);
    expect(summary.queueHealth.blockers[0]).toMatchObject({ id: 'q-unassigned', reason: 'active queue entry has no assigned printer' });
    expect(summary.queueHealth.blockers[1]).toMatchObject({ id: 'q-failed', reason: 'queue failed: bed temp fault' });
    expect(summary.queueHealth.blockers[2]).toMatchObject({ id: 'q-orphan', reason: 'queue entry references unknown print request' });
    expect(summary.warnings).toEqual([
      '1 active queue entry missing a printer assignment.',
      '1 queue entry is failed and needs operator action.',
      '1 queue entry references a missing print request.',
    ]);
  });

  test('extracts NCRI trade signals for print operators', () => {
    const summary = printQueueInsights(
      [],
      [],
      [
        trade({ id: 't-1', requestedItem: 'NCRI #42', status: 'pending_nullcity', updatedAt: '2026-05-30T00:01:00.000Z' }),
        trade({ id: 't-2', requestedItem: 'coin-995 GP', status: 'accepted', updatedAt: '2026-05-30T00:02:00.000Z' }),
        trade({ id: 't-3', requestedItem: 'ncri index card', status: 'accepted', updatedAt: '2026-05-30T00:03:00.000Z' }),
        trade({ id: 't-4', requestedItem: 'NCRI redemption', status: 'failed', updatedAt: '2026-05-30T00:04:00.000Z' }),
      ],
    );

    expect(summary.ncriTrades.pending).toBe(1);
    expect(summary.ncriTrades.accepted).toBe(1);
    expect(summary.ncriTrades.failed).toBe(1);
    expect(summary.ncriTrades.recent).toHaveLength(3);
    expect(summary.ncriTrades.recent[0]).toMatchObject({ id: 't-4', status: 'failed' });
  });
});
