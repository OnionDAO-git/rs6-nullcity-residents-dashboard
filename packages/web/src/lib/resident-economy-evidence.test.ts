import { describe, expect, test } from 'bun:test';
import type { ResidentEconomy } from './api';
import type { NullCityLiveEconomyBridgeResponse, NullCityLiveEconomySnapshot } from './city-api';
import { residentEconomyGpEvidence, residentLiveEconomyGpEvidence } from './resident-economy-evidence';

function economy(recentEvents: ResidentEconomy['recentEvents']): ResidentEconomy {
  return { ap: 42, activeGoals: [], recentEvents };
}

function liveEconomy(overrides: Partial<NullCityLiveEconomySnapshot>): NullCityLiveEconomyBridgeResponse {
  return {
    available: true,
    snapshot: {
      asOf: '2026-05-30T22:40:00.000Z',
      window: { since: '2026-05-30T22:25:00.000Z', windowMs: 900000 },
      city: { residentCount: 1, activeResidentCount: 1, attentionTotal: 42, attentionDelta: 0, gpNetDelta: 0 },
      countsByKind: {},
      topResidentsByAttention: [],
      residents: [],
      recentEvents: [],
      pendingProposals: [],
      ...overrides,
    },
  };
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

  test('matches live-economy GP events to public resident slugs', () => {
    expect(residentLiveEconomyGpEvidence(liveEconomy({
      recentEvents: [
        {
          id: 'live-1',
          ts: '2026-05-30T22:31:00.000Z',
          kind: 'gp_observed',
          residentName: 'res:agent',
          note: 'observed 1821 GP in item 995',
        },
      ],
    }), 'agent')).toEqual({
      tone: 'ok',
      summary: 'Recent economy GP evidence is available.',
      detail: 'gp_observed: observed 1821 GP in item 995',
    });
  });

  test('uses live-economy resident GP deltas when event details aged out of the window', () => {
    expect(residentLiveEconomyGpEvidence(liveEconomy({
      residents: [
        {
          residentName: 'res:agent',
          attentionBalance: 50116,
          gpNetDelta: -6,
          eventCount: 8,
          windowEventCount: 0,
          activeInWindow: false,
          online: true,
        },
      ],
    }), 'res:agent')).toEqual({
      tone: 'ok',
      summary: 'Recent economy GP evidence is available.',
      detail: 'live_economy: GP net delta -6 across 8 economy events',
    });
  });

  test('does not invent live-economy GP proof from AP-only residents', () => {
    expect(residentLiveEconomyGpEvidence(liveEconomy({
      residents: [
        {
          residentName: 'res:agent',
          attentionBalance: 50116,
          gpNetDelta: 0,
          eventCount: 3,
          windowEventCount: 0,
          activeInWindow: false,
          online: true,
        },
      ],
    }), 'res:agent')).toBeUndefined();
  });
});
