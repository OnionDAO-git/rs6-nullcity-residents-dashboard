import { describe, expect, test } from 'bun:test';
import { economyEventDisplay, economyResidentDisplay, economyStreamStatusAfterTimeout, summarizeEconomyHeartbeat, summarizeEconomyListings, summarizeEconomyTransport, summarizeLiveEconomy } from './live-economy';
import type { NullCityEconomyHeartbeatBridgeResponse, NullCityEconomyListingsBridgeResponse, NullCityLiveEconomyBridgeResponse } from './city-api';

describe('summarizeLiveEconomy', () => {
  test('summarizes a fresh city-wide AP/GP economy snapshot', () => {
    const response: NullCityLiveEconomyBridgeResponse = {
      available: true,
      snapshot: {
        asOf: '2026-05-30T17:47:00.000Z',
        window: { since: '2026-05-30T17:32:00.000Z', windowMs: 900000 },
        city: { residentCount: 23, activeResidentCount: 5, attentionTotal: 50000, attentionDelta: 125, gpNetDelta: -20 },
        countsByKind: { ap_topup: 2, gp_traded: 1 },
        topResidentsByAttention: [
          { residentName: 'res:hans', attentionBalance: 5000, gpNetDelta: 0, eventCount: 4, windowEventCount: 2, activeInWindow: true, online: true },
        ],
        residents: [],
        recentEvents: [
          { id: 'evt-1', ts: '2026-05-30T17:45:00.000Z', kind: 'ap_topup', residentName: 'res:hans', cityUserId: '<patron #1>', apDelta: 50 },
        ],
        pendingProposals: [
          { proposalId: 'proposal-1', residentName: 'res:lantern', goalText: 'Keep the square lit.', apFunded: 80, apThreshold: 100, status: 'funding' },
        ],
      },
    };

    expect(summarizeLiveEconomy(response)).toEqual({
      tone: 'ok',
      headline: '23 residents carrying 50,000 AP',
      detail: '5 active in economy window · AP Δ +125 · GP Δ -20',
      eventLabel: '3 AP/GP events',
      proposalLabel: '1 Soul funding',
    });
  });

  test('reports missing bridge configuration without pretending the economy is empty', () => {
    expect(summarizeLiveEconomy({ available: false, error: 'not_configured' })).toEqual({
      tone: 'warn',
      headline: 'Live economy bridge not configured',
      detail: 'Set NULLCITY_CITY_API_URL and NULLCITY_CITY_API_TOKEN for AP/GP totals.',
      eventLabel: 'no live events',
      proposalLabel: 'no live proposals',
    });
  });
});

describe('summarizeEconomyHeartbeat', () => {
  test('summarizes live controller and economy liveness separately from the rolling event window', () => {
    const response: NullCityEconomyHeartbeatBridgeResponse = {
      available: true,
      heartbeat: {
        asOf: '2026-05-30T18:52:00.000Z',
        controllerUptimeSec: 372,
        residentCount: 25,
        activeResidentCount: 23,
        economyEventCount: 28,
        lastEconomyEventTs: '2026-05-30T18:51:10.000Z',
        lastEconomyEventKind: 'ap_gp_exchange',
        lastDigestBuiltAt: '2026-05-30T18:50:00.000Z',
        degradedFlags: [],
      },
    };

    expect(summarizeEconomyHeartbeat(response)).toEqual({
      tone: 'ok',
      headline: '23 / 25 residents active',
      detail: '28 economy events · last ap gp exchange 50s ago · digest 2m ago',
      degradedLabel: 'healthy',
    });
  });

  test('keeps heartbeat freshness explicit when event or digest timestamps are missing', () => {
    const response: NullCityEconomyHeartbeatBridgeResponse = {
      available: true,
      heartbeat: {
        asOf: '2026-05-30T18:52:00.000Z',
        controllerUptimeSec: 372,
        residentCount: 2,
        activeResidentCount: 0,
        economyEventCount: 0,
        degradedFlags: ['no_active_residents'],
      },
    };

    expect(summarizeEconomyHeartbeat(response)).toMatchObject({
      tone: 'fail',
      detail: '0 economy events · last none · digest unknown',
      degradedLabel: 'no_active_residents',
    });
  });

  test('warns when the heartbeat bridge is unavailable', () => {
    expect(summarizeEconomyHeartbeat({ available: false, error: 'not_configured' })).toEqual({
      tone: 'warn',
      headline: 'Economy heartbeat unavailable',
      detail: 'Set NULLCITY_CITY_API_URL and NULLCITY_CITY_API_TOKEN to show controller liveness.',
      degradedLabel: 'bridge',
    });
  });
});

