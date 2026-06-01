import { describe, expect, test } from 'bun:test';
import { economyEventDisplay, economyResidentDisplay, economyStreamStatusAfterTimeout, selfFundedApResidentRows, summarizeEconomyHeartbeat, summarizeEconomyListings, summarizeEconomyTransport, summarizeLiveEconomy } from './live-economy';
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
      detail: '5 residents with economy events in 15m · AP Δ +125 · GP Δ -20',
      eventLabel: '3 AP/GP events',
      proposalLabel: '1 Soul funding',
      selfFundedLabel: 'no self-funded AP',
    });
  });

  test('describes quiet economy windows without implying live residents are offline', () => {
    const response: NullCityLiveEconomyBridgeResponse = {
      available: true,
      snapshot: {
        asOf: '2026-05-30T17:47:00.000Z',
        window: { since: '2026-05-30T17:32:00.000Z', windowMs: 900000 },
        city: { residentCount: 23, activeResidentCount: 0, attentionTotal: 50000, attentionDelta: 0, gpNetDelta: 0 },
        countsByKind: {},
        topResidentsByAttention: [],
        residents: [],
        recentEvents: [],
        pendingProposals: [],
      },
    };

    const summary = summarizeLiveEconomy(response);

    expect(summary).toMatchObject({
      tone: 'warn',
      headline: '23 residents carrying 50,000 AP',
      detail: '0 residents with economy events in 15m · AP Δ 0 · GP Δ 0',
      eventLabel: '0 AP/GP events',
    });
    expect(summary.detail).not.toContain('active');
  });

  test('summarizes resident GP-to-AP exchanges as self-funded AP', () => {
    const response: NullCityLiveEconomyBridgeResponse = {
      available: true,
      snapshot: {
        asOf: '2026-05-31T06:50:00.000Z',
        window: { since: '2026-05-31T06:35:00.000Z', windowMs: 900000 },
        city: { residentCount: 23, activeResidentCount: 8, attentionTotal: 50000, attentionDelta: 542, gpNetDelta: -271 },
        countsByKind: { ap_gp_exchange: 2 },
        topResidentsByAttention: [],
        residents: [],
        recentEvents: [
          { id: 'exchange-1', ts: '2026-05-31T06:49:00.000Z', kind: 'ap_gp_exchange', residentName: 'res:trader', apDelta: 492, gpDelta: -246 },
          { id: 'exchange-2', ts: '2026-05-31T06:42:00.000Z', kind: 'ap_gp_exchange', residentName: 'res:woodcutter', apDelta: 50, gpDelta: -25 },
        ],
        pendingProposals: [],
      },
    };

    expect(summarizeLiveEconomy(response).selfFundedLabel).toBe('542 AP via res:trader');
  });

  test('reports missing bridge configuration without pretending the economy is empty', () => {
    const summary = summarizeLiveEconomy({ available: false, error: 'not_configured' });
    expect(summary).toEqual({
      tone: 'warn',
      headline: 'Live economy bridge not configured',
      detail: 'Connect the Null City bridge to show AP/GP totals.',
      eventLabel: 'no live events',
      proposalLabel: 'no live proposals',
      selfFundedLabel: 'no self-funded AP',
    });
    expect(summary.detail).not.toContain('NULLCITY_');
  });
});

