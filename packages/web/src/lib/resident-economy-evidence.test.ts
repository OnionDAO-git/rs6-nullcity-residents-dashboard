import { describe, expect, test } from 'bun:test';
import type { ResidentEconomy } from './api';
import { residentEconomyGpEvidence } from './resident-economy-evidence';

function economy(recentEvents: ResidentEconomy['recentEvents']): ResidentEconomy {
  return { ap: 42, activeGoals: [], recentEvents };
}

describe('resident economy evidence', () => {
  test('summarizes recent GP observations as economy-backed evidence', () => {
    expect(residentEconomyGpEvidence(economy([
      {
        id: 'event-1',
        ts: '2026-05-30T21:10:00.000Z',
        kind: 'gp_observed',
        note: 'observed 24138 GP in item 995',
      },
    ]))).toEqual({
      tone: 'ok',
      summary: 'Recent economy GP evidence is available.',
      detail: 'gp_observed: observed 24138 GP in item 995',
    });
  });

  test('treats AP-for-GP exchanges as GP evidence even when no current inventory is attached', () => {
    expect(residentEconomyGpEvidence(economy([
      {
        id: 'event-2',
        ts: '2026-05-30T21:20:00.000Z',
        kind: 'ap_gp_exchange',
        apDelta: 20,
        gpDelta: -10,
        note: 'exchanged 10 GP for 20 AP',
      },
    ]))).toEqual({
      tone: 'ok',
      summary: 'Recent economy GP evidence is available.',
      detail: 'ap_gp_exchange: exchanged 10 GP for 20 AP',
    });
  });

  test('returns undefined when the recent economy window has no GP proof', () => {
    expect(residentEconomyGpEvidence(economy([
      {
        id: 'event-3',
        ts: '2026-05-30T21:30:00.000Z',
        kind: 'ap_topup',
        apDelta: 5,
        note: 'patron support',
      },
    ]))).toBeUndefined();
  });
});