describe('summarizeEconomyListings', () => {
  test('summarizes listed NCRIs without needing the full admin registry', () => {
    const response: NullCityEconomyListingsBridgeResponse = {
      available: true,
      asOf: '2026-05-30T18:52:00.000Z',
      listings: [
        {
          ncriId: 'ncri-1',
          itemId: 4151,
          displayName: 'Abyssal Whip of the City',
          owner: 'user:buyer',
          sourceResidentName: 'res:hans',
          approvalStatus: 'approved',
          redemptionStatus: 'available',
          createdAt: '2026-05-30T18:40:00.000Z',
          updatedAt: '2026-05-30T18:45:00.000Z',
          listed: true,
        },
      ],
    };

    expect(summarizeEconomyListings(response)).toEqual({
      tone: 'ok',
      headline: '1 NCRI listed',
      detail: 'Latest: Abyssal Whip of the City from res:hans',
    });
  });
});

describe('summarizeEconomyTransport', () => {
  const liveResponse: NullCityLiveEconomyBridgeResponse = {
    available: true,
    snapshot: {
      asOf: '2026-05-30T18:52:00.000Z',
      window: { since: '2026-05-30T18:37:00.000Z', windowMs: 900000 },
      city: { residentCount: 25, activeResidentCount: 23, attentionTotal: 291775, attentionDelta: 100, gpNetDelta: -12 },
      countsByKind: { ap_topup: 1 },
      topResidentsByAttention: [],
      residents: [],
      recentEvents: [],
      pendingProposals: [],
    },
  };

  test('announces when economy snapshots are arriving over the stream', () => {
    expect(summarizeEconomyTransport('live', liveResponse, { available: true, heartbeat: {
      asOf: '2026-05-30T18:52:00.000Z',
      controllerUptimeSec: 60,
      residentCount: 25,
      activeResidentCount: 23,
      economyEventCount: 48,
      degradedFlags: [],
    } })).toEqual({
      tone: 'ok',
      label: 'stream',
      detail: 'SSE snapshots are updating heartbeat and AP/GP totals.',
    });
  });

  test('uses polling fallback copy when the stream cannot stay open', () => {
    expect(summarizeEconomyTransport('fallback', liveResponse, { available: true, heartbeat: {
      asOf: '2026-05-30T18:52:00.000Z',
      controllerUptimeSec: 60,
      residentCount: 25,
      activeResidentCount: 23,
      economyEventCount: 48,
      degradedFlags: [],
    } })).toEqual({
      tone: 'warn',
      label: 'polling',
      detail: 'Economy stream is unavailable; polling live and heartbeat routes.',
    });
  });

  test('keeps bridge-missing copy distinct from a healthy polling fallback', () => {
    expect(summarizeEconomyTransport('polling', { available: false, error: 'not_configured' }, { available: false, error: 'not_configured' })).toEqual({
      tone: 'warn',
      label: 'bridge',
      detail: 'Set NULLCITY_CITY_API_URL and NULLCITY_CITY_API_TOKEN before stream or polling transport can load.',
    });
  });

  test('falls back from a stuck opening stream without downgrading an active stream', () => {
    expect(economyStreamStatusAfterTimeout('connecting')).toBe('fallback');
    expect(economyStreamStatusAfterTimeout('live')).toBe('live');
    expect(economyStreamStatusAfterTimeout('fallback')).toBe('fallback');
  });
});

describe('economy row display helpers', () => {
  test('formats AP and GP deltas without dropping zero-value resident context', () => {
    expect(economyEventDisplay({
      id: 'evt-1',
      ts: '2026-05-30T18:00:00.000Z',
      kind: 'ap_gp_exchange',
      residentName: 'res:qa-trader',
      apDelta: 100,
      gpDelta: -50,
      cityUserId: '<operator>',
    })).toEqual({
      kindLabel: 'ap gp exchange',
      title: 'res:qa-trader · AP +100 · GP -50',
      detail: '<operator>',
    });

    expect(economyEventDisplay({
      id: 'evt-2',
      ts: '2026-05-30T18:01:00.000Z',
      kind: 'gp_observed',
      residentName: 'res:hans',
      gpDelta: 0,
    }).title).toBe('res:hans · GP 0');
  });

  test('summarizes resident AP, GP, online, and window activity for dense viewer rows', () => {
    expect(economyResidentDisplay({
      residentName: 'res:hans',
      attentionBalance: 4200,
      gpNetDelta: 25,
      eventCount: 9,
      windowEventCount: 3,
      activeInWindow: true,
      online: true,
      lastEventTs: '2026-05-30T18:00:00.000Z',
    })).toEqual({
      tone: 'ok',
      title: 'res:hans',
      detail: '4,200 AP · GP Δ +25 · 3 recent events',
      status: 'online + active',
    });

    expect(economyResidentDisplay({
      residentName: 'res:quiet',
      attentionBalance: 0,
      gpNetDelta: 0,
      eventCount: 0,
      windowEventCount: 0,
      activeInWindow: false,
      online: false,
    })).toMatchObject({
      tone: 'warn',
      status: 'offline',
    });
  });
});
