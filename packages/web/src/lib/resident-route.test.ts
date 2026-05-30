import { describe, expect, test } from 'bun:test';
import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import { residentDetailEmptyState, residentRouteSlug, resolveResidentRouteId } from './resident-route';

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
});
