import { describe, expect, test } from 'bun:test';
import type { StorytellerDigestSummary } from './api';
import type { NullCityNcriRecord } from './city-api';
import type { PrintQueueInsightSummary } from './print-queue-insights';
import { printStoryDigestSignal } from './print-story-digest';

function digest(
  overrides: Partial<Omit<StorytellerDigestSummary, 'dispatch'>> & { dispatch?: StorytellerDigestSummary['dispatch'] | undefined } = {},
): StorytellerDigestSummary {
  const base: StorytellerDigestSummary = {
    runId: 'run-1',
    digestId: 'digest-1',
    builtAt: '2026-05-30T13:00:00.000Z',
    topEventCount: 1,
    residentCount: 2,
    topEvents: [
      {
        ref: 'ncri-sale-1',
        kind: 'ncri_sale',
        residentName: 'res:hans',
        note: 'Hans sold NCRI ncri-1 for AP.',
        ts: '2026-05-30T12:55:00.000Z',
        importance: 'high',
        evidenceLabels: ['ncri ncri-1', '50 AP'],
      },
    ],
    dispatch: {
      dispatchId: 'dispatch-1',
      generatedAt: '2026-05-30T13:02:00.000Z',
      needsReview: false,
      warningCount: 0,
      publicTitle: 'The city trades a relic',
      publicBullets: [],
      operatorWarnings: [],
      reviewReasons: [],
      eventRefCount: 1,
      eventRefsUsed: ['ncri-sale-1'],
    },
  };
  const { dispatch: dispatchOverride, ...rest } = overrides;
  const merged: StorytellerDigestSummary = { ...base, ...rest };
  if ('dispatch' in overrides) {
    if (dispatchOverride) merged.dispatch = dispatchOverride;
    else delete merged.dispatch;
  }
  return merged;
}

function printInsights(overrides: Partial<PrintQueueInsightSummary> = {}): PrintQueueInsightSummary {
  return {
    activeRequests: 1,
    awaitingPayment: 0,
    paidWithoutQueue: 0,
    inQueue: 0,
    printing: 0,
    warnings: ['No queue blockers detected.'],
    queueHealth: {
      unassignedActive: 0,
      failed: 0,
      orphaned: 0,
      blockers: [],
    },
    ncriTrades: {
      pending: 0,
      accepted: 1,
      failed: 0,
      recent: [
        {
          id: 'trade-1',
          residentId: 'res:hans',
          requestedItem: 'NCRI ncri-1',
          status: 'accepted',
          updatedAt: '2026-05-30T12:50:00.000Z',
        },
      ],
    },
    ...overrides,
  };
}

function ncri(overrides: Partial<NullCityNcriRecord> = {}): NullCityNcriRecord {
  return {
    schemaVersion: 1,
    id: 'ncri-1',
    itemId: 4151,
    displayName: 'Abyssal Whip of the City',
    lore: 'A test relic.',
    owner: 'res:hans',
    approvalStatus: 'approved',
    redemptionStatus: 'available',
    createdAt: '2026-05-30T12:00:00.000Z',
    updatedAt: '2026-05-30T12:40:00.000Z',
    ...overrides,
  };
}

describe('printStoryDigestSignal', () => {
  test('reports fresh grounded NCRI canon when the latest digest cites print-loop events', () => {
    const signal = printStoryDigestSignal({
      digests: [digest()],
      printInsights: printInsights(),
      ncriRecords: [ncri()],
      nowMs: Date.parse('2026-05-30T13:10:00.000Z'),
    });

    expect(signal).toMatchObject({
      tone: 'ok',
      summary: 'NCRI canon linked',
      eventCount: 1,
      latestRunId: 'run-1',
      latestAgeMinutes: 8,
      dispatchNeedsReview: false,
    });
    expect(signal.detail).toContain('ncri_sale');
  });

  test('warns when active NCRI work has no Storyteller digest yet', () => {
    const signal = printStoryDigestSignal({
      digests: [],
      printInsights: printInsights(),
      ncriRecords: [ncri()],
      nowMs: Date.parse('2026-05-30T13:10:00.000Z'),
    });

    expect(signal).toMatchObject({
      tone: 'warn',
      summary: 'No Storyteller digest',
      eventCount: 0,
    });
    expect(signal.detail).toContain('Run Storyteller');
  });

  test('warns when the dispatch needs review before print canon is safe to show', () => {
    const signal = printStoryDigestSignal({
      digests: [
        digest({
          dispatch: {
            dispatchId: 'dispatch-review',
            generatedAt: '2026-05-30T13:02:00.000Z',
            needsReview: true,
            warningCount: 1,
            publicBullets: [],
            operatorWarnings: ['Unsupported AP claim was removed.'],
            reviewReasons: ['unsupported_ap_claim'],
            eventRefCount: 1,
            eventRefsUsed: ['ncri-sale-1'],
          },
        }),
      ],
      printInsights: printInsights(),
      ncriRecords: [ncri()],
      nowMs: Date.parse('2026-05-30T13:10:00.000Z'),
    });

    expect(signal).toMatchObject({
      tone: 'warn',
      summary: 'Story needs review',
      dispatchNeedsReview: true,
      reviewReasons: ['unsupported_ap_claim'],
    });
    expect(signal.detail).toContain('unsupported_ap_claim');
  });

  test('warns when the latest digest is stale even if it once cited NCRI events', () => {
    const signal = printStoryDigestSignal({
      digests: [digest({ builtAt: '2026-05-30T10:00:00.000Z', dispatch: undefined })],
      printInsights: printInsights(),
      ncriRecords: [ncri()],
      nowMs: Date.parse('2026-05-30T13:10:00.000Z'),
    });

    expect(signal).toMatchObject({
      tone: 'warn',
      summary: 'Story digest stale',
      latestAgeMinutes: 190,
    });
  });

  test('warns when active NCRI signals are absent from the latest digest', () => {
    const signal = printStoryDigestSignal({
      digests: [
        digest({
          topEvents: [
            {
              ref: 'woodcut-1',
              kind: 'woodcutting_xp',
              residentName: 'res:hans',
              evidenceLabels: ['woodcutting'],
            },
          ],
        }),
      ],
      printInsights: printInsights(),
      ncriRecords: [ncri()],
      nowMs: Date.parse('2026-05-30T13:10:00.000Z'),
    });

    expect(signal).toMatchObject({
      tone: 'warn',
      summary: 'NCRI not in latest story',
      eventCount: 0,
    });
  });
});
