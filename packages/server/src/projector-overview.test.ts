import { describe, expect, test } from 'bun:test';
import type { ProjectorStoryFrame, ResidentDashboardRow } from '@nullcity-dashboard/shared';
import { buildProjectorOverviewSnapshot } from './projector-overview';

describe('buildProjectorOverviewSnapshot', () => {
  test('returns public-safe residents plus the server-owned projector frame', () => {
    const resident: ResidentDashboardRow = {
      name: 'res:hans',
      online: true,
      position: { x: 3221, y: 3218, level: 0 },
      thinking: { mode: 'deciding', activePlan: 'private internal plan should not leak' },
      errors: ['debug stack should not leak'],
    };
    const frame: ProjectorStoryFrame = {
      ok: true,
      schemaVersion: 1,
      frameId: 'projector:digest-1:2026-06-03T18:00:00.000Z',
      digestId: 'digest-1',
      generatedAt: '2026-06-03T18:00:00.000Z',
      source: {
        digestId: 'digest-1',
        freshnessMs: 0,
        freshnessStatus: 'fresh',
      },
      narration: {
        source: 'verified_dispatch',
        title: 'Hans found the crowd',
        body: 'Hans moved through Lumbridge.',
        bullets: [],
      },
      leadEvent: null,
      events: [],
      residents: [],
      actions: [],
      watchNext: [],
      omitted: { events: 0, residents: 0 },
      publicHealth: {
        status: 'ok',
        totalResidents: 1,
        activeResidents: 1,
        fadedResidents: 0,
        lowApResidents: 0,
        warnings: [],
      },
    };

    const snapshot = buildProjectorOverviewSnapshot({
      generatedAt: '2026-06-03T18:01:00.000Z',
      residents: [resident],
      patronAp: 12,
      projectorFrame: frame,
    });

    expect(snapshot).toMatchObject({
      generatedAt: '2026-06-03T18:01:00.000Z',
      patronAp: 12,
      projectorFrame: { frameId: 'projector:digest-1:2026-06-03T18:00:00.000Z' },
    });
    expect(snapshot.residents[0]).toEqual({
      name: 'res:hans',
      online: true,
      position: { x: 3221, y: 3218, level: 0 },
    });
    expect(JSON.stringify(snapshot)).not.toContain('private internal plan');
    expect(JSON.stringify(snapshot)).not.toContain('debug stack');
  });
});
