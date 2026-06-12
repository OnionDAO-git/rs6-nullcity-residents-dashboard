import { describe, expect, test } from 'bun:test';
import type { DashboardOverview, GatewayStatus, ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { ResidentReadModel } from './city-api';
import {
  findResidentReadModel,
  cityDataNoticeCopy,
  loadCitySnapshotWithLiveFallback,
  residentRowsNeedLiveFallback,
  residentRowsForCityDirectory,
  residentDetailEmptyState,
  residentLoopAvailabilityState,
  residentRosterEmptyState,
  residentRouteSlug,
  resolveResidentRouteId,
} from './resident-route';

function row(name: string): ResidentDashboardRow {
  return { name, online: true };
}

function readModel(input: Partial<ResidentReadModel> & Pick<ResidentReadModel, 'id'>): ResidentReadModel {
  return {
    nullcityResidentId: input.id,
    displayName: input.id,
    status: 'unknown',
    metadata: {},
    updatedAt: '2026-05-30T00:00:00.000Z',
    ...input,
  };
}

function gateway(input: Partial<GatewayStatus> = {}): GatewayStatus {
  return {
    configuredUrl: 'ws://127.0.0.1:8787',
    connected: false,
    ...input,
  };
}

describe('resident route helpers', () => {
  test('normalizes public resident route slugs without the res prefix', () => {
    expect(residentRouteSlug('res:agent')).toBe('agent');
    expect(residentRouteSlug(' Agent ')).toBe('agent');
  });

  test('resolves public resident slugs to live resident ids before supplemental reads', () => {
    expect(resolveResidentRouteId('agent', [row('res:agent')])).toBe('res:agent');
    expect(resolveResidentRouteId('RES:AGENT', [row('res:agent')])).toBe('res:agent');
    expect(resolveResidentRouteId('missing', [row('res:agent')])).toBe('missing');
  });

  test('keeps city resident directory grounded in live rows when snapshot rows are empty', () => {
    const liveRows = [row('res:agent'), row('res:hans')];

    expect(residentRowsForCityDirectory([], liveRows)).toEqual(liveRows);
    expect(residentRowsForCityDirectory(undefined, liveRows)).toEqual(liveRows);
    expect(residentRowsForCityDirectory([row('res:pip')], liveRows)).toEqual([row('res:pip')]);
  });

  test('asks the city route to fetch live rows when the overview has no resident rows', () => {
    expect(residentRowsNeedLiveFallback([])).toBe(true);
    expect(residentRowsNeedLiveFallback(undefined)).toBe(true);
    expect(residentRowsNeedLiveFallback([row('res:agent')])).toBe(false);
  });

  test('falls back to live residents and gateway status when the city overview is slow', async () => {
    const liveRows = [row('res:agent')];

    const snapshot = await loadCitySnapshotWithLiveFallback({
      overview: () => new Promise<DashboardOverview>(() => undefined),
      residents: async () => liveRows,
      gatewayStatus: async () => gateway({ connected: true }),
    }, { overviewTimeoutMs: 1 });

    expect(snapshot).toEqual({
      overview: undefined,
      gatewayStatus: gateway({ connected: true }),
      residents: liveRows,
      error: 'City overview unavailable; showing live resident fallback.',
    });
  });

  test('keeps fallback error copy honest when live residents load after overview failure', async () => {
    const liveRows = [row('res:agent')];

    const snapshot = await loadCitySnapshotWithLiveFallback({
      overview: async () => {
        throw new Error('City data is not connected. Showing the shell with empty states.');
      },
      residents: async () => liveRows,
      gatewayStatus: async () => gateway({ connected: true }),
    }, { overviewTimeoutMs: 10 });

    expect(snapshot.error).toBe('City overview unavailable; showing live resident fallback.');
  });

  test('shows fallback-specific city notice copy without exposing generic raw errors', () => {
    expect(cityDataNoticeCopy('City overview unavailable; showing live resident fallback.')).toBe('City details are still loading. Live residents are available.');
    expect(cityDataNoticeCopy('500 Internal Server Error')).toBe('City details are still loading. You can still use the actions below.');
  });

  test('finds projected resident records from the loaded directory without a detail fetch', () => {
    const residents = [
      readModel({ id: 'resident-1', nullcityResidentId: 'res:hans', displayName: 'Hans' }),
      readModel({ id: 'resident-2', nullcityResidentId: 'res:qa-woodcutter', displayName: 'QA Woodcutter' }),
    ];

    expect(findResidentReadModel(residents, 'qa-woodcutter')?.displayName).toBe('QA Woodcutter');
    expect(findResidentReadModel(residents, 'res:qa-woodcutter')?.id).toBe('resident-2');
    expect(findResidentReadModel(residents, 'missing')).toBeUndefined();
  });

  test('keeps resident detail fallback copy honest while live data is loading', () => {
    expect(residentDetailEmptyState({ loading: true, residentCount: 0, hasLiveHints: false })).toEqual({
      title: 'Resident page is loading',
      detail: 'Use Watch or Residents while this resident page catches up.',
    });
    expect(residentDetailEmptyState({
      loading: false,
      residentCount: 0,
      hasLiveHints: true,
      cityDataError: '500 Internal Server Error',
    })).toEqual({
      title: 'Resident page is catching up',
      detail: 'This resident may still be active. Use Watch or Residents while the page updates.',
    });
    expect(residentDetailEmptyState({ loading: false, residentCount: 2, hasLiveHints: true })).toEqual({
      title: 'Resident not found',
      detail: 'Go back to Residents and choose someone from the current list.',
    });
  });

  test('keeps resident roster fallback copy honest while live data is loading', () => {
    expect(residentRosterEmptyState({ loading: true, hasLiveHints: false })).toEqual({
      title: 'Resident list is loading',
      detail: 'Use Watch or Residents while residents load.',
    });
    expect(residentRosterEmptyState({ loading: false, hasLiveHints: false })).toEqual({
      title: 'No residents are listed yet',
      detail: 'Open Watch or Residents while residents arrive.',
    });
    expect(residentRosterEmptyState({ loading: false, hasLiveHints: true, gatewayOrControllerConnected: true })).toEqual({
      title: 'Resident list is catching up',
      detail: 'The city is responding. Use Watch or Residents while the resident list updates.',
    });
    expect(
      residentRosterEmptyState({
        loading: false,
        hasLiveHints: true,
        activeResidentCount: 17,
        residentCount: 23,
      }),
    ).toEqual({
      title: 'Resident list is catching up',
      detail: '17 of 23 residents are active right now. Use Watch or Residents while the list updates.',
    });
    expect(residentRosterEmptyState({ loading: false, hasLiveHints: true, cityDataError: '500 Internal Server Error' })).toEqual({
      title: 'Resident list is catching up',
      detail: 'Open Watch or Residents while the resident list updates.',
    });
    expect(residentRosterEmptyState({ loading: false, hasLiveHints: true, bridgeAvailable: true })).toEqual({
      title: 'Resident list is catching up',
      detail: 'The city is responding. Use Watch or Residents while the resident list updates.',
    });
    expect(residentRosterEmptyState({ loading: false, hasLiveHints: true })).toEqual({
      title: 'Resident list is catching up',
      detail: 'Residents look active. Use Watch or Residents while the list updates.',
    });
  });

  test('keeps simple resident fallback copy free of raw failures and operator terms', () => {
    const fallbackCopy = [
      residentDetailEmptyState({
        loading: false,
        residentCount: 0,
        hasLiveHints: true,
        cityDataError: '500 Internal Server Error',
      }),
      residentRosterEmptyState({
        loading: false,
        hasLiveHints: true,
        cityDataError: '500 Internal Server Error',
      }),
      residentRosterEmptyState({
        loading: false,
        hasLiveHints: true,
        gatewayOrControllerConnected: true,
      }),
      residentRosterEmptyState({
        loading: false,
        hasLiveHints: true,
        bridgeAvailable: true,
      }),
      { title: '', detail: cityDataNoticeCopy('500 Internal Server Error') },
    ].map(state => `${state.title} ${state.detail}`).join(' ');

    expect(fallbackCopy).not.toMatch(/\b(500|debug|ops|controller|bridge|gateway|snapshot|API|backend|endpoint|shell|empty states|economy heartbeat)\b/i);
  });

  test('describes resident loop availability for live, projected-only, and missing runtime states', () => {
    expect(residentLoopAvailabilityState({
      hasLiveResident: true,
      hasProjectedResident: true,
    })).toEqual({
      tone: 'ok',
      title: 'Live resident loop is grounded',
      detail: 'Model, endpoint, SPARK module, goal-plan-action, speech, and story are sourced from the live runtime snapshot.',
    });

    expect(residentLoopAvailabilityState({
      hasLiveResident: false,
      hasProjectedResident: true,
      latestSeenAt: '2026-05-30T19:30:00.000Z',
      latestPostAt: '2026-05-30T19:20:00.000Z',
    })).toEqual({
      tone: 'warn',
      title: 'Live resident loop is temporarily unavailable',
      detail: 'Using projected city records only (latestSeenAt 2026-05-30T19:30:00.000Z | latestPostAt 2026-05-30T19:20:00.000Z).',
    });

    expect(residentLoopAvailabilityState({
      hasLiveResident: false,
      hasProjectedResident: false,
    })).toEqual({
      tone: 'fail',
      title: 'Resident loop evidence is missing',
      detail: 'No live runtime snapshot or projected city record is available yet.',
    });
  });
});