describe('selfFundedApResidentRows', () => {
  test('returns no rows when the live economy bridge is unavailable or has no exchange events', () => {
    expect(selfFundedApResidentRows(undefined)).toEqual([]);
    expect(selfFundedApResidentRows({ available: false, error: 'not_configured' })).toEqual([]);
    expect(selfFundedApResidentRows({
      available: true,
      snapshot: {
        asOf: '2026-05-31T06:50:00.000Z',
        window: { since: '2026-05-31T06:35:00.000Z', windowMs: 900000 },
        city: { residentCount: 23, activeResidentCount: 8, attentionTotal: 50000, attentionDelta: 75, gpNetDelta: 0 },
        countsByKind: { ap_topup: 1 },
        topResidentsByAttention: [],
        residents: [],
        recentEvents: [
          { id: 'grant-1', ts: '2026-05-31T06:48:00.000Z', kind: 'ap_topup', residentName: 'res:trader', apDelta: 75 },
        ],
        pendingProposals: [],
      },
    })).toEqual([]);
  });

  test('aggregates GP-to-AP exchanges by resident and sorts newest first', () => {
    const response: NullCityLiveEconomyBridgeResponse = {
      available: true,
      snapshot: {
        asOf: '2026-05-31T06:50:00.000Z',
        window: { since: '2026-05-31T06:35:00.000Z', windowMs: 900000 },
        city: { residentCount: 23, activeResidentCount: 8, attentionTotal: 50000, attentionDelta: 592, gpNetDelta: -296 },
        countsByKind: { ap_gp_exchange: 3 },
        topResidentsByAttention: [],
        residents: [],
        recentEvents: [
          { id: 'exchange-1', ts: '2026-05-31T06:44:00.000Z', kind: 'ap_gp_exchange', residentName: 'res:trader', apDelta: 100, gpDelta: -50 },
          { id: 'exchange-2', ts: '2026-05-31T06:49:00.000Z', kind: 'ap_gp_exchange', residentName: 'res:woodcutter', apDelta: 50, gpDelta: -25 },
          { id: 'exchange-3', ts: '2026-05-31T06:47:00.000Z', kind: 'ap_gp_exchange', residentName: 'res:trader', apDelta: 442, gpDelta: -221 },
          { id: 'grant-1', ts: '2026-05-31T06:48:00.000Z', kind: 'ap_topup', residentName: 'res:trader', apDelta: 75 },
        ],
        pendingProposals: [],
      },
    };

    expect(selfFundedApResidentRows(response)).toEqual([
      {
        residentName: 'res:woodcutter',
        apTotal: 50,
        gpSpent: 25,
        exchangeCount: 1,
        latestAt: '2026-05-31T06:49:00.000Z',
        detail: '50 AP for 25 GP across 1 exchange',
      },
      {
        residentName: 'res:trader',
        apTotal: 542,
        gpSpent: 271,
        exchangeCount: 2,
        latestAt: '2026-05-31T06:47:00.000Z',
        detail: '542 AP for 271 GP across 2 exchanges',
      },
    ]);
  });

  test('respects the requested resident row limit after newest-first sorting', () => {
    const response: NullCityLiveEconomyBridgeResponse = {
      available: true,
      snapshot: {
        asOf: '2026-05-31T06:50:00.000Z',
        window: { since: '2026-05-31T06:35:00.000Z', windowMs: 900000 },
        city: { residentCount: 23, activeResidentCount: 8, attentionTotal: 50000, attentionDelta: 200, gpNetDelta: -100 },
        countsByKind: { ap_gp_exchange: 3 },
        topResidentsByAttention: [],
        residents: [],
        recentEvents: [
          { id: 'exchange-1', ts: '2026-05-31T06:44:00.000Z', kind: 'ap_gp_exchange', residentName: 'res:older', apDelta: 50, gpDelta: -25 },
          { id: 'exchange-2', ts: '2026-05-31T06:48:00.000Z', kind: 'ap_gp_exchange', residentName: 'res:middle', apDelta: 50, gpDelta: -25 },
          { id: 'exchange-3', ts: '2026-05-31T06:49:00.000Z', kind: 'ap_gp_exchange', residentName: 'res:newest', apDelta: 100, gpDelta: -50 },
        ],
        pendingProposals: [],
      },
    };

    expect(selfFundedApResidentRows(response, 2).map(row => row.residentName)).toEqual([
      'res:newest',
      'res:middle',
    ]);
  });

  test('does not invent resident attribution for unattributed GP-to-AP exchange rows', () => {
    const response: NullCityLiveEconomyBridgeResponse = {
      available: true,
      snapshot: {
        asOf: '2026-05-31T06:50:00.000Z',
        window: { since: '2026-05-31T06:35:00.000Z', windowMs: 900000 },
        city: { residentCount: 23, activeResidentCount: 8, attentionTotal: 50000, attentionDelta: 150, gpNetDelta: -75 },
        countsByKind: { ap_gp_exchange: 2 },
        topResidentsByAttention: [],
        residents: [],
        recentEvents: [
          { id: 'exchange-1', ts: '2026-05-31T06:44:00.000Z', kind: 'ap_gp_exchange', apDelta: 100, gpDelta: -50 },
          { id: 'exchange-2', ts: '2026-05-31T06:49:00.000Z', kind: 'ap_gp_exchange', residentName: 'res:known', apDelta: 50, gpDelta: -25 },
        ],
        pendingProposals: [],
      },
    };

    expect(selfFundedApResidentRows(response)).toEqual([
      {
        residentName: 'res:known',
        apTotal: 50,
        gpSpent: 25,
        exchangeCount: 1,
        latestAt: '2026-05-31T06:49:00.000Z',
        detail: '50 AP for 25 GP across 1 exchange',
      },
    ]);
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
    const summary = summarizeEconomyHeartbeat({ available: false, error: 'not_configured' });
    expect(summary).toEqual({
      tone: 'warn',
      headline: 'Economy heartbeat unavailable',
      detail: 'Connect the Null City bridge to show controller liveness.',
      degradedLabel: 'bridge',
    });
    expect(summary.detail).not.toContain('NULLCITY_');
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
    const summary = summarizeEconomyTransport('polling', { available: false, error: 'not_configured' }, { available: false, error: 'not_configured' });
    expect(summary).toEqual({
      tone: 'warn',
      label: 'bridge',
      detail: 'Connect the Null City bridge before stream or polling transport can load.',
    });
    expect(summary.detail).not.toContain('NULLCITY_');
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
      status: 'online + AP/GP active',
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

  test('separates online liveness from quiet or recent AP/GP ledger activity', () => {
    expect(economyResidentDisplay({
      residentName: 'res:online-quiet',
      attentionBalance: 1800,
      gpNetDelta: 0,
      eventCount: 4,
      windowEventCount: 0,
      activeInWindow: false,
      online: true,
    })).toMatchObject({
      tone: 'warn',
      status: 'online, no AP/GP events',
      detail: '1,800 AP · GP Δ 0 · 0 recent events',
    });

    expect(economyResidentDisplay({
      residentName: 'res:ledger-recent',
      attentionBalance: 3200,
      gpNetDelta: -25,
      eventCount: 12,
      windowEventCount: 1,
      activeInWindow: true,
      online: false,
    })).toMatchObject({
      tone: 'warn',
      status: 'recent AP/GP activity',
      detail: '3,200 AP · GP Δ -25 · 1 recent event',
    });
  });
});
