import { describe, expect, test } from 'bun:test';
import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { StorytellerDigestSummary } from './api';
import { residentStoryDigestSignal, residentStoryEvents, storytellerDigestStatus, storytellerMythCard } from './resident-story';

function resident(name: string): ResidentDashboardRow {
  return { name, online: true };
}

function digest(overrides: Partial<StorytellerDigestSummary> = {}): StorytellerDigestSummary {
  return {
    runId: 'run-1',
    digestId: 'dig-1',
    builtAt: '2026-05-30T04:00:00.000Z',
    topEventCount: 2,
    residentCount: 1,
    topEvents: [
      {
        ref: 'e1',
        kind: 'city_ap_gp_exchange',
        residentName: 'res:hans',
        ts: '2026-05-30T03:58:00.000Z',
        note: 'burned 25 GP for 50 AP',
        importance: 'high',
        evidenceLabels: ['gp=25', 'ap=50'],
      },
      {
        ref: 'e2',
        kind: 'city_attention_credit',
        residentName: 'res:pip',
        ts: '2026-05-30T03:59:00.000Z',
        note: 'received AP grant',
        importance: 'medium',
        evidenceLabels: ['ap=100'],
      },
    ],
    ...overrides,
  };
}

describe('residentStoryEvents', () => {
  test('returns only events for the requested resident across digests', () => {
    const events = residentStoryEvents(resident('res:hans'), [
      digest(),
      digest({
        runId: 'run-2',
        digestId: 'dig-2',
        builtAt: '2026-05-30T05:00:00.000Z',
        topEvents: [
          {
            ref: 'e3',
            kind: 'story_goal_progress',
            residentName: 'hans',
            ts: '2026-05-30T04:59:00.000Z',
            note: 'reported next plan step',
            importance: 'high',
            evidenceLabels: ['plan'],
          },
        ],
      }),
    ]);

    expect(events.map(event => event.event.ref)).toEqual(['e3', 'e1']);
    expect(events[0]?.digest.runId).toBe('run-2');
  });

  test('deduplicates duplicate refs and honors limit', () => {
    const duplicated = digest({
      runId: 'run-3',
      digestId: 'dig-3',
      topEvents: [
        {
          ref: 'same-ref',
          kind: 'city_attention_credit',
          residentName: 'res:hans',
          ts: '2026-05-30T04:01:00.000Z',
          note: 'first copy',
          importance: 'medium',
          evidenceLabels: ['ap=50'],
        },
        {
          ref: 'same-ref',
          kind: 'city_attention_credit',
          residentName: 'res:hans',
          ts: '2026-05-30T04:02:00.000Z',
          note: 'second copy',
          importance: 'medium',
          evidenceLabels: ['ap=50'],
        },
      ],
    });

    const events = residentStoryEvents(resident('res:hans'), [duplicated, digest()], 1);
    expect(events).toHaveLength(1);
  });
});

describe('residentStoryDigestSignal', () => {
  test('warns when no matching digest events exist', () => {
    const signal = residentStoryDigestSignal(resident('res:zed'), [digest()]);
    expect(signal.tone).toBe('warn');
    expect(signal.summary).toContain('No grounded Storyteller events');
  });

  test('reports ok with latest event freshness', () => {
    const signal = residentStoryDigestSignal(
      resident('res:hans'),
      [digest()],
      Date.parse('2026-05-30T04:10:00.000Z'),
    );

    expect(signal.tone).toBe('ok');
    expect(signal.summary).toContain('Grounded Storyteller events found');
    expect(signal.detail).toContain('12m old');
  });

  test('warns when latest digest dispatch is in operator-review state', () => {
    const signal = residentStoryDigestSignal(
      resident('res:hans'),
      [digest({
        dispatch: {
          dispatchId: 'dispatch-review',
          generatedAt: '2026-05-30T04:00:00.000Z',
          modelProfile: 'default',
          needsReview: false,
          warningCount: 1,
          publicBullets: [],
          operatorWarnings: [],
          reviewReasons: ['missing_link'],
          eventRefCount: 1,
          eventRefsUsed: ['e1'],
          estimatedCostUsd: null,
        },
      })],
      Date.parse('2026-05-30T04:10:00.000Z'),
    );

    expect(signal.tone).toBe('warn');
    expect(signal.summary).toContain('needs operator review');
  });

  test('warns when latest event timestamp is missing or invalid', () => {
    const signal = residentStoryDigestSignal(
      resident('res:hans'),
      [digest({
        topEvents: [{
          ref: 'invalid-ts',
          kind: 'city_ap_gp_exchange',
          residentName: 'res:hans',
          ts: 'not-a-date',
          note: 'bad stamp',
          importance: 'medium',
          evidenceLabels: ['gp=1'],
        }],
      })],
      Date.parse('2026-05-30T04:10:00.000Z'),
    );

    expect(signal.tone).toBe('warn');
    expect(signal.summary).toContain('freshness is unknown');
    expect(signal.detail).toContain('invalid-ts');
  });

  test('warns when latest event timestamp is ahead of local time', () => {
    const signal = residentStoryDigestSignal(
      resident('res:hans'),
      [digest({
        topEvents: [{
          ref: 'future-ts',
          kind: 'city_ap_gp_exchange',
          residentName: 'res:hans',
          ts: '2026-05-30T04:45:00.000Z',
          note: 'future event',
          importance: 'medium',
          evidenceLabels: ['gp=1'],
        }],
      })],
      Date.parse('2026-05-30T04:10:00.000Z'),
    );

    expect(signal.tone).toBe('warn');
    expect(signal.summary).toContain('ahead of local time');
    expect(signal.detail).toContain('future-ts');
  });
});

