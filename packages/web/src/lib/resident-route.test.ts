import { describe, expect, test } from 'bun:test';
import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import { residentDetailEmptyState, residentRosterEmptyState, residentRouteSlug, resolveResidentRouteId } from './resident-route';

function row(name: string): ResidentDashboardRow {
  return { name, online: true };
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
});
