import { describe, expect, test } from 'bun:test';
import type { EconomyEvent } from './api';
import { summarizeNcriEvents } from './economy-insights';

function event(input: Partial<EconomyEvent> & Pick<EconomyEvent, 'id' | 'ts' | 'kind'>): EconomyEvent {
  return input as EconomyEvent;
}

describe('summarizeNcriEvents', () => {
  test('returns undefined when no NCRI-linked events are present', () => {
    expect(summarizeNcriEvents([
      event({ id: 'e1', ts: '2026-05-30T00:00:00.000Z', kind: 'ap_grant', apDelta: 10 }),
      event({ id: 'e2', ts: '2026-05-30T00:01:00.000Z', kind: 'gp_earned', gpDelta: 15 }),
    ])).toBeUndefined();
  });

  test('summarizes NCRI sales and redemptions with net AP/GP deltas and latest ids', () => {
    const summary = summarizeNcriEvents([
      event({ id: 'e1', ts: '2026-05-30T00:00:00.000Z', kind: 'ncri_sale', ncriId: 'ncri-a1', apDelta: -40, gpDelta: 12 }),
      event({ id: 'e2', ts: '2026-05-30T00:01:00.000Z', kind: 'ap_grant', apDelta: 10 }),
      event({ id: 'e3', ts: '2026-05-30T00:02:00.000Z', kind: 'ncri_redemption', ncriId: 'ncri-a1', apDelta: 15, gpDelta: -2 }),
      event({ id: 'e4', ts: '2026-05-30T00:03:00.000Z', kind: 'ncri_sale', ncriId: 'ncri-b7', apDelta: -12, gpDelta: 5 }),
    ]);

    expect(summary).toEqual({
      eventCount: 3,
      saleCount: 2,
      redemptionCount: 1,
      netApDelta: -37,
      netGpDelta: 15,
      recentNcriIds: ['ncri-b7', 'ncri-a1'],
    });
  });
});
