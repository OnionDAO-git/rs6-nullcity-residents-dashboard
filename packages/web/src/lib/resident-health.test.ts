import { describe, expect, test } from 'bun:test';
import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import { applyResidentHealthControls, residentHealthSummary, residentModelLabel } from './resident-health';

function row(input: Partial<ResidentDashboardRow> & { name: string }): ResidentDashboardRow {
  return {
    online: false,
    ...input,
  };
}

describe('resident health controls', () => {
  test('labels stuck, stale, active, online, and offline residents for scan-first QA', () => {
    expect(residentHealthSummary(row({ name: 'res:stuck', online: true, progress: { samples: 1, stuckTicks: 44 } })).label).toBe('stuck');
    expect(residentHealthSummary(row({ name: 'res:stale', online: true, feed: { attached: true, ageMs: 130_000, nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 }, events: 0, availableActions: 0 } })).label).toBe('stale');
    expect(residentHealthSummary(row({ name: 'res:thinking', online: true, feed: { attached: true, ageMs: 500, nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 }, events: 0, availableActions: 2 }, thinking: { mode: 'deciding' } })).label).toBe('thinking');
    expect(residentHealthSummary(row({ name: 'res:online', online: true, feed: { attached: true, ageMs: 500, nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 }, events: 0, availableActions: 2 } })).label).toBe('online');
    expect(residentHealthSummary(row({ name: 'res:offline', online: false })).label).toBe('offline');
  });

  test('filters attention-needed residents and sorts by health severity', () => {
    const rows = [
      row({ name: 'res:healthy', online: true, feed: { attached: true, ageMs: 500, nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 }, events: 0, availableActions: 2 } }),
      row({ name: 'res:stale', online: true, feed: { attached: true, ageMs: 180_000, nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 }, events: 0, availableActions: 2 } }),
      row({ name: 'res:stuck', online: true, progress: { samples: 2, stuckTicks: 12 } }),
    ];

    expect(applyResidentHealthControls(rows, { filter: 'needs-attention', sort: 'health', modelQuery: '' }).map(resident => resident.name)).toEqual([
      'res:stuck',
      'res:stale',
    ]);
  });

  test('filters and sorts by configured model or endpoint', () => {
    const rows = [
      row({ name: 'res:qwen', stack: { model: { endpoint: 'dgx_qwen' }, configuredModules: [] } }),
      row({ name: 'res:haiku', stack: { model: { endpoint: 'openrouter', model: 'anthropic/claude-3.5-haiku' }, configuredModules: [] } }),
      row({ name: 'res:qwopus', stack: { model: { endpoint: 'spacetower_qwopus_q4' }, configuredModules: [] } }),
    ];

    expect(residentModelLabel(rows[1]!)).toBe('openrouter');
    expect(applyResidentHealthControls(rows, { filter: 'all', sort: 'model', modelQuery: 'qwo' }).map(resident => resident.name)).toEqual([
      'res:qwopus',
    ]);
  });
});
