import { describe, expect, test } from 'bun:test';
import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import { toPublicOverviewResident } from './public-overview';

describe('public overview projection', () => {
  test('keeps only projector-safe resident fields', () => {
    const row: ResidentDashboardRow = {
      name: 'res:agent',
      online: true,
      position: { x: 3222, y: 3218, level: 0 },
      hp: { current: 8, max: 10 },
      inCombat: true,
      busy: true,
      attention: 2,
      budgets: { attention: 2 } as unknown as ResidentDashboardRow['budgets'],
      memory: { indexMarkdown: 'secret memory', files: ['private.md'] },
      errors: ['secret error'],
      feed: {
        attached: true,
        tick: 42,
        ageMs: 1200,
        lastFeedAt: '2026-06-01T00:00:00Z',
        position: { x: 3222, y: 3218, level: 0 },
        hp: { current: 8, max: 10 },
        inCombat: true,
        busy: true,
        nearby: { players: 1, npcs: 2, objects: 3, worldItems: 4 },
        events: 5,
        availableActions: 6,
        latestEventKind: 'chat',
        latestEventText: 'secret event text',
      },
      body: {
        controlHeld: true,
        controllerId: 'secret-controller',
        position: { x: 3222, y: 3218, level: 0 },
        latestPerception: { secret: true },
        latestEvent: { secret: true },
        lastFeedAt: '2026-06-01T00:00:00Z',
        lastAction: {
          kind: 'say',
          cause: 'secret cause',
          result: 'ok',
          tick: 43,
          source: 'body',
          ruleId: 'secret-rule',
        },
        gatewayHealthy: true,
        saved: { inventory: ['secret item'] },
      },
      lastEvent: {
        kind: 'chat',
        tick: 43,
        text: 'secret last event text',
        at: '2026-06-01T00:00:01Z',
      },
      storyArc: {
        phase: 'progress',
        summary: 'secret story summary',
        latestEventKind: 'chat',
      },
    };

    const projected = toPublicOverviewResident(row);

    expect(projected).toEqual({
      name: 'res:agent',
      online: true,
      position: { x: 3222, y: 3218, level: 0 },
      hp: { current: 8, max: 10 },
      inCombat: true,
      busy: true,
      attention: 2,
      feed: {
        attached: true,
        tick: 42,
        ageMs: 1200,
        lastFeedAt: '2026-06-01T00:00:00Z',
        position: { x: 3222, y: 3218, level: 0 },
        hp: { current: 8, max: 10 },
        inCombat: true,
        busy: true,
        nearby: { players: 1, npcs: 2, objects: 3, worldItems: 4 },
        events: 5,
        availableActions: 6,
        latestEventKind: 'chat',
      },
      body: {
        controlHeld: true,
        position: { x: 3222, y: 3218, level: 0 },
        lastFeedAt: '2026-06-01T00:00:00Z',
        lastAction: {
          kind: 'say',
          result: 'ok',
          tick: 43,
          source: 'body',
        },
        gatewayHealthy: true,
      },
      lastEvent: {
        kind: 'chat',
        tick: 43,
        at: '2026-06-01T00:00:01Z',
      },
      storyArc: {
        phase: 'progress',
        latestEventKind: 'chat',
      },
    });
    expect(JSON.stringify(projected)).not.toContain('secret');
  });

  test('does not leak nested private fields through shared object references', () => {
    const row: ResidentDashboardRow = {
      name: 'res:hans',
      online: true,
      position: { x: 3221, y: 3218, level: 0, privateShard: 'secret-position' } as unknown as ResidentDashboardRow['position'],
      feed: {
        attached: true,
        tick: 12,
        position: { x: 3221, y: 3218, level: 0, privateFeed: 'secret-feed-position' } as unknown as NonNullable<ResidentDashboardRow['feed']>['position'],
        nearby: {
          players: 1,
          npcs: 2,
          objects: 3,
          worldItems: 4,
          controllerIds: ['secret-controller-id'],
        } as unknown as NonNullable<ResidentDashboardRow['feed']>['nearby'],
        events: 5,
        availableActions: 6,
        latestEventKind: 'movement',
      },
      body: {
        controlHeld: false,
        position: { x: 3221, y: 3218, level: 0, savedInventory: ['secret-item'] } as unknown as NonNullable<ResidentDashboardRow['body']>['position'],
        lastAction: {
          kind: 'move_to',
          result: 'ok',
          tick: 13,
          source: 'body',
        },
        gatewayHealthy: true,
      },
      lastEvent: {
        kind: 'movement',
        tick: 13,
        at: '2026-06-02T00:00:00Z',
      },
    };

    const projected = toPublicOverviewResident(row);

    if (row.position) (row.position as unknown as Record<string, unknown>).x = 9999;
    if (row.feed?.nearby) (row.feed.nearby as Record<string, unknown>).players = 9999;
    if (row.body?.position) (row.body.position as unknown as Record<string, unknown>).x = 9999;

    expect(projected.position).toEqual({ x: 3221, y: 3218, level: 0 });
    expect(projected.feed?.position).toEqual({ x: 3221, y: 3218, level: 0 });
    expect(projected.feed?.nearby).toEqual({ players: 1, npcs: 2, objects: 3, worldItems: 4 });
    expect(projected.body?.position).toEqual({ x: 3221, y: 3218, level: 0 });
    expect(JSON.stringify(projected)).not.toContain('secret');
    expect(JSON.stringify(projected)).not.toContain('9999');
  });
});