describe('storytellerDigestStatus', () => {
  test('labels no-dispatch digest runs as dry-run instead of ready canon', () => {
    const status = storytellerDigestStatus(digest(), Date.parse('2026-05-30T04:10:00.000Z'));
    expect(status).toMatchObject({
      label: 'dry-run',
      tone: 'warn',
    });
    expect(status.summary).toContain('No public dispatch');
  });

  test('labels review, ready, and stale dispatches honestly', () => {
    const baseDispatch = {
      dispatchId: 'dispatch-1',
      generatedAt: '2026-05-30T04:05:00.000Z',
      modelProfile: 'default',
      needsReview: false,
      warningCount: 0,
      publicBullets: [],
      operatorWarnings: [],
      reviewReasons: [],
      eventRefCount: 1,
      eventRefsUsed: ['e1'],
      estimatedCostUsd: null,
    };

    expect(storytellerDigestStatus(digest({ dispatch: { ...baseDispatch, needsReview: true } }), Date.parse('2026-05-30T04:10:00.000Z'))).toMatchObject({
      label: 'review',
      tone: 'warn',
    });
    expect(storytellerDigestStatus(digest({ dispatch: baseDispatch }), Date.parse('2026-05-30T04:10:00.000Z'))).toMatchObject({
      label: 'ready',
      tone: 'ok',
    });
    expect(storytellerDigestStatus(
      digest({ dispatch: { ...baseDispatch, generatedAt: '2026-05-30T05:00:00.000Z' } }),
      Date.parse('2026-05-30T04:10:00.000Z'),
    )).toMatchObject({
      label: 'review',
      tone: 'warn',
    });
    expect(storytellerDigestStatus(
      digest({
        dispatch: {
          ...baseDispatch,
          operatorWarnings: ['private handle still visible'],
        },
      }),
      Date.parse('2026-05-30T04:10:00.000Z'),
    )).toMatchObject({
      label: 'review',
      tone: 'warn',
    });
    expect(storytellerDigestStatus(
      digest({
        dispatch: {
          ...baseDispatch,
          warningCount: 2,
          reviewReasons: ['low_confidence'],
        },
      }),
      Date.parse('2026-05-30T04:10:00.000Z'),
    )).toMatchObject({
      label: 'review',
      tone: 'warn',
    });
    expect(storytellerDigestStatus(digest({ dispatch: baseDispatch }), Date.parse('2026-05-31T05:10:00.000Z'))).toMatchObject({
      label: 'stale',
      tone: 'warn',
    });
  });
});

describe('storytellerMythCard', () => {
  test('turns AP/GP exchange events into public story copy while preserving evidence', () => {
    expect(storytellerMythCard({
      ref: 'exchange-1',
      kind: 'city_ap_gp_exchange',
      residentName: 'res:hans',
      note: 'burned 25 GP for 50 AP',
      evidenceLabels: ['coin-995', '25 GP', '50 AP'],
    })).toEqual({
      title: 'Hans traded GP for attention',
      body: 'burned 25 GP for 50 AP',
      evidenceLabels: ['coin-995', '25 GP', '50 AP'],
    });
  });

  test('summarizes attention, goal, and unknown events without dropping notes', () => {
    expect(storytellerMythCard({
      ref: 'credit-1',
      kind: 'city_attention_credit',
      residentName: 'res:pip',
      note: 'received AP grant',
      evidenceLabels: ['100 AP'],
    }).title).toBe('Pip received attention');

    expect(storytellerMythCard({
      ref: 'goal-1',
      kind: 'goal_completed',
      residentName: 'res:duke',
      note: 'completed a bounded goal in Lumbridge',
      evidenceLabels: ['goal:lamp-route'],
    }).title).toBe('Duke completed a goal');

    expect(storytellerMythCard({
      ref: 'gift-1',
      kind: 'ncri_gift',
      residentName: 'res:ada',
      note: 'admin gifted limited-edition sigil',
      evidenceLabels: ['ncri:gilded-sigil'],
    }).title).toBe('Ada received an NCRI gift');

    expect(storytellerMythCard({
      ref: 'admin-transfer-1',
      kind: 'ncri_admin_transfer',
      residentName: 'res:ada',
      note: 'admin moved NCRI to resident',
      evidenceLabels: ['ncri:gilded-sigil'],
    }).title).toBe('Ada received an admin NCRI transfer');

    expect(storytellerMythCard({
      ref: 'mystery-1',
      kind: 'strange_new_signal',
      residentName: 'res:ada',
      note: 'saw something new near the square',
      evidenceLabels: ['ref:mystery-1'],
    })).toEqual({
      title: 'Ada left evidence',
      body: 'saw something new near the square',
      evidenceLabels: ['ref:mystery-1'],
    });
  });
});
