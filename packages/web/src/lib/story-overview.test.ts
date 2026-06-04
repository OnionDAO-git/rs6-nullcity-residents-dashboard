import { describe, expect, test } from 'bun:test';
import type { ProjectorStoryFrame, ResidentDashboardRow } from '@nullcity-dashboard/shared';
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

    expect(model.dispatch.statusLabel).toBe('live city feed');
  });

  test('uses the server-owned public projector frame when it is available', () => {
    const frame: ProjectorStoryFrame = {
      ok: true,
      schemaVersion: 1,
      frameId: 'projector:digest-1:2026-06-03T18:00:00.000Z',
      digestId: 'digest-1',
      generatedAt: '2026-06-03T18:00:00.000Z',
      source: {
        digestId: 'digest-1',
        digestBuiltAt: '2026-06-03T17:59:00.000Z',
        windowStart: '2026-06-03T17:29:00.000Z',
        windowEnd: '2026-06-03T17:59:00.000Z',
        freshnessMs: 60_000,
        freshnessStatus: 'fresh',
        dispatchId: 'dispatch-1',
        modelProfile: 'storyteller-smart',
      },
      narration: {
        source: 'verified_dispatch',
        title: 'Hans turns attention into motion',
        body: 'Hans took the crowd gift and moved through the courtyard. The city should watch whether the thank-you becomes a real route change.',
        bullets: ['Human attention changed Hans today.', 'No private handles are exposed.'],
        confidence: 'high',
      },
      leadEvent: {
        ref: 'gift-1',
        label: 'Patron gift',
        residentName: 'res:hans',
        happenedAt: '2026-06-03T17:58:00.000Z',
        importance: 'high',
        note: 'Hans received attention from the crowd.',
        whyItMatters: 'human attention changed the resident trajectory',
      },
      events: [],
      residents: [
        {
          residentName: 'res:hans',
          displayName: 'Hans',
          attention: 42,
          status: 'active',
          gpObserved: 25,
          goal: 'Greet humans at Lumbridge Castle.',
        },
      ],
      actions: [
        {
          kind: 'watch_resident',
          label: 'Watch Hans',
          detail: 'The latest moment is a patron gift.',
          residentName: 'res:hans',
        },
      ],
      watchNext: ['Whether Hans answers the crowd instead of looping.'],
      omitted: { events: 0, residents: 0 },
      publicHealth: {
        status: 'ok',
        totalResidents: 23,
        activeResidents: 10,
        fadedResidents: 0,
        lowApResidents: 0,
        warnings: [],
      },
    };

    const model = buildStoryOverviewModel({
      residents: [
        resident({
          name: 'res:hans',
          position: { x: 3221, y: 3218, level: 0 },
          feed: feed({ latestEventKind: 'chat' }),
        }),
      ],
      digests: [],
      projectorFrame: frame,
      now: new Date('2026-06-03T18:00:30.000Z'),
    });

    expect(model.dispatch).toMatchObject({
      title: 'Hans turns attention into motion',
      statusLabel: 'verified story',
      detail: 'fresh city evidence · verified Storyteller · updated just now',
    });
    expect(model.dispatch.bodyLead).toBe('Hans took the crowd gift and moved through the courtyard.');
    expect(model.dispatch.bullets).toEqual(['Human attention changed Hans today.', 'No private handles are exposed.']);
    expect(model.citySignals).toEqual([
      { label: 'Residents Awake', detail: '10 / 23 active', tone: 'ok' },
      { label: 'Latest Story', detail: 'fresh city evidence', tone: 'ok' },
      { label: 'Public Copy', detail: 'safe public story is live', tone: 'ok' },
      { label: 'Residents Needing Support', detail: 'no residents need urgent support', tone: 'ok' },
    ]);
    expect(model.dramaItems[0]).toMatchObject({
      label: 'Patron gift',
      detail: 'Hans received attention from the crowd.',
      path: '/residents/hans',
    });
    expect(model.watchItems[0]).toMatchObject({
      label: 'Whether Hans answers the crowd instead of looping.',
      detail: 'Worth watching next.',
      tone: 'ok',
    });
    expect(model.primaryAction).toMatchObject({
      label: 'Watch Hans',
      detail: 'Whether Hans answers the crowd instead of looping.',
      path: '/residents/hans',
      tone: 'warn',
    });
  });

  test('normalizes common Null City acronyms in public frame copy', () => {
    const model = buildStoryOverviewModel({
      residents: [],
      digests: [],
      projectorFrame: {
        ok: true,
        schemaVersion: 1,
        frameId: 'projector:digest-qa:2026-06-03T18:00:00.000Z',
        digestId: 'digest-qa',
        generatedAt: '2026-06-03T18:00:00.000Z',
        source: {
          digestId: 'digest-qa',
          freshnessMs: 0,
          freshnessStatus: 'fresh',
        },
        narration: {
          source: 'deterministic_fallback',
          title: 'Qa Guardian converted Gp into Ap',
          body: 'Qa Guardian watched an Ncri trail form.',
          bullets: ['Gp evidence and Ap evidence stayed separate.'],
          confidence: 'fallback',
        },
        leadEvent: null,
        events: [],
        residents: [],
        actions: [],
        watchNext: ['Whether Qa Guardian spends Ap wisely.'],
        omitted: { events: 0, residents: 0 },
        publicHealth: {
          status: 'ok',
          totalResidents: 1,
          activeResidents: 1,
          fadedResidents: 0,
          lowApResidents: 0,
          warnings: [],
        },
      },
    });

    expect(model.dispatch.title).toBe('QA Guardian converted RuneScape gold into attention');
    expect(model.dispatch.body).toBe('QA Guardian watched a special item trail form.');
    expect(model.dispatch.bullets).toEqual(['RuneScape gold evidence and attention evidence stayed separate.']);
    expect(model.watchItems[0]?.label).toBe('Whether QA Guardian spends attention wisely.');
  });

  test('rewrites raw actor-count phrasing in public narration', () => {
    const model = buildStoryOverviewModel({
      residents: [],
      digests: [],
      projectorFrame: {
        ok: true,
        schemaVersion: 1,
        frameId: 'projector:actor-count:2026-06-03T18:00:00.000Z',
        digestId: 'actor-count',
        generatedAt: '2026-06-03T18:00:00.000Z',
        source: {
          digestId: 'actor-count',
          freshnessMs: 0,
          freshnessStatus: 'fresh',
        },
        narration: {
          source: 'verified_dispatch',
          title: 'The Steward is watching the road',
          body: 'The Steward noted seeing one character and one player nearby while gathering logs.',
          bullets: ['The Steward saw 1 character and 1 player nearby.'],
          confidence: 'high',
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
      },
    });

    expect(model.dispatch.body).toBe('The Steward noted seeing people nearby while gathering logs.');
    expect(model.dispatch.bullets).toEqual(['The Steward saw people nearby.']);
    expect(JSON.stringify(model)).not.toMatch(/\bone character and one player nearby|1 character and 1 player nearby/i);
  });

  test('builds one primary public call-to-action without internal action labels', () => {
    const model = buildStoryOverviewModel({
      residents: [],
      digests: [],
      projectorFrame: {
        ok: true,
        schemaVersion: 1,
        frameId: 'projector:cta:2026-06-03T18:00:00.000Z',
        digestId: 'cta',
        generatedAt: '2026-06-03T18:00:00.000Z',
        source: {
          digestId: 'cta',
          freshnessMs: 0,
          freshnessStatus: 'fresh',
        },
        narration: {
          source: 'verified_dispatch',
          title: 'Hans needs attention',
          body: 'Hans is near the edge.',
          bullets: [],
          confidence: 'high',
        },
        leadEvent: {
          ref: 'low-hans',
          label: 'Attention running low',
          residentName: 'res:hans',
          happenedAt: '2026-06-03T17:59:00.000Z',
          importance: 'high',
          note: 'Hans is running low on AP.',
          whyItMatters: 'human attention can keep Hans alive',
        },
        events: [],
        residents: [],
        actions: [{
          kind: 'grant_attention',
          label: 'grant_attention',
          detail: 'Give AP before the support floor hits zero.',
          residentName: 'res:hans',
        }],
        watchNext: ['Whether Hans gets AP before the window closes.'],
        omitted: { events: 0, residents: 0 },
        publicHealth: {
          status: 'degraded',
          totalResidents: 1,
          activeResidents: 1,
          fadedResidents: 0,
          lowApResidents: 1,
          warnings: [],
        },
      },
    });

    expect(model.primaryAction).toMatchObject({
      label: 'Give attention to Hans',
      detail: 'Give attention before attention runs out.',
      path: '/residents/hans',
      tone: 'warn',
    });
    expect(JSON.stringify(model.primaryAction)).not.toMatch(/\bAP\b|grant_attention|support floor|window closes/i);
  });

  test('uses public frame residents as the projector allowlist', () => {
    const model = buildStoryOverviewModel({
      residents: [
        resident({
          name: 'res:hans',
          position: { x: 3221, y: 3218, level: 0 },
          feed: feed({ latestEventKind: 'chat', nearby: { players: 1, npcs: 0, objects: 0, worldItems: 0 } }),
        }),
        resident({
          name: 'res:agent',
          position: { x: 3231, y: 3202, level: 0 },
          feed: feed({ latestEventKind: 'move_to' }),
        }),
        resident({
          name: 'res:qa-guardian',
          position: { x: 3224, y: 3219, level: 0 },
          feed: feed({ latestEventKind: 'chat' }),
        }),
      ],
      digests: [],
      projectorFrame: {
        ok: true,
        schemaVersion: 1,
        frameId: 'projector:public-only:2026-06-03T18:00:00.000Z',
        digestId: 'public-only',
        generatedAt: '2026-06-03T18:00:00.000Z',
        source: {
          digestId: 'public-only',
          freshnessMs: 0,
          freshnessStatus: 'fresh',
        },
        narration: {
          source: 'deterministic_fallback',
          title: 'Hans got unstuck',
          body: 'Hans got unstuck. Two residents are still active.',
          bullets: ['What happened: Hans recovered from being stuck.'],
          confidence: 'fallback',
        },
        leadEvent: {
          ref: 'stuck-hans',
          label: 'Recovered from being stuck',
          residentName: 'res:hans',
          happenedAt: '2026-06-03T17:59:00.000Z',
          importance: 'medium',
          note: 'res:hans recovered from being stuck.',
          whyItMatters: 'pathing recovery is visible progress',
        },
        events: [],
        residents: [
          {
            residentName: 'res:hans',
            displayName: 'Hans',
            attention: 5_000,
            status: 'active',
            gpObserved: null,
          },
          {
            residentName: 'res:agent',
            displayName: 'The Steward',
            attention: 30_000,
            status: 'active',
            gpObserved: null,
          },
        ],
        actions: [],
        watchNext: ['Whether Hans keeps moving after the recovery.'],
        omitted: { events: 0, residents: 0 },
        publicHealth: {
          status: 'degraded',
          totalResidents: 2,
          activeResidents: 2,
          fadedResidents: 0,
          lowApResidents: 0,
          warnings: ['model call was nooped (unknown)'],
        },
      },
    });

    const serialized = JSON.stringify(model);
    expect(model.atlas.pins.map(pin => pin.residentName).sort()).toEqual(['res:agent', 'res:hans']);
    expect(model.leaderboardItems.map(item => item.label)).toEqual(['Hans', 'The Steward']);
    expect(model.residentActions.map(item => item.label)).toEqual(['Hans', 'The Steward']);
    expect(serialized).not.toContain('qa-guardian');
    expect(serialized).not.toContain('QA Guardian');
  });

  test('keeps public frame projector signals human-facing instead of operator-facing', () => {
    const model = buildStoryOverviewModel({
      residents: [],
      digests: [],
      projectorFrame: {
        ok: true,
        schemaVersion: 1,
        frameId: 'projector:digest-fallback:2026-06-03T18:00:00.000Z',
        digestId: 'digest-fallback',
        generatedAt: '2026-06-03T18:00:00.000Z',
        source: {
          digestId: 'digest-fallback',
          freshnessMs: 0,
          freshnessStatus: 'fresh',
        },
        narration: {
          source: 'deterministic_fallback',
          title: 'Agent got unstuck',
          body: 'Agent got unstuck. Two residents are still active.',
          bullets: ['What happened: Agent recovered from being stuck.'],
          confidence: 'fallback',
        },
        leadEvent: {
          ref: 'stuck-1',
          label: 'Recovered from being stuck',
          residentName: 'res:agent',
          happenedAt: '2026-06-03T17:59:00.000Z',
          importance: 'medium',
          note: 'res:agent recovered from being stuck.',
          whyItMatters: 'pathing recovery is visible progress',
        },
        events: [],
        residents: [],
        actions: [],
        watchNext: ['Whether Agent keeps moving after the recovery.'],
        omitted: { events: 0, residents: 0 },
        publicHealth: {
          status: 'degraded',
          totalResidents: 2,
          activeResidents: 2,
          fadedResidents: 0,
          lowApResidents: 0,
          warnings: ['model call was nooped (unknown)'],
        },
      },
      now: new Date('2026-06-03T18:00:30.000Z'),
    });

    expect(model.dispatch.statusLabel).toBe('safe live story');
    expect(model.dispatch.detail).toBe('fresh city evidence · safe public story · updated just now');
    expect(model.citySignals).toEqual([
      { label: 'Residents Awake', detail: '2 / 2 active', tone: 'ok' },
      { label: 'Latest Story', detail: 'fresh city evidence', tone: 'ok' },
      { label: 'Public Copy', detail: 'using safe public copy', tone: 'warn' },
      { label: 'Residents Needing Support', detail: 'no residents need urgent support', tone: 'ok' },
    ]);
    expect(model.dramaItems[0]).toMatchObject({
      label: 'Got unstuck',
      detail: 'The Steward got unstuck.',
    });
    expect(JSON.stringify(model)).not.toMatch(/\b(?:Public Health|Narration|fallback story|AP|GP|NCRI|nooped|canon|support floor|runway|person or object|people and objects|dead loop|bounded goal|stuck state)\b/i);
  });

  test('marks old projector frames stale even when the written frame says fresh', () => {
    const model = buildStoryOverviewModel({
      residents: [],
      digests: [],
      projectorFrame: {
        ok: true,
        schemaVersion: 1,
        frameId: 'projector:stale:2026-06-03T18:00:00.000Z',
        digestId: 'stale',
        generatedAt: '2026-06-03T18:00:00.000Z',
        source: {
          digestId: 'stale',
          digestBuiltAt: '2026-06-03T18:00:00.000Z',
          freshnessMs: 0,
          freshnessStatus: 'fresh',
        },
        narration: {
          source: 'deterministic_fallback',
          title: 'Hans got unstuck',
          body: 'Hans got unstuck.',
          bullets: [],
          confidence: 'fallback',
        },
        leadEvent: null,
        events: [],
        residents: [],
        actions: [],
        watchNext: [],
        omitted: { events: 0, residents: 0 },
        publicHealth: {
          status: 'ok',
          totalResidents: 2,
          activeResidents: 2,
          fadedResidents: 0,
          lowApResidents: 0,
          warnings: [],
        },
      },
      now: new Date('2026-06-03T18:48:00.000Z'),
    });

    expect(model.dispatch.detail).toBe('city evidence needs refresh · safe public story · updated 48m ago');
    expect(model.citySignals).toContainEqual({ label: 'Latest Story', detail: 'city evidence needs refresh', tone: 'warn' });
    expect(model.citySignals).toContainEqual({ label: 'Public Copy', detail: 'using safe public copy', tone: 'warn' });
  });

  test('rewrites legacy generic fallback frames before they reach the public projector', () => {
    const model = buildStoryOverviewModel({
      residents: [],
      digests: [],
      projectorFrame: {
        ok: true,
        schemaVersion: 1,
        frameId: 'projector:legacy:2026-06-03T18:00:00.000Z',
        digestId: 'legacy',
        generatedAt: '2026-06-03T18:00:00.000Z',
        source: {
          digestId: 'legacy',
          freshnessMs: 0,
          freshnessStatus: 'fresh',
        },
        narration: {
          source: 'deterministic_fallback',
          title: 'Qa Guardian is where the city is pointing',
          body: 'Qa Guardian is the current focus: exchanged 250 GP for 500 AP. 17 residents are still active.',
          bullets: [
            'Attention-for-gold exchange: RuneScape gold is now part of the Null City economy trail',
            'RuneScape GP evidence is present and kept separate from attention.',
          ],
          confidence: 'fallback',
        },
        leadEvent: {
          ref: 'exchange-1',
          label: 'Attention-for-gold exchange',
          residentName: 'res:qa-guardian',
          happenedAt: '2026-06-03T17:59:00.000Z',
          importance: 'high',
          note: 'exchanged 250 GP for 500 AP',
          whyItMatters: 'RuneScape gold is now part of the Null City economy trail',
        },
        events: [],
        residents: [],
        actions: [],
        watchNext: [
          'Qa Guardian after attention-for-gold exchange.',
          'Whether attention-for-GP turns into a useful human trade.',
        ],
        omitted: { events: 0, residents: 0 },
        publicHealth: {
          status: 'degraded',
          totalResidents: 17,
          activeResidents: 17,
          fadedResidents: 0,
          lowApResidents: 0,
          warnings: ['model call was nooped (unknown)'],
        },
      },
    });

    expect(model.dispatch.title).toBe('QA Guardian traded gold for more time');
    expect(model.dispatch.bodyLead).toBe('QA Guardian converted RuneScape gold into attention.');
    expect(model.dispatch.bullets).toEqual([
      'Gold-for-attention exchange: RuneScape gold is now part of the Null City economy trail',
      'RuneScape gold evidence is present and kept separate from attention.',
    ]);
    expect(model.watchItems[0]?.label).toBe("Whether QA Guardian's gold-for-attention exchange buys real progress.");
    expect(JSON.stringify(model)).not.toContain('where the city is pointing');
    expect(JSON.stringify(model)).not.toContain('current focus');
    expect(JSON.stringify(model)).not.toContain('attention-for-RuneScape gold');
    expect(JSON.stringify(model)).not.toContain('RuneScape RuneScape gold');
  });

  test('describes live resident action locations with landmarks instead of raw coordinates', () => {
    const model = buildStoryOverviewModel({
      residents: [
        resident({
          name: 'res:hans',
          position: { x: 3221, y: 3218, level: 0 },
          feed: feed({ latestEventKind: 'chat' }),
        }),
      ],
      digests: [],
    });

    expect(model.residentActions[0]).toMatchObject({
      label: 'Hans',
      detail: 'Talking at Lumbridge Castle courtyard',
    });
    expect(model.atlas.pins[0]?.detail).toBe('talking at Lumbridge Castle courtyard');
    expect(JSON.stringify(model)).not.toMatch(/\b\d{4},\d{4}\b/);
    expect(JSON.stringify(model)).not.toContain('chat at');
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
      eventLabel: 'lighting a fire',
      tone: 'event',
    });
    expect(model.atlas.offMapRegions).toEqual([
      {
        label: 'Varrock',
        detail: '1 resident active outside this map area',
        count: 1,
        residents: ['Wren Calix at Varrock'],
      },
    ]);
  });

  test('does not render review-queued dispatch copy on the public projector', () => {
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

    expect(model.dispatch.statusLabel).toBe('live city feed');
    expect(model.dispatch.title).toBe('Null City is coming online');
    expect(model.dispatch.body).not.toContain('reviewed draft');
    expect(model.dispatch.body).not.toContain('reviewed queue material');
  });

  test('prefers older safe canon copy over newer review and dry-run dispatch text', () => {
    const model = buildStoryOverviewModel({
      residents: [],
      digests: [
        {
          runId: 'review-run',
          digestId: 'digest-review',
          queue: 'review',
          builtAt: '2026-06-01T00:10:00Z',
          topEventCount: 0,
          residentCount: 0,
          topEvents: [],
          dispatch: {
            dispatchId: 'dispatch-review',
            needsReview: false,
            warningCount: 0,
            publicTitle: 'DO NOT SHOW review title',
            publicBody: 'DO NOT SHOW review body.',
            publicBullets: ['DO NOT SHOW review bullet.'],
            operatorWarnings: [],
            reviewReasons: [],
            eventRefCount: 0,
            eventRefsUsed: [],
          },
        },
        {
          runId: 'dry-run',
          digestId: 'digest-dry',
          queue: 'dry-run',
          builtAt: '2026-06-01T00:09:00Z',
          topEventCount: 0,
          residentCount: 0,
          topEvents: [],
          dispatch: {
            dispatchId: 'dispatch-dry',
            needsReview: false,
            warningCount: 0,
            publicTitle: 'DO NOT SHOW dry title',
            publicBody: 'DO NOT SHOW dry body.',
            publicBullets: ['DO NOT SHOW dry bullet.'],
            operatorWarnings: [],
            reviewReasons: [],
            eventRefCount: 0,
            eventRefsUsed: [],
          },
        },
        {
          runId: 'canon-run',
          digestId: 'digest-canon',
          queue: 'canon',
          builtAt: '2026-06-01T00:08:00Z',
          topEventCount: 0,
          residentCount: 0,
          topEvents: [],
          dispatch: {
            dispatchId: 'dispatch-canon',
            needsReview: false,
            warningCount: 0,
            publicTitle: 'Safe canon title',
            publicBody: 'Safe canon body.',
            publicBullets: ['Safe canon bullet.'],
            operatorWarnings: [],
            reviewReasons: [],
            eventRefCount: 0,
            eventRefsUsed: [],
          },
        },
      ],
    });

    expect(model.dispatch.statusLabel).toBe('verified story');
    expect(model.dispatch.title).toBe('Safe canon title');
    expect(model.dispatch.body).toBe('Safe canon body.');
    expect(model.dispatch.bullets).toEqual(['Safe canon bullet.']);
    expect(JSON.stringify(model.dispatch)).not.toContain('DO NOT SHOW');
  });

  test('uses Storyteller dispatch body and bullets even without a public title', () => {
    const model = buildStoryOverviewModel({
      residents: [],
      digests: [{
        runId: 'body-only-run',
        digestId: 'digest-body-only',
        queue: 'canon',
        topEventCount: 0,
        residentCount: 0,
        topEvents: [],
        dispatch: {
          dispatchId: 'dispatch-body-only',
          needsReview: false,
          warningCount: 0,
          publicBody: 'res:wren-calix found the noisy part of the city.',
          publicBullets: ['res:wren-calix is now the headline.'],
          operatorWarnings: [],
          reviewReasons: [],
          eventRefCount: 0,
          eventRefsUsed: [],
        },
      }],
    });

    expect(model.dispatch.body).toBe('Wren Calix found the noisy part of the city.');
    expect(model.dispatch.bullets).toEqual(['Wren Calix is now the headline.']);
    expect(model.dispatch.statusLabel).toBe('verified story');
  });

  test('formats Storyteller copy into a lead sentence and readable paragraphs', () => {
    const model = buildStoryOverviewModel({
      residents: [],
      digests: [{
        runId: 'formatted-run',
        digestId: 'digest-formatted',
        queue: 'canon',
        topEventCount: 0,
        residentCount: 0,
        topEvents: [],
        dispatch: {
          dispatchId: 'dispatch-formatted',
          needsReview: false,
          warningCount: 0,
          publicTitle: 'The evening bulletin',
          publicBody: 'Good evening from Null City. Hans shook off a snag. The Steward counted the crowd. Twelve residents stayed active. No one is low on AP.',
          publicBullets: [],
          operatorWarnings: [],
          reviewReasons: [],
          eventRefCount: 0,
          eventRefsUsed: [],
        },
      }],
    });

    expect(model.dispatch.body).toBe('Good evening from Null City. Hans shook off a snag. The Steward counted the crowd. Twelve residents stayed active. No one is low on attention.');
    expect(model.dispatch.bodyLead).toBe('Good evening from Null City.');
    expect(model.dispatch.bodyParagraphs).toEqual([
      'Hans shook off a snag. The Steward counted the crowd.',
      'Twelve residents stayed active. No one is low on attention.',
    ]);
  });

  test('keeps long Storyteller dispatches to three scannable body paragraphs', () => {
    const model = buildStoryOverviewModel({
      residents: [],
      digests: [{
        runId: 'long-run',
        digestId: 'digest-long',
        queue: 'canon',
        topEventCount: 0,
        residentCount: 0,
        topEvents: [],
        dispatch: {
          dispatchId: 'dispatch-long',
          needsReview: false,
          warningCount: 0,
          publicTitle: 'A full city bulletin',
          publicBody: 'Good evening from Null City. Hans shook off a snag. The Steward counted the crowd. QA Social waved from the road. Pip stayed near the church. Father Aereck kept watch. Twelve residents stayed active. No one is low on AP.',
          publicBullets: [],
          operatorWarnings: [],
          reviewReasons: [],
          eventRefCount: 0,
          eventRefsUsed: [],
        },
      }],
    });

    expect(model.dispatch.bodyLead).toBe('Good evening from Null City.');
    expect(model.dispatch.bodyParagraphs).toEqual([
      'Hans shook off a snag. The Steward counted the crowd. QA Social waved from the road.',
      'Pip stayed near the church. Father Aereck kept watch. Twelve residents stayed active.',
      'No one is low on attention.',
    ]);
  });

  test('moves the atlas viewport to the lead resident when the story is elsewhere', () => {
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

    expect(model.atlas.viewport.id).toBe('varrock');
    expect(model.atlas.pins).toHaveLength(1);
    expect(model.atlas.pins[0]).toMatchObject({
      residentName: 'res:wren-calix',
      eventLabel: 'talking',
    });
    expect(model.atlas.offMapRegions).toEqual([]);
  });

  test('joins Storyteller top events to live resident pins when row events are quiet', () => {
    const model = buildStoryOverviewModel({
      residents: [
        resident({ name: 'res:agent', position: { x: 3162, y: 3228, level: 0 } }),
      ],
      digests: [{
        runId: 'story-run',
        digestId: 'digest-story',
        queue: 'canon',
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
      eventLabel: 'trading gold for attention',
      tone: 'event',
    });
    expect(model.residentActions[0]).toMatchObject({
      label: 'The Steward',
      detail: 'Trading gold for attention at Lumbridge West Road',
    });
  });

  test('marks low-attention positioned residents as watch pins when no event is active', () => {
    const model = buildStoryOverviewModel({
      residents: [
        resident({ name: 'res:tired-anchor', attention: 1, position: { x: 3162, y: 3228, level: 0 } }),
      ],
      digests: [],
    });

    expect(model.atlas.pins[0]).toMatchObject({
      residentName: 'res:tired-anchor',
      eventLabel: 'quiet',
      tone: 'watch',
    });
  });

  test('reports true off-map tension count when a region has more than five residents', () => {
    const residents = [
      resident({ name: 'res:lumbridge-lead', position: { x: 3224, y: 3218, level: 0 }, feed: feed({ latestEventKind: 'chat' }) }),
      ...Array.from({ length: 7 }, (_item, index) => resident({
        name: `res:varrock-${index}`,
        position: { x: 3230 + index, y: 3428, level: 0 },
      })),
    ];

    const model = buildStoryOverviewModel({
      residents,
      digests: [],
    });

    expect(model.atlas.offMapRegions[0]).toMatchObject({
      label: 'Varrock',
      detail: '7 residents active outside this map area',
    });
    expect(model.atlas.offMapRegions[0]?.residents).toHaveLength(5);
    expect(model.watchItems.find(item => item.label === 'Elsewhere in the city')?.detail).toBe('7 residents are active outside this map area');
    expect(model.dramaItems.find(item => item.label === 'Elsewhere in the city')).toBeUndefined();
  });

  test('ignores review-state Storyteller copy and keeps resident actions grounded', () => {
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

    expect(model.dispatch.statusLabel).toBe('live city feed');
    expect(model.dispatch.title).toBe('The Steward is moving the city forward');
    expect(model.dispatch.body).toBe('The Steward is lighting a fire at Lumbridge West Road. The map is live; the story follows the evidence.');
    expect(model.dispatch.bullets).toEqual([]);
    expect(JSON.stringify(model.dispatch)).not.toContain('Agent lit a fire on the west road');
    expect(model.residentActions[0]).toMatchObject({
      label: 'The Steward',
      detail: 'Lighting a fire at Lumbridge West Road',
      path: '/residents/agent',
    });
    expect(model.citySignals.map(signal => signal.label)).toContain('Attention Available');
  });

  test('builds right-rail leaderboards and drama without duplicating global counters', () => {
    const digest: StorytellerDigestSummary = {
      runId: 'story-run-drama',
      digestId: 'digest-drama',
      queue: 'canon',
      topEventCount: 1,
      residentCount: 2,
      topEvents: [
        {
          ref: 'agent-report',
          kind: 'stuck_recovered',
          residentName: 'res:agent',
          note: 'res:agent shook off a snag and reported the crowd.',
          importance: 'high',
          evidenceLabels: ['tick 42'],
        },
      ],
    };

    const model = buildStoryOverviewModel({
      residents: [
        resident({
          name: 'res:agent',
          position: { x: 3224, y: 3217, level: 0 },
          feed: feed({
            latestEventKind: 'chat',
            nearby: { players: 2, npcs: 31, objects: 0, worldItems: 0 },
            events: 2,
          }),
        }),
        resident({
          name: 'res:hans',
          position: { x: 3222, y: 3217, level: 0 },
          feed: feed({ latestEventKind: 'chat' }),
        }),
        resident({
          name: 'res:object-magnet',
          position: { x: 3210, y: 3210, level: 0 },
          feed: feed({ nearby: { players: 0, npcs: 0, objects: 999, worldItems: 0 } }),
        }),
      ],
      digests: [digest],
      patronAp: 6381,
    });

    expect(model.leaderboardItems).toHaveLength(2);
    expect(model.citySignals.map(item => item.label)).toEqual(['Online Residents', 'Known Places', 'Attention Available', 'Latest Story']);
    expect(model.leaderboardItems[0]).toMatchObject({
      label: 'The Steward',
      detail: 'Talking at Lumbridge Castle courtyard with people nearby',
    });
    expect(JSON.stringify(model.leaderboardItems)).not.toContain('33');
    expect(JSON.stringify(model.leaderboardItems)).not.toContain('person or object');
    expect(JSON.stringify(model.leaderboardItems)).not.toContain('people and objects');
    expect(JSON.stringify(model.leaderboardItems)).not.toContain('|');
    expect(model.leaderboardItems.map(item => item.label)).not.toContain('Object Magnet');
    expect(model.dramaItems.length).toBeLessThanOrEqual(3);
    expect(model.watchItems.length).toBeLessThanOrEqual(2);
    expect(model.dramaItems[0]).toMatchObject({
      label: 'The Steward',
      detail: 'The Steward shook off a snag and reported the crowd.',
      tone: 'warn',
    });
    expect(model.dramaItems.map(item => item.label)).not.toContain('Online Residents');
    expect(model.dramaItems.map(item => item.label)).not.toContain('Known Places');
    expect(model.dramaItems.map(item => item.label)).not.toContain('Attention Available');
  });
});
