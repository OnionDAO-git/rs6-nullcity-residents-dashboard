import { describe, expect, test } from 'bun:test';
import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { StorytellerDigestSummary } from './api';
import { buildStoryOverviewModel } from './story-overview';

function resident(input: Partial<ResidentDashboardRow> & { name: string }): ResidentDashboardRow {
  return {
    online: true,
    ...input,
  };
}

function feed(input: Partial<NonNullable<ResidentDashboardRow['feed']>>): NonNullable<ResidentDashboardRow['feed']> {
  return {
    attached: true,
    nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 },
    events: 0,
    availableActions: 0,
    ...input,
  } as NonNullable<ResidentDashboardRow['feed']>;
}

describe('story overview projector model', () => {
  test('does not claim canon before a Storyteller digest exists', () => {
    const model = buildStoryOverviewModel({
      residents: [],
      digests: [],
    });

    expect(model.dispatch.statusLabel).toBe('live feed');
  });

  test('builds a useful Lumbridge atlas from live resident coordinates', () => {
    const model = buildStoryOverviewModel({
      residents: [
        resident({
          name: 'res:agent',
          position: { x: 3162, y: 3228, level: 0 },
          feed: feed({ attached: true, ageMs: 1200, position: { x: 3162, y: 3228, level: 0 }, latestEventKind: 'fire_lit', nearby: { players: 0, npcs: 0, objects: 12, worldItems: 1 } }),
          thinking: { mode: 'deciding', activePlan: 'Light a fire on the west road' },
        }),
        resident({ name: 'res:hans', position: { x: 3224, y: 3218, level: 0 }, feed: feed({ attached: true, ageMs: 800, latestEventKind: 'chat' }) }),
        resident({ name: 'res:duke-horacio', position: { x: 3222, y: 3218, level: 1 }, feed: feed({ attached: true, ageMs: 900 }) }),
        resident({ name: 'res:wren-calix', position: { x: 3230, y: 3428, level: 0 } }),
      ],
      digests: [],
      patronAp: 6381,
      now: new Date('2026-06-01T00:00:00Z'),
    });

    expect(model.atlas.viewport.id).toBe('lumbridge');
    expect(model.atlas.pins.map(pin => pin.residentName)).toContain('res:agent');
    expect(model.atlas.pins.map(pin => pin.residentName)).toContain('res:hans');
    expect(model.atlas.pins.find(pin => pin.residentName === 'res:duke-horacio')?.levelLabel).toBe('L1');
    expect(model.atlas.pins.find(pin => pin.residentName === 'res:agent')).toMatchObject({
      label: 'The Steward',
      eventLabel: 'fire lit',
      tone: 'event',
    });
    expect(model.atlas.offMapRegions).toEqual([
      {
        label: 'Varrock',
        detail: '1 resident beyond the current viewport',
        residents: ['Wren Calix 3230,3428'],
      },
    ]);
  });

  test('keeps review-queued dispatches out of canon status', () => {
    const model = buildStoryOverviewModel({
      residents: [],
      digests: [{
        runId: 'review-run',
        digestId: 'digest-review',
        queue: 'review',
        topEventCount: 0,
        residentCount: 0,
        topEvents: [],
        dispatch: {
          dispatchId: 'dispatch-review',
          needsReview: false,
          warningCount: 0,
          publicTitle: 'A reviewed draft waits at the gate',
          publicBody: 'This copy is reviewed queue material.',
          publicBullets: [],
          operatorWarnings: [],
          reviewReasons: [],
          eventRefCount: 0,
          eventRefsUsed: [],
        },
      }],
    });

    expect(model.dispatch.statusLabel).toBe('review draft');
  });

  test('keeps the v1 atlas on Lumbridge landmarks even when the latest resident is elsewhere', () => {
    const model = buildStoryOverviewModel({
      residents: [
        resident({ name: 'res:wren-calix', position: { x: 3230, y: 3428, level: 0 }, feed: feed({ latestEventKind: 'chat' }) }),
      ],
      digests: [{
        runId: 'varrock-run',
        digestId: 'digest-varrock',
        topEventCount: 1,
        residentCount: 1,
        topEvents: [{
          ref: 'varrock-event',
          kind: 'say',
          residentName: 'res:wren-calix',
          evidenceLabels: ['chat'],
        }],
      }],
    });

    expect(model.atlas.viewport.id).toBe('lumbridge');
    expect(model.atlas.pins).toHaveLength(0);
    expect(model.atlas.offMapRegions[0]).toMatchObject({
      label: 'Varrock',
      residents: ['Wren Calix 3230,3428'],
    });
  });

  test('joins Storyteller top events to live resident pins when row events are quiet', () => {
    const model = buildStoryOverviewModel({
      residents: [
        resident({ name: 'res:agent', position: { x: 3162, y: 3228, level: 0 } }),
      ],
      digests: [{
        runId: 'story-run',
        digestId: 'digest-story',
        topEventCount: 1,
        residentCount: 1,
        topEvents: [{
          ref: 'story-event',
          kind: 'ap_gp_exchange',
          residentName: 'res:agent',
          note: 'Agent exchanged GP for AP.',
          evidenceLabels: ['exchange'],
        }],
      }],
    });

    expect(model.atlas.pins[0]).toMatchObject({
      residentName: 'res:agent',
      eventLabel: 'ap gp exchange',
      tone: 'event',
    });
    expect(model.residentActions[0]).toMatchObject({
      label: 'The Steward',
      detail: 'ap gp exchange near 3162,3228',
    });
  });

  test('labels review-state Storyteller dispatches and keeps resident actions grounded', () => {
    const digest: StorytellerDigestSummary = {
      runId: 'story-run-1',
      digestId: 'digest-1',
      queue: 'dry-run',
      builtAt: '2026-06-01T00:00:00Z',
      topEventCount: 1,
      residentCount: 1,
      topEvents: [
        {
          ref: 'event-1',
          kind: 'fire_lit',
          residentName: 'res:agent',
          ts: '2026-06-01T00:00:00Z',
          note: 'Agent lit a fire.',
          importance: 'high',
          evidenceLabels: ['fire_lit'],
        },
      ],
      dispatch: {
        dispatchId: 'dispatch-1',
        needsReview: true,
        warningCount: 1,
        publicTitle: 'Agent lit a fire on the west road',
        publicBody: 'res:agent lit a fire while res:hans kept walking.',
        publicBullets: ['res:agent found the spark.', 'res:hans kept the road honest.'],
        operatorWarnings: [],
        reviewReasons: ['model fallback'],
        eventRefCount: 1,
        eventRefsUsed: ['event-1'],
      },
    };

    const model = buildStoryOverviewModel({
      residents: [
        resident({
          name: 'res:agent',
          position: { x: 3162, y: 3228, level: 0 },
          feed: feed({ attached: true, ageMs: 1200, latestEventKind: 'fire_lit' }),
          body: { controlHeld: true, lastAction: { kind: 'light_fire', result: 'ok', source: 'body' } },
        }),
      ],
      digests: [digest],
      patronAp: 6381,
      now: new Date('2026-06-01T00:00:00Z'),
    });

    expect(model.dispatch.statusLabel).toBe('review draft');
    expect(model.dispatch.title).toBe('Agent lit a fire on the west road');
    expect(model.dispatch.body).toBe('The Steward lit a fire while Hans kept walking.');
    expect(model.dispatch.bullets).toEqual(['The Steward found the spark.', 'Hans kept the road honest.']);
    expect(model.residentActions[0]).toMatchObject({
      label: 'The Steward',
      detail: 'fire lit near 3162,3228',
      path: '/residents/agent',
    });
    expect(model.citySignals.map(signal => signal.label)).toContain('Visible AP');
  });
});
