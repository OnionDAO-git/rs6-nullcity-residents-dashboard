import { describe, expect, test } from 'bun:test';
import type { ResidentEconomy } from './api';
import type { NullCityLiveEconomyBridgeResponse, NullCityLiveEconomySnapshot } from './city-api';
import { residentEconomyGpEvidence, residentEconomyReceiptTrail, residentLiveEconomyGpEvidence, residentLiveEconomyMoment } from './resident-economy-evidence';

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

  test('summarizes live AP support as a resident economy moment', () => {
    expect(residentLiveEconomyMoment(liveEconomy({
      recentEvents: [
        {
          id: 'live-2',
          ts: '2026-05-30T22:32:00.000Z',
          kind: 'ap_topup',
          residentName: 'res:thrand',
          apDelta: 75,
          note: 'patron support',
        },
      ],
    }), 'thrand')).toEqual({
      tone: 'ok',
      label: 'AP support',
      title: 'Recent AP support landed.',
      detail: '+75 AP · patron support',
    });
  });

  test('summarizes live AP-for-GP exchanges as a resident economy moment', () => {
    expect(residentLiveEconomyMoment(liveEconomy({
      recentEvents: [
        {
          id: 'live-3',
          ts: '2026-05-30T22:33:00.000Z',
          kind: 'ap_gp_exchange',
          residentName: 'res:agent',
          apDelta: 20,
          gpDelta: -10,
          note: 'exchanged 10 GP for 20 AP',
        },
      ],
    }), 'res:agent')).toEqual({
      tone: 'ok',
      label: 'AP/GP exchange',
      title: 'Converted real GP into AP.',
      detail: '+20 AP · -10 GP · exchanged 10 GP for 20 AP',
    });
  });

  test('builds compact live AP/GP receipt rows for the selected resident', () => {
    expect(residentEconomyReceiptTrail({
      residentName: 'agent',
      liveEconomy: liveEconomy({
        recentEvents: [
          {
            id: 'live-other',
            ts: '2026-05-30T22:34:00.000Z',
            kind: 'ap_topup',
            residentName: 'res:other',
            apDelta: 5,
          },
          {
            id: 'live-4',
            refId: 'library:event:4',
            ts: '2026-05-30T22:35:00.000Z',
            kind: 'ap_gp_exchange',
            residentName: 'res:agent',
            apDelta: 20,
            gpDelta: -10,
            note: 'exchanged 10 GP for 20 AP',
          },
        ],
      }),
    })).toEqual([
      {
        id: 'live-4',
        source: 'live',
        kind: 'ap_gp_exchange',
        deltaLabel: 'AP +20 · GP -10',
        refLabel: 'library:event:4',
        ts: '2026-05-30T22:35:00.000Z',
        note: 'exchanged 10 GP for 20 AP',
      },
    ]);
  });

  test('deduplicates live and resident economy receipts while preserving newest order', () => {
    expect(residentEconomyReceiptTrail({
      residentName: 'res:agent',
      limit: 2,
      liveEconomy: liveEconomy({
        recentEvents: [
          {
            id: 'shared-event',
            refId: 'live-ref',
            ts: '2026-05-30T22:36:00.000Z',
            kind: 'gp_observed',
            residentName: 'res:agent',
            gpDelta: 12,
            note: 'observed 12 GP',
          },
        ],
      }),
      economy: economy([
        {
          id: 'resident-newer',
          ts: '2026-05-30T22:37:00.000Z',
          kind: 'ap_topup',
          apDelta: 50,
          note: 'patron support',
        },
        {
          id: 'shared-event',
          ts: '2026-05-30T22:36:00.000Z',
          kind: 'gp_observed',
          gpDelta: 12,
          note: 'observed 12 GP',
        },
      ]),
    })).toEqual([
      {
        id: 'resident-newer',
        source: 'resident',
        kind: 'ap_topup',
        deltaLabel: 'AP +50',
        refLabel: 'resident-newer',
        ts: '2026-05-30T22:37:00.000Z',
        note: 'patron support',
      },
      {
        id: 'shared-event',
        source: 'live',
        kind: 'gp_observed',
        deltaLabel: 'GP +12',
        refLabel: 'live-ref',
        ts: '2026-05-30T22:36:00.000Z',
        note: 'observed 12 GP',
      },
    ]);
  });

  test('keeps legacy null economy deltas from crashing receipt labels', () => {
    expect(residentEconomyReceiptTrail({
      economy: economy([
        {
          id: 'legacy-gp',
          ts: '2026-05-30T22:38:00.000Z',
          kind: 'gp_observed',
          gpDelta: null,
          note: 'observed 24133 GP in item 995',
        } as unknown as ResidentEconomy['recentEvents'][number],
      ]),
    })).toEqual([
      {
        id: 'legacy-gp',
        source: 'resident',
        kind: 'gp_observed',
        deltaLabel: 'no AP/GP delta',
        refLabel: 'legacy-gp',
        ts: '2026-05-30T22:38:00.000Z',
        note: 'observed 24133 GP in item 995',
      },
    ]);
  });
});
