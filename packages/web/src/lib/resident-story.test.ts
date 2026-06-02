import { describe, expect, test } from 'bun:test';
import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { StorytellerDigestSummary } from './api';
import { residentStoryDigestSignal, residentStoryEvents, storytellerDigestRunList, storytellerDigestSafetyLine, storytellerDigestStatus, storytellerGroundingAudit, storytellerLatestPreview, storytellerLibraryPreview, storytellerMythCard, storytellerMythMoments, storytellerReviewDensity, storytellerRunListPressureLine } from './resident-story';

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

  test('matches resident aliases emitted by queue and city wrappers', () => {
    const aliased = digest({
      runId: 'run-alias',
      digestId: 'dig-alias',
      topEvents: [
        {
          ref: 'alias-1',
          kind: 'story_goal_progress',
          residentName: 'city-user:res:hans',
          ts: '2026-05-30T04:11:00.000Z',
          note: 'alias wrapper',
          importance: 'high',
          evidenceLabels: ['plan'],
        },
      ],
    });

    const events = residentStoryEvents(resident('res:hans'), [aliased]);
    expect(events.map(event => event.event.ref)).toEqual(['alias-1']);
  });

  test('uses grounded speech speaker attribution when filtering resident events', () => {
    const speech = digest({
      runId: 'run-speech',
      digestId: 'dig-speech',
      topEvents: [
        {
          ref: 'speech-1',
          kind: 'say',
          residentName: 'res:the-hush',
          ts: '2026-05-30T04:15:00.000Z',
          note: 'res:mother-anvil said: "Still here as Mother Anvil; watching the area."',
          importance: 'medium',
          evidenceLabels: ['library:speech-1'],
        },
      ],
    });

    expect(residentStoryEvents(resident('res:mother-anvil'), [speech]).map(event => event.event.ref)).toEqual(['speech-1']);
    expect(residentStoryEvents(resident('res:the-hush'), [speech]).map(event => event.event.ref)).toEqual([]);
  });

  test('uses grounded speaker attribution for Library writeback speech when filtering resident events', () => {
    const speech = digest({
      runId: 'run-library-speech',
      digestId: 'dig-library-speech',
      topEvents: [
        {
          ref: 'library-speech-1',
          kind: 'library_writeback',
          residentName: 'res:the-hush',
          ts: '2026-05-30T04:17:00.000Z',
          note: 'res:mother-anvil said: "Still here as Mother Anvil; watching the area."',
          importance: 'medium',
          evidenceLabels: ['library:writeback-1'],
        },
      ],
    });

    expect(residentStoryEvents(resident('res:mother-anvil'), [speech]).map(event => event.event.ref)).toEqual(['library-speech-1']);
    expect(residentStoryEvents(resident('res:the-hush'), [speech]).map(event => event.event.ref)).toEqual([]);
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

describe('storytellerDigestSafetyLine', () => {
  const baseDispatch = {
    dispatchId: 'dispatch-1',
    generatedAt: '2026-05-30T04:05:00.000Z',
    modelProfile: 'default',
    needsReview: false,
    warningCount: 0,
    publicBullets: [],
    operatorWarnings: [],
    reviewReasons: [],
    eventRefCount: 2,
    eventRefsUsed: ['e1', 'e2'],
    estimatedCostUsd: null,
  };

  test('marks ready dispatches as public-safe without overclaiming intelligence', () => {
    expect(storytellerDigestSafetyLine(
      digest({ dispatch: baseDispatch }),
      Date.parse('2026-05-30T04:10:00.000Z'),
    )).toEqual({
      label: 'public-safe',
      tone: 'ok',
      text: 'Public-safe dispatch copy: no review flags are present.',
    });
  });

  test('separates review-only, dry-run, stale, and empty Storyteller copy states', () => {
    expect(storytellerDigestSafetyLine(
      digest({ dispatch: { ...baseDispatch, needsReview: true, reviewReasons: ['missing_ref'] } }),
      Date.parse('2026-05-30T04:10:00.000Z'),
    )).toEqual({
      label: 'review-only',
      tone: 'warn',
      text: 'Review-only grounded preview: do not read dispatch copy aloud yet.',
    });

    expect(storytellerDigestSafetyLine(digest(), Date.parse('2026-05-30T04:10:00.000Z'))).toEqual({
      label: 'dry-run',
      tone: 'warn',
      text: 'Dry-run grounded preview: no public dispatch has been published yet.',
    });

    expect(storytellerDigestSafetyLine(
      digest({ dispatch: baseDispatch }),
      Date.parse('2026-05-31T05:10:00.000Z'),
    )).toEqual({
      label: 'stale',
      tone: 'warn',
      text: 'Stale dispatch copy: review freshness before reading aloud.',
    });

    expect(storytellerDigestSafetyLine(undefined)).toEqual({
      label: 'waiting',
      tone: 'warn',
      text: 'Waiting for grounded Storyteller evidence before public read-aloud.',
    });
  });
});

describe('storytellerDigestRunList', () => {
  test('keeps canon and review runs visible while collapsing older dry-runs', () => {
    const canon = digest({
      runId: 'canon/run-canon',
      digestId: 'digest-canon',
      queue: 'canon',
      dispatch: {
        dispatchId: 'dispatch-canon',
        generatedAt: '2026-05-30T04:05:00.000Z',
        modelProfile: 'default',
        needsReview: false,
        warningCount: 0,
        publicBullets: [],
        operatorWarnings: [],
        reviewReasons: [],
        eventRefCount: 1,
        eventRefsUsed: ['e1'],
      },
    });
    const review = digest({
      runId: 'review/run-review',
      digestId: 'digest-review',
      queue: 'review',
      dispatch: {
        dispatchId: 'dispatch-review',
        generatedAt: '2026-05-30T04:04:00.000Z',
        modelProfile: 'default',
        needsReview: true,
        warningCount: 1,
        publicBullets: [],
        operatorWarnings: ['needs review'],
        reviewReasons: ['operator_review'],
        eventRefCount: 1,
        eventRefsUsed: ['e1'],
      },
    });
    const latestDryRun = digest({ runId: 'dry-run-latest', digestId: 'digest-dry-latest', builtAt: '2026-05-30T04:03:00.000Z' });
    const olderDryRun = digest({ runId: 'dry-run-older', digestId: 'digest-dry-older', builtAt: '2026-05-30T03:55:00.000Z' });
    const oldestDryRun = digest({ runId: 'dry-run-oldest', digestId: 'digest-dry-oldest', builtAt: '2026-05-30T03:50:00.000Z' });

    const list = storytellerDigestRunList([canon, review, latestDryRun, olderDryRun, oldestDryRun]);

    expect(list.visible.map(item => item.runId)).toEqual([
      'canon/run-canon',
      'review/run-review',
      'dry-run-latest',
    ]);
    expect(list.collapsedDryRuns).toBe(2);
    expect(list.summary).toBe('Showing canon/review runs plus latest dry-run; 2 older dry-runs collapsed.');
  });

  test('pins a selected older dry-run so deep links remain visible in the run list', () => {
    const latestDryRun = digest({ runId: 'dry-run-latest', digestId: 'digest-dry-latest', builtAt: '2026-05-30T04:03:00.000Z' });
    const selectedDryRun = digest({ runId: 'dry-run-selected', digestId: 'digest-dry-selected', builtAt: '2026-05-30T03:55:00.000Z' });
    const hiddenDryRun = digest({ runId: 'dry-run-hidden', digestId: 'digest-dry-hidden', builtAt: '2026-05-30T03:50:00.000Z' });

    const list = storytellerDigestRunList([latestDryRun, selectedDryRun, hiddenDryRun], 'dry-run-selected');

    expect(list.visible.map(item => item.runId)).toEqual([
      'dry-run-latest',
      'dry-run-selected',
    ]);
    expect(list.collapsedDryRuns).toBe(1);
    expect(list.selectedCollapsedDryRun).toBe(true);
    expect(list.summary).toBe('Showing canon/review runs, latest dry-run, and selected dry-run; 1 other older dry-run collapsed.');
  });
});

describe('storytellerLatestPreview', () => {
  test('collapses repeated recovery events into one public movement moment', () => {
    const recoveryDigest = digest({
      digestId: 'recovery-digest',
      queue: 'canon',
      dispatch: {
        dispatchId: 'dispatch-recovery',
        generatedAt: '2026-05-30T04:05:00.000Z',
        modelProfile: 'default',
        needsReview: false,
        publicTitle: 'Movement returned',
        publicBody: '',
        publicBullets: [],
        operatorWarnings: [],
        reviewReasons: [],
        warningCount: 0,
        eventRefCount: 4,
        eventRefsUsed: ['stuck-1', 'stuck-2', 'stuck-3', 'goal-1'],
        estimatedCostUsd: null,
      },
      topEventCount: 4,
      topEvents: [
        {
          ref: 'stuck-1',
          kind: 'stuck_recovered',
          residentName: 'res:the-hush',
          ts: '2026-05-30T04:02:00.000Z',
          note: 'res:the-hush recovered from being stuck.',
          importance: 'medium',
          evidenceLabels: ['library:stuck-1'],
        },
        {
          ref: 'stuck-2',
          kind: 'stuck_recovered',
          residentName: 'res:mother-anvil',
          ts: '2026-05-30T04:01:00.000Z',
          note: 'res:mother-anvil recovered from being stuck.',
          importance: 'medium',
          evidenceLabels: ['library:stuck-2'],
        },
        {
          ref: 'stuck-3',
          kind: 'stuck_recovered',
          residentName: 'res:pip',
          ts: '2026-05-30T04:00:00.000Z',
          note: 'res:pip recovered from being stuck.',
          importance: 'medium',
          evidenceLabels: ['library:stuck-3'],
        },
        {
          ref: 'goal-1',
          kind: 'goal_progress',
          residentName: 'res:hans',
          ts: '2026-05-30T04:03:00.000Z',
          note: 'checked the next landmark',
          importance: 'high',
          evidenceLabels: ['library:goal-1'],
        },
      ],
    });

    expect(storytellerMythMoments(recoveryDigest.topEvents, 3)).toEqual([
      {
        title: 'Movement returned to 3 residents',
        body: 'The Hush, Mother Anvil, and Pip got moving again.',
        evidenceLabels: ['library:stuck-1', 'library:stuck-2', 'library:stuck-3'],
      },
      {
        title: 'Hans advanced a goal',
        body: 'checked the next landmark',
        evidenceLabels: ['library:goal-1'],
      },
    ]);

    const preview = storytellerLatestPreview(recoveryDigest, Date.parse('2026-05-30T04:10:00.000Z'));
    expect(preview.body).toContain('Movement returned to 3 residents: The Hush, Mother Anvil, and Pip got moving again.');
    expect(preview.body).toContain('Hans advanced a goal: checked the next landmark');
    expect(preview.body).not.toContain('recovered from being stuck');
    expect(preview.detail).toContain('2 grounded public moments');
  });

  test('uses a ready dispatch body and bullets when grounded canon is safe to read', () => {
    const preview = storytellerLatestPreview(digest({
      dispatch: {
        dispatchId: 'dispatch-ready',
        generatedAt: '2026-05-30T04:05:00.000Z',
        modelProfile: 'default',
        needsReview: false,
        publicTitle: 'Null City wakes cleanly',
        publicBody: 'Residents traded GP for attention and kept their plans visible.',
        publicBullets: ['Hans traded 25 GP for 50 AP.'],
        operatorWarnings: [],
        reviewReasons: [],
        warningCount: 0,
        eventRefCount: 2,
        eventRefsUsed: ['e1', 'e2'],
        estimatedCostUsd: null,
      },
    }), Date.parse('2026-05-30T04:10:00.000Z'));

    expect(preview).toEqual({
      tone: 'ok',
      source: 'dispatch',
      label: 'ready',
      title: 'Null City wakes cleanly',
      body: 'Residents traded GP for attention and kept their plans visible.',
      detail: 'Dispatch is grounded and ready for public review.',
      bullets: ['Hans traded 25 GP for 50 AP.'],
    });
  });

  test('returns safe static preview copy when the dispatch needs review', () => {
    const preview = storytellerLatestPreview(digest({
      dispatch: {
        dispatchId: 'dispatch-review',
        generatedAt: '2026-05-30T04:05:00.000Z',
        modelProfile: 'default',
        needsReview: true,
        publicTitle: 'Operator draft',
        publicBody: 'Raw operator QA text should not lead the public preview.',
        publicBullets: [],
        operatorWarnings: [],
        reviewReasons: ['missing_ref'],
        warningCount: 1,
        eventRefCount: 1,
        eventRefsUsed: ['missing'],
        estimatedCostUsd: null,
      },
    }), Date.parse('2026-05-30T04:10:00.000Z'));

    expect(preview).toMatchObject({
      tone: 'warn',
      source: 'summary',
      label: 'review',
      title: 'Storyteller preview held for review',
      detail: 'Dispatch is grounded but needs operator review before public broadcast. Non-canon Storyteller copy is hidden until an operator approves it for public canon.',
      bullets: [],
    });
    expect(preview.body).toBe('This Storyteller run is held for operator review. Inspect its grounded evidence before using it as public canon.');
    expect(preview.body).not.toContain('Raw operator QA text');
    expect(preview.body).not.toContain('Hans traded GP for attention');
  });

  test('fails closed for otherwise ready dispatches outside the canon queue', () => {
    const preview = storytellerLatestPreview(digest({
      queue: 'review',
      dispatch: {
        dispatchId: 'dispatch-review-queue',
        generatedAt: '2026-05-30T04:05:00.000Z',
        modelProfile: 'default',
        needsReview: false,
        publicTitle: 'Looks ready but is review-only',
        publicBody: 'This model output should not become the landing preview yet.',
        publicBullets: ['Looks public, but is not canon.'],
        operatorWarnings: [],
        reviewReasons: [],
        warningCount: 0,
        eventRefCount: 1,
        eventRefsUsed: ['e1'],
        estimatedCostUsd: null,
      },
    }), Date.parse('2026-05-30T04:10:00.000Z'));

    expect(preview).toMatchObject({
      tone: 'warn',
      source: 'summary',
      label: 'ready',
      title: 'Storyteller preview held for review',
      detail: 'Dispatch is grounded and ready for public review. Run is in the review queue, so public preview copy is hidden until it is promoted to canon.',
      bullets: [],
    });
    expect(preview.body).toBe('This Storyteller run is held for operator review. Inspect its grounded evidence before using it as public canon.');
    expect(preview.body).not.toContain('This model output should not become the landing preview yet.');
  });

  test('keeps dry-run and empty preview states explicit', () => {
    expect(storytellerLatestPreview(digest(), Date.parse('2026-05-30T04:10:00.000Z'))).toMatchObject({
      tone: 'warn',
      source: 'summary',
      label: 'dry-run',
      title: 'Storyteller preview held for review',
      body: 'This Storyteller run is held for operator review. Inspect its grounded evidence before using it as public canon.',
    });

    const emptyPreview = storytellerLatestPreview(undefined);
    expect(emptyPreview).toEqual({
      tone: 'warn',
      source: 'empty',
      label: 'waiting',
      title: 'No Storyteller run loaded',
      body: 'Digest and dispatch artifacts will appear once the controller writes grounded Storyteller runs.',
      detail: 'No latest Storyteller digest is available yet.',
      bullets: [],
    });
    expect(emptyPreview.detail).not.toContain('/api/');
  });
});

describe('storytellerLibraryPreview', () => {
  test('turns the latest digest into compact Library story context', () => {
    const preview = storytellerLibraryPreview(digest({
      dispatch: {
        dispatchId: 'dispatch-library',
        generatedAt: '2026-05-30T04:05:00.000Z',
        modelProfile: 'default',
        needsReview: false,
        publicTitle: 'Null City keeps its promises',
        publicBody: 'Residents turned AP and GP proof into Library memory.',
        publicBullets: [],
        operatorWarnings: [],
        reviewReasons: [],
        warningCount: 0,
        eventRefCount: 2,
        eventRefsUsed: ['e1', 'e2'],
        estimatedCostUsd: null,
      },
    }), Date.parse('2026-05-30T04:10:00.000Z'));

    expect(preview).toEqual({
      tone: 'ok',
      source: 'dispatch',
      statusLabel: 'ready',
      title: 'Null City keeps its promises',
      body: 'Residents turned AP and GP proof into Library memory.',
      detail: 'Dispatch is grounded and ready for public review.',
      runLabel: 'run-1',
      eventLabel: '2 events',
    });
  });

  test('keeps the empty Library state public-facing and command-free', () => {
    const preview = storytellerLibraryPreview(undefined);

    expect(preview).toEqual({
      tone: 'warn',
      source: 'empty',
      statusLabel: 'waiting',
      title: 'No Library story digest yet',
      body: 'Grounded resident stories will appear here once Storyteller has a digest to review.',
      detail: 'Open the Storyteller feed for operator review context.',
      runLabel: '-',
      eventLabel: '0 events',
    });
    expect(`${preview.title} ${preview.body} ${preview.detail}`).not.toMatch(/storyteller:|`|\/api/);
  });
});

describe('storytellerGroundingAudit', () => {
  test('audits dispatch refs against top event refs without penalizing uncited events', () => {
    expect(storytellerGroundingAudit(digest({
      dispatch: {
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
      },
    }))).toEqual({
      tone: 'ok',
      summary: '1 dispatch ref matches top events; 1 top event uncited.',
      citedKnownRefs: ['e1'],
      missingRefs: [],
      uncitedTopRefs: ['e2'],
      warningCount: 0,
      reviewReasonCount: 0,
    });
  });

  test('warns when dispatch cites refs that are missing from top events or has review signals', () => {
    expect(storytellerGroundingAudit(digest({
      dispatch: {
        dispatchId: 'dispatch-2',
        generatedAt: '2026-05-30T04:05:00.000Z',
        modelProfile: 'default',
        needsReview: false,
        warningCount: 2,
        publicBullets: [],
        operatorWarnings: ['unknown ref cited'],
        reviewReasons: ['missing_ref'],
        eventRefCount: 2,
        eventRefsUsed: ['e1', 'ghost'],
        estimatedCostUsd: null,
      },
    }))).toEqual({
      tone: 'warn',
      summary: '1 dispatch ref missing from top events; review signals present.',
      citedKnownRefs: ['e1'],
      missingRefs: ['ghost'],
      uncitedTopRefs: ['e2'],
      warningCount: 2,
      reviewReasonCount: 1,
    });
  });

  test('marks dry-run digests as unaudited until a dispatch exists', () => {
    expect(storytellerGroundingAudit(digest())).toEqual({
      tone: 'warn',
      summary: 'No dispatch refs to audit yet.',
      citedKnownRefs: [],
      missingRefs: [],
      uncitedTopRefs: ['e1', 'e2'],
      warningCount: 0,
      reviewReasonCount: 0,
    });
  });

  test('keeps zero-ref dispatch audit grammar readable', () => {
    expect(storytellerGroundingAudit(digest({
      topEventCount: 0,
      topEvents: [],
      dispatch: {
        dispatchId: 'dispatch-empty',
        generatedAt: '2026-05-30T04:05:00.000Z',
        modelProfile: 'default',
        needsReview: false,
        warningCount: 2,
        publicBullets: [],
        operatorWarnings: ['fallback dispatch'],
        reviewReasons: ['no_events'],
        eventRefCount: 0,
        eventRefsUsed: [],
        estimatedCostUsd: null,
      },
    }))).toMatchObject({
      tone: 'warn',
      summary: '0 dispatch refs match top events; no top events selected; review signals present.',
      warningCount: 2,
      reviewReasonCount: 1,
    });
  });
});

describe('storytellerReviewDensity', () => {
  test('keeps dry-run density copy readable while dispatch review is pending', () => {
    expect(storytellerReviewDensity(digest())).toEqual({
      tone: 'warn',
      headline: 'Dry-run: 2 grounded events await dispatch',
      detail: 'No dispatch refs to audit yet; 2 top events are available across 1 resident.',
      chips: ['0 matched', '0 missing', '2 uncited', 'dry-run'],
    });
  });

  test('summarizes review-heavy dispatches as compact operator pressure', () => {
    expect(storytellerReviewDensity(digest({
      dispatch: {
        dispatchId: 'dispatch-review-density',
        generatedAt: '2026-05-30T04:05:00.000Z',
        modelProfile: 'default',
        needsReview: false,
        warningCount: 2,
        publicBullets: [],
        operatorWarnings: ['unknown ref cited'],
        reviewReasons: ['missing_ref'],
        eventRefCount: 2,
        eventRefsUsed: ['e1', 'ghost'],
        estimatedCostUsd: null,
      },
    }))).toEqual({
      tone: 'warn',
      headline: 'Review load: 4 signals',
      detail: '1 missing dispatch ref, 2 warnings, and 1 review reason across 2 dispatch refs and 2 top events.',
      chips: ['1 matched', '1 missing', '1 uncited', '2 warnings', '1 review reason'],
    });
  });

  test('summarizes ready dispatch density without turning uncited top events into blockers', () => {
    expect(storytellerReviewDensity(digest({
      dispatch: {
        dispatchId: 'dispatch-ready-density',
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
      },
    }))).toEqual({
      tone: 'ok',
      headline: 'Ready: 1/2 top events cited',
      detail: '1 uncited top event remains available for operator context.',
      chips: ['1 matched', '0 missing', '1 uncited', '0 review signals'],
    });
  });
});

describe('storytellerRunListPressureLine', () => {
  test('turns review density into a compact run-list line', () => {
    expect(storytellerRunListPressureLine(digest({
      dispatch: {
        dispatchId: 'dispatch-run-list-pressure',
        generatedAt: '2026-05-30T04:05:00.000Z',
        modelProfile: 'default',
        needsReview: false,
        warningCount: 2,
        publicBullets: [],
        operatorWarnings: ['unknown ref cited'],
        reviewReasons: ['missing_ref'],
        eventRefCount: 2,
        eventRefsUsed: ['e1', 'ghost'],
        estimatedCostUsd: null,
      },
    }))).toBe('Review load: 4 signals · 1 matched · 1 missing · 1 uncited · 2 warnings · 1 review reason');
  });

  test('keeps ready and dry-run pressure lines short enough for run cards', () => {
    expect(storytellerRunListPressureLine(digest({
      dispatch: {
        dispatchId: 'dispatch-ready-run-list',
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
      },
    }))).toBe('Ready: 1/2 top events cited · 1 matched · 0 missing · 1 uncited · 0 review signals');
    expect(storytellerRunListPressureLine(digest())).toBe('Dry-run: 2 grounded events await dispatch · 0 matched · 0 missing · 2 uncited · dry-run');
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

  test('humanizes resident handles in public event notes', () => {
    expect(storytellerMythCard({
      ref: 'goal-progress-1',
      kind: 'goal_progress',
      residentName: 'res:ada-lamp',
      note: 'res:ada-lamp carried proof back to Lumbridge.',
      evidenceLabels: ['goal:lamp-route'],
    })).toEqual({
      title: 'Ada Lamp advanced a goal',
      body: 'Ada Lamp carried proof back to Lumbridge.',
      evidenceLabels: ['goal:lamp-route'],
    });
  });

  test('falls back to a grounded evidence label when event labels are empty', () => {
    expect(storytellerMythCard({
      ref: 'empty-evidence-1',
      kind: 'goal_progress',
      residentName: 'res:ada',
      note: 'kept moving toward the goal',
      evidenceLabels: [],
    }).evidenceLabels).toEqual(['grounded evidence']);
  });

  test('turns stuck recovery into public narrative copy without dropping evidence', () => {
    expect(storytellerMythCard({
      ref: 'stuck-1',
      kind: 'stuck_recovered',
      residentName: 'res:the-hush',
      note: 'res:the-hush recovered from being stuck.',
      evidenceLabels: ['library:stuck-1'],
    })).toEqual({
      title: 'The Hush got moving again',
      body: 'The Hush recovered and kept moving.',
      evidenceLabels: ['library:stuck-1'],
    });
  });

  test('turns say events into quoted public resident speech', () => {
    expect(storytellerMythCard({
      ref: 'say-1',
      kind: 'say',
      residentName: 'res:the-hush',
      note: 'res:the-hush said: "I am checking the landmark at 2938,3338."',
      evidenceLabels: ['library:say-1'],
    })).toEqual({
      title: 'The Hush spoke in the city',
      body: '"I am checking the landmark at 2938,3338."',
      evidenceLabels: ['library:say-1'],
    });
  });

  test('turns Library writeback speech into public resident speech', () => {
    expect(storytellerMythCard({
      ref: 'library-say-1',
      kind: 'library_writeback',
      residentName: 'res:mother-anvil',
      note: 'res:mother-anvil said: "Still here as Mother Anvil; watching the area."',
      evidenceLabels: ['library:writeback-1'],
    })).toEqual({
      title: 'Mother Anvil spoke in the city',
      body: '"Still here as Mother Anvil; watching the area."',
      evidenceLabels: ['library:writeback-1'],
    });
  });

  test('titles speech cards from the grounded speaker when event attribution disagrees', () => {
    expect(storytellerMythCard({
      ref: 'speech-attribution-1',
      kind: 'say',
      residentName: 'res:the-hush',
      note: 'res:mother-anvil said: "Still here as Mother Anvil; watching the area."',
      evidenceLabels: ['library:speech-attribution-1'],
    })).toEqual({
      title: 'Mother Anvil spoke in the city',
      body: '"Still here as Mother Anvil; watching the area."',
      evidenceLabels: ['library:speech-attribution-1'],
    });
  });

  test('names live economy and lifecycle digest kinds with concrete public verbs', () => {
    const titleFor = (kind: string) => storytellerMythCard({
      ref: `${kind}-1`,
      kind,
      residentName: 'res:ada',
      note: 'digest event',
      evidenceLabels: ['ref:source'],
    }).title;

    expect(titleFor('ap_granted')).toBe('Ada received attention');
    expect(titleFor('ap_low')).toBe('Ada ran low on attention');
    expect(titleFor('gp_observed')).toBe('Ada showed GP proof');
    expect(titleFor('resident_faded')).toBe('Ada faded from the live window');
    expect(titleFor('stuck_recovered')).toBe('Ada got moving again');
    expect(titleFor('say')).toBe('Ada spoke in the city');
    expect(titleFor('patron_gift')).toBe('Ada received patron support');
    expect(titleFor('quiet_resident')).toBe('Ada went quiet');
  });
});
