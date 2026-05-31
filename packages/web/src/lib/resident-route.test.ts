import { describe, expect, test } from 'bun:test';
import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { ResidentReadModel } from './city-api';
import {
  findResidentReadModel,
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
      title: 'Resident detail is syncing',
      detail: 'Waiting for the live dashboard snapshot and optional city records.',
    });
    expect(residentDetailEmptyState({ loading: false, residentCount: 0, hasLiveHints: true })).toEqual({
      title: 'Live snapshot unavailable for this resident',
      detail: 'The resident may still be in ops/debug data while the public city row catches up.',
    });
    expect(residentDetailEmptyState({ loading: false, residentCount: 2, hasLiveHints: true })).toEqual({
      title: 'Resident not found in public city data',
      detail: 'Check the directory or ops roster for the current resident id.',
    });
  });

  test('keeps resident roster fallback copy honest while live data is loading', () => {
    expect(residentRosterEmptyState({ loading: true, hasLiveHints: false })).toEqual({
      title: 'Resident roster is syncing',
      detail: 'Waiting for the live dashboard snapshot and optional city records.',
    });
    expect(residentRosterEmptyState({ loading: false, hasLiveHints: false })).toEqual({
      title: 'No public residents reported',
      detail: 'Residents appear here after the public dashboard snapshot reports them.',
    });
    expect(residentRosterEmptyState({ loading: false, hasLiveHints: true, gatewayOrControllerConnected: true })).toEqual({
      title: 'Resident roster is syncing',
      detail: 'Gateway/controller is connected; the public roster may still be catching up.',
    });
    expect(
      residentRosterEmptyState({
        loading: false,
        hasLiveHints: true,
        activeResidentCount: 17,
        residentCount: 23,
      }),
    ).toEqual({
      title: 'Resident roster is syncing',
      detail: '17 / 23 residents are visible through the economy heartbeat while the public roster catches up.',
    });
    expect(residentRosterEmptyState({ loading: false, hasLiveHints: true, cityDataError: 'City snapshot timed out' })).toEqual({
      title: 'Resident roster is syncing',
      detail: 'City snapshot timed out. Story and ops views may still have live resident evidence.',
    });
    expect(residentRosterEmptyState({ loading: false, hasLiveHints: true, bridgeAvailable: true })).toEqual({
      title: 'Resident roster is syncing',
      detail: 'Controller bridge data is present while the public resident roster catches up.',
    });
    expect(residentRosterEmptyState({ loading: false, hasLiveHints: true })).toEqual({
      title: 'Resident roster is syncing',
      detail: 'Live resident evidence is present while the public roster catches up.',
    });
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
