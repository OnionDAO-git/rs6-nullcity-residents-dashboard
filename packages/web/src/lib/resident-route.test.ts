import { describe, expect, test } from 'bun:test';
import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import { residentRouteSlug, resolveResidentRouteId } from './resident-route';

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
});
