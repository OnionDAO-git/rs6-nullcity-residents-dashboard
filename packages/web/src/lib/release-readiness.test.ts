import { describe, expect, test } from 'bun:test';
import type { BenchmarkArtifactSummary, ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { StorytellerDigestSummary } from './api';
import type { EconomyTransportSummary } from './live-economy';
import type { PrintQueueInsightSummary } from './print-queue-insights';
import { buildReleaseReadiness, releaseReadinessActionQueue, releaseReadinessDemoProofRail, releaseReadinessFirstFiveSteps, releaseReadinessMetricTiles } from './release-readiness';

function resident(overrides: Partial<ResidentDashboardRow> = {}): ResidentDashboardRow {
  return {
    name: 'res:hans',
    online: true,
    attention: 75,
    thinking: { activePlan: 'Earn GP and keep AP above zero', mode: 'executing' },
    feed: {
      attached: true,
      ageMs: 8_000,
      nearby: { players: 0, npcs: 2, objects: 4, worldItems: 1 },
      events: 3,
      availableActions: 7,
    },
    body: { controlHeld: true, latestPerception: { resident: { inventory: [{ itemId: 995, amount: 42 }] } } },
    stack: {
      model: { endpoint: 'openrouter/haiku', model: 'haiku-4' },
      configuredModules: [{
        id: 'onion.runescape.standard',
        version: '0.2.0',
        source: 'soul',
        activeFacets: ['thinking', 'nervous-rules'],
      }],
      activeModule: {
        id: 'onion.runescape.standard',
        version: '0.2.0',
        source: 'soul',
        activeFacets: ['thinking', 'nervous-rules'],
      },
    },
    storyArc: { phase: 'progress', summary: 'Working toward the city loop.' },
    ...overrides,
  };
}

function digest(overrides: Partial<StorytellerDigestSummary> = {}): StorytellerDigestSummary {
  return {
    runId: 'run-1',
    digestId: 'digest-1',
    queue: 'canon',
    builtAt: '2026-05-30T09:00:00.000Z',
    topEventCount: 2,
    residentCount: 1,
    topEvents: [
      {
        ref: 'e1',
        kind: 'city_attention_credit',
        residentName: 'res:hans',
        ts: '2026-05-30T08:58:00.000Z',
        note: 'AP grant',
        importance: 'high',
        evidenceLabels: ['ap=50'],
      },
      {
        ref: 'e2',
        kind: 'city_ap_gp_exchange',
        residentName: 'res:hans',
        ts: '2026-05-30T08:59:00.000Z',
        note: 'GP traded for AP',
        importance: 'medium',
        evidenceLabels: ['gp=25', 'ap=50'],
      },
    ],
    dispatch: {
      dispatchId: 'dispatch-1',
      generatedAt: '2026-05-30T09:00:00.000Z',
      modelProfile: 'openrouter/haiku',
      needsReview: false,
      warningCount: 0,
      publicTitle: 'Null City wakes',
      publicBody: 'Residents are taking visible actions.',
      publicBullets: [],
      operatorWarnings: [],
      reviewReasons: [],
      eventRefCount: 2,
      eventRefsUsed: ['e1', 'e2'],
    },
    ...overrides,
  };
}

function dryRunDigest(overrides: Partial<StorytellerDigestSummary> = {}): StorytellerDigestSummary {
  const { dispatch: _dispatch, ...base } = digest({
    runId: 'dry-run-1',
    digestId: 'dry-run-digest-1',
    queue: 'dry-run',
    builtAt: '2026-05-30T08:59:00.000Z',
  });
  return {
    ...base,
    ...overrides,
  };
}

function printInsights(overrides: Partial<PrintQueueInsightSummary> = {}): PrintQueueInsightSummary {
  return {
    activeRequests: 1,
    awaitingPayment: 0,
    paidWithoutQueue: 0,
    inQueue: 1,
    printing: 0,
    warnings: ['No queue blockers detected.'],
    queueHealth: {
      unassignedActive: 0,
      failed: 0,
      orphaned: 0,
      blockers: [],
    },
    ncriTrades: {
      pending: 0,
      accepted: 1,
      failed: 0,
      recent: [],
    },
    ...overrides,
  };
}

function economyTransport(overrides: Partial<EconomyTransportSummary> = {}): EconomyTransportSummary {
  return {
    tone: 'ok',
    label: 'stream',
    detail: 'SSE snapshots are updating heartbeat and AP/GP totals.',
    ...overrides,
  };
}

function benchmark(overrides: Partial<BenchmarkArtifactSummary> = {}): BenchmarkArtifactSummary {
  return {
    file: 'bench.json',
    runId: 'bench_ap_gp_exchange',
    task: { id: 'ap-gp-exchange-5m', version: '1' },
    module: { id: 'onion.runescape.standard', version: '0.2.0' },
    mode: 'autonomous',
    resident: 'res:hans',
    status: 'passed',
    score: 1,
    metrics: {},
    endedAt: '2026-05-30T09:00:00.000Z',
    ...overrides,
  };
}

function normalLifeBenchmark(overrides: Partial<BenchmarkArtifactSummary> = {}): BenchmarkArtifactSummary {
  return benchmark({
    runId: 'normal_life_audit_20260530T090000Z',
    task: { id: 'normal-life-audit', version: '1' },
    metrics: {
      totalActionAttempts: 300,
      successfulActionSubmissions: 300,
      failedActionSubmissions: 0,
      cause_low_health_heal_wait: 0,
      timeline_city_ap_gp_exchange: 2,
      timeline_trade_completed: 1,
      timeline_stuck_detected: 5,
      timeline_stuck_recovered: 5,
      durationMs: 20 * 60 * 1000,
    },
    ...overrides,
  });
}

function capabilityBenchmarks(): BenchmarkArtifactSummary[] {
  return [
    benchmark({ runId: 'bench_apgp', task: { id: 'ap-gp-exchange-5m', version: '1' } }),
    benchmark({ runId: 'named_trade_soak_20260530125718', task: { id: 'named-trade-soak', version: '1' } }),
    benchmark({ runId: 'bench_combat', task: { id: 'combat-prayer-10m', version: '1' } }),
    benchmark({ runId: 'named_equip_soak_20260530120900', task: { id: 'named-equip-soak', version: '1' } }),
    benchmark({ runId: 'bench_memory', task: { id: 'memory-route-recall-5m', version: '1' } }),
    normalLifeBenchmark(),
  ];
}

describe('buildReleaseReadiness', () => {
  test('marks the city ready when residents, plans, GP, Storyteller, and NCRI/print signals are present', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [digest(), dryRunDigest()],
      printInsights: printInsights(),
      economyTransport: economyTransport(),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('ready');
    expect(summary.headline).toBe('Ready for operator review.');
    expect(summary.blockers).toEqual([]);
    expect(summary.metrics).toMatchObject({
      residents: 1,
      onlineResidents: 1,
      activePlans: 1,
      lowApResidents: 0,
      failedActionResidents: 0,
      observedGp: 42,
      latestStorytellerAgeMinutes: 10,
      capabilityProofs: 5,
      capabilityMissing: 0,
    });
    expect(summary.checks.map(check => [check.id, check.tone])).toEqual([
      ['residents', 'ok'],
      ['identity', 'ok'],
      ['plans', 'ok'],
      ['loop', 'ok'],
      ['normal-life', 'ok'],
      ['ap', 'ok'],
      ['gp', 'ok'],
      ['economy-transport', 'ok'],
      ['capabilities', 'ok'],
      ['storyteller', 'ok'],
      ['ncri-print', 'ok'],
    ]);
    expect(releaseReadinessMetricTiles(summary).find(tile => tile.label === 'Transport')).toEqual({
      label: 'Transport',
      value: 'stream',
    });
    expect(releaseReadinessMetricTiles(summary).find(tile => tile.label === 'NCRI Prints')).toEqual({
      label: 'NCRI Prints',
      value: '1 accepted',
    });
    expect(releaseReadinessMetricTiles(summary).find(tile => tile.label === 'Model+SPARK')).toEqual({
      label: 'Model+SPARK',
      value: '1/1 model · 1/1 SPARK',
    });
    expect(releaseReadinessDemoProofRail(summary)).toEqual([
      {
        label: 'Residents',
        tone: 'ok',
        detail: 'Residents, plans, and latest action outcomes are visible.',
      },
      {
        label: 'Normal-life',
        tone: 'ok',
        detail: 'Latest normal-life audit is clear for recovery and AP/GP recurrence checks.',
      },
      {
        label: 'AP/GP',
        tone: 'ok',
        detail: 'AP support and coin-995 GP evidence are present.',
      },
      {
        label: 'Story',
        tone: 'ok',
        detail: '2 grounded events across 1 resident.',
      },
      {
        label: 'Dry-run',
        tone: 'ok',
        detail: 'Dry-run digest evidence is 11m old with 2 grounded events.',
      },
    ]);
  });

  test('blocks when no residents are visible', () => {
    const summary = buildReleaseReadiness({
      residents: [],
      storyDigests: [],
      printInsights: printInsights({ activeRequests: 0, inQueue: 0, ncriTrades: { pending: 0, accepted: 0, failed: 0, recent: [] } }),
      benchmarkRuns: [],
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('blocked');
    expect(summary.blockers).toContain('No residents are visible in the dashboard snapshot.');
    expect(summary.nextActions[0]).toBe('Start or reconnect the controller before demoing the resident loop.');
  });

  test('uses singular detail copy when exactly one readiness signal needs attention', () => {
    const summary = buildReleaseReadiness({
      residents: [resident({ body: { controlHeld: true, latestPerception: { resident: { inventory: [] } } } })],
      storyDigests: [digest()],
      printInsights: printInsights(),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('watch');
    expect(summary.detail).toBe('1 signal needs operator attention before relying on the loop live.');
  });

  test('watches release readiness when live AP/GP economy uses polling fallback', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [digest()],
      printInsights: printInsights(),
      economyTransport: economyTransport({
        tone: 'warn',
        label: 'polling',
        detail: 'Economy stream is unavailable; polling live and heartbeat routes.',
      }),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('watch');
    expect(summary.checks.find(check => check.id === 'economy-transport')).toEqual({
      id: 'economy-transport',
      label: 'Economy Transport',
      tone: 'warn',
      value: 'polling',
      detail: 'Economy stream is unavailable; polling live and heartbeat routes.',
    });
    expect(summary.nextActions).toContain('Restore the economy stream or confirm polling fallback before relying on live AP/GP state.');
    expect(releaseReadinessMetricTiles(summary).find(tile => tile.label === 'Transport')).toEqual({
      label: 'Transport',
      value: 'polling',
      tone: 'warn',
      detail: 'Economy stream is unavailable; polling live and heartbeat routes.',
    });
  });

  test('queues bridge configuration when release readiness has no live economy transport', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [digest()],
      printInsights: printInsights(),
      economyTransport: economyTransport({
        tone: 'warn',
        label: 'bridge',
        detail: 'Set NULLCITY_CITY_API_URL and NULLCITY_CITY_API_TOKEN before stream or polling transport can load.',
      }),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('watch');
    expect(summary.checks.find(check => check.id === 'economy-transport')).toMatchObject({
      tone: 'warn',
      value: 'bridge',
    });
    expect(summary.nextActions).toContain('Configure the live economy bridge before claiming AP/GP state is current.');
  });

  test('surfaces print loop readiness in compact metric tiles', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [digest()],
      printInsights: printInsights({ activeRequests: 0, inQueue: 0, ncriTrades: { pending: 0, accepted: 0, failed: 0, recent: [] } }),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('watch');
    expect(summary.checks.find(check => check.id === 'ncri-print')).toMatchObject({
      tone: 'warn',
      value: 'no live signal',
    });
    expect(releaseReadinessMetricTiles(summary).find(tile => tile.label === 'NCRI Prints')).toEqual({
      label: 'NCRI Prints',
      value: 'no live signal',
      tone: 'warn',
      detail: 'No active print request or NCRI trade signal is visible yet.',
    });
  });

  test('blocks when the latest capability proof fails despite other live signals', () => {
    const summary = buildReleaseReadiness({
      residents: [
        resident({
          attention: 2,
          thinking: { mode: 'idle' },
          body: { controlHeld: true },
        }),
      ],
      storyDigests: [digest({
        builtAt: '2026-05-30T06:00:00.000Z',
        dispatch: {
          dispatchId: 'dispatch-2',
          generatedAt: '2026-05-30T06:00:00.000Z',
          needsReview: true,
          warningCount: 2,
          publicBullets: [],
          operatorWarnings: ['thin evidence'],
          reviewReasons: ['manual review requested'],
          eventRefCount: 0,
          eventRefsUsed: [],
        },
      })],
      printInsights: printInsights({
        warnings: ['1 active queue entry missing a printer assignment.'],
        queueHealth: {
          unassignedActive: 1,
          failed: 0,
          orphaned: 0,
          blockers: [{
            id: 'queue-1',
            printRequestId: 'print-1',
            status: 'queued',
            updatedAt: '2026-05-30T09:00:00.000Z',
            reason: 'active queue entry has no assigned printer',
          }],
        },
      }),
      benchmarkRuns: [
        benchmark({ task: { id: 'ap-gp-exchange-5m', version: '1' }, status: 'failed', score: 0.25, failureReason: 'unsafe loop' }),
        benchmark({ task: { id: 'combat-prayer-10m', version: '1' }, status: 'passed', score: 1 }),
      ],
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('blocked');
    expect(summary.checks.find(check => check.id === 'ap')).toMatchObject({ tone: 'warn', value: '1 low AP' });
    expect(summary.checks.find(check => check.id === 'gp')).toMatchObject({ tone: 'warn', value: 'not observed' });
    expect(summary.checks.find(check => check.id === 'capabilities')).toMatchObject({ tone: 'fail', value: '1 failed' });
    expect(summary.checks.find(check => check.id === 'storyteller')).toMatchObject({ tone: 'warn' });
    expect(summary.checks.find(check => check.id === 'ncri-print')).toMatchObject({ tone: 'warn' });
    expect(summary.nextActions).toContain('Assign blocked print queue entries or avoid the print queue during the demo.');
    expect(releaseReadinessMetricTiles(summary).find(tile => tile.label === 'NCRI Prints')).toEqual({
      label: 'NCRI Prints',
      value: '1 blocker',
      tone: 'warn',
      detail: 'Print queue or NCRI trade records need operator attention before relying on the loop live.',
    });
  });

  test('blocks when a visible resident has a failed latest action outcome', () => {
    const summary = buildReleaseReadiness({
      residents: [
        resident({
          body: {
            controlHeld: true,
            latestPerception: { resident: { inventory: [{ itemId: 995, amount: 42 }] } },
            lastAction: { kind: 'attack', result: 'timeout', source: 'body', tick: 500 },
          },
          feed: {
            attached: true,
            tick: 500,
            ageMs: 4_000,
            nearby: { players: 0, npcs: 1, objects: 4, worldItems: 1 },
            events: 3,
            availableActions: 7,
          },
        }),
      ],
      storyDigests: [digest()],
      printInsights: printInsights(),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('blocked');
    expect(summary.metrics.failedActionResidents).toBe(1);
    expect(summary.checks.find(check => check.id === 'loop')).toEqual({
      id: 'loop',
      label: 'Resident Loop',
      tone: 'fail',
      value: '1 failed action',
      detail: 'res:hans latest action outcome is failed, timed out, or cancelled.',
    });
    expect(summary.blockers).toContain('res:hans latest action outcome is failed, timed out, or cancelled.');
    expect(summary.nextActions).toContain('Inspect residents with failed or timed-out latest actions before demoing liveness.');
  });

  test('watches release readiness when a resident is stuck in low-health recovery wait', () => {
    const summary = buildReleaseReadiness({
      residents: [
        resident({
          thinking: { mode: 'executing', activePlan: 'Recover health before re-engaging.' },
          body: {
            controlHeld: true,
            latestPerception: { resident: { inventory: [{ itemId: 995, amount: 42 }] } },
            lastAction: { kind: 'noop', result: 'success', source: 'thinking', cause: 'low_health_heal_wait', tick: 900 },
          },
          feed: {
            attached: true,
            tick: 900,
            ageMs: 4_000,
            nearby: { players: 0, npcs: 1, objects: 4, worldItems: 1 },
            events: 3,
            availableActions: 7,
          },
          progress: {
            samples: 4,
            stuckTicks: 37,
            latest: { meaningful: false, reasons: [], stuckSince: 863, tick: 900 },
          },
        }),
      ],
      storyDigests: [digest(), dryRunDigest()],
      printInsights: printInsights(),
      economyTransport: economyTransport(),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('watch');
    expect(summary.metrics.failedActionResidents).toBe(0);
    expect(summary.metrics.recoveryWaitResidents).toBe(1);
    expect(summary.checks.find(check => check.id === 'loop')).toEqual({
      id: 'loop',
      label: 'Resident Loop',
      tone: 'warn',
      value: '1 recovery wait',
      detail: 'res:hans: Latest action is noop with cause low_health_heal_wait; stuck 37 ticks; inspect food/cook/eat recovery before trusting combat liveness.',
    });
    expect(summary.nextActions).toContain('Inspect low-health recovery waits in Resident Triage or Ops View before demoing liveness.');
    expect(releaseReadinessDemoProofRail(summary).find(item => item.label === 'Residents')).toEqual({
      label: 'Residents',
      tone: 'warn',
      detail: 'res:hans: Latest action is noop with cause low_health_heal_wait; stuck 37 ticks; inspect food/cook/eat recovery before trusting combat liveness.',
    });
    expect(releaseReadinessMetricTiles(summary).find(tile => tile.label === 'Action Risks')).toEqual({
      label: 'Action Risks',
      value: '1',
      tone: 'warn',
      detail: 'res:hans: Latest action is noop with cause low_health_heal_wait; stuck 37 ticks; inspect food/cook/eat recovery before trusting combat liveness.',
    });
    expect(releaseReadinessActionQueue(summary)).toContainEqual({
      label: 'Inspect recovery',
      tone: 'warn',
      detail: 'Inspect low-health recovery waits in Resident Triage or Ops View before demoing liveness.',
      target: 'Residents',
      path: '/residents',
    });
  });

  test('builds compact metric tiles with action risk counts', () => {
    const summary = buildReleaseReadiness({
      residents: [
        resident({
          body: {
            controlHeld: true,
            latestPerception: { resident: { inventory: [{ itemId: 995, amount: 42 }] } },
            lastAction: { kind: 'attack', result: 'failed', source: 'body', tick: 500 },
          },
          feed: {
            attached: true,
            tick: 500,
            ageMs: 4_000,
            nearby: { players: 0, npcs: 1, objects: 4, worldItems: 1 },
            events: 3,
            availableActions: 7,
          },
        }),
      ],
      storyDigests: [digest()],
      printInsights: printInsights(),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    const tiles = releaseReadinessMetricTiles(summary);

    expect(tiles.map(tile => tile.label)).toEqual([
      'Residents',
      'Model+SPARK',
      'NCRI Prints',
      'Plans',
      'Action Risks',
      'Normal-life',
      'Low AP',
      'Observed GP',
      'Capability QA',
      'Story Review',
      'Story Age',
    ]);
    expect(tiles.find(tile => tile.label === 'Action Risks')).toEqual({
      label: 'Action Risks',
      value: '1',
      tone: 'fail',
      detail: 'res:hans latest action outcome is failed, timed out, or cancelled.',
    });
  });

  test('warns when online residents are missing model or SPARK identity signals', () => {
    const summary = buildReleaseReadiness({
      residents: [
        resident({ name: 'res:model-missing', stack: { configuredModules: resident().stack!.configuredModules } }),
        resident({ name: 'res:spark-missing', stack: { model: { endpoint: 'openrouter/qwen' }, configuredModules: [] } }),
      ],
      storyDigests: [digest()],
      printInsights: printInsights(),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('watch');
    expect(summary.metrics.modelEndpointResidents).toBe(1);
    expect(summary.metrics.sparkModuleResidents).toBe(1);
    expect(summary.checks.find(check => check.id === 'identity')).toEqual({
      id: 'identity',
      label: 'Model+SPARK',
      tone: 'warn',
      value: '1/2 model · 1/2 SPARK',
      detail: '1 online resident missing model/endpoint · 1 online resident missing SPARK module.',
    });
    expect(summary.nextActions).toContain('Confirm model/endpoint and SPARK module identity for every online resident before demoing cognition coverage.');
    expect(releaseReadinessMetricTiles(summary).find(tile => tile.label === 'Model+SPARK')).toEqual({
      label: 'Model+SPARK',
      value: '1/2 model · 1/2 SPARK',
      tone: 'warn',
      detail: '1 online resident missing model/endpoint · 1 online resident missing SPARK module.',
    });
    expect(releaseReadinessActionQueue(summary)).toContainEqual({
      label: 'Confirm stack',
      tone: 'warn',
      detail: 'Confirm model/endpoint and SPARK module identity for every online resident before demoing cognition coverage.',
      target: 'Residents',
      path: '/residents',
    });
  });

  test('warns when Storyteller review backlog exists even if latest digest looks fresh', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [
        digest({
          runId: 'review-1',
          digestId: 'review-1',
          dispatch: {
            dispatchId: 'dispatch-review-1',
            generatedAt: '2026-05-30T09:05:00.000Z',
            modelProfile: 'default',
            needsReview: true,
            warningCount: 0,
            publicBullets: [],
            operatorWarnings: [],
            reviewReasons: [],
            eventRefCount: 1,
            eventRefsUsed: ['e1'],
          },
        }),
        digest({
          runId: 'review-2',
          digestId: 'review-2',
          dispatch: {
            dispatchId: 'dispatch-review-2',
            generatedAt: '2026-05-30T09:06:00.000Z',
            modelProfile: 'default',
            needsReview: false,
            warningCount: 1,
            publicBullets: [],
            operatorWarnings: ['private handle'],
            reviewReasons: ['redaction'],
            eventRefCount: 1,
            eventRefsUsed: ['e2'],
          },
        }),
        digest({
          runId: 'ready-1',
          digestId: 'ready-1',
          dispatch: {
            dispatchId: 'dispatch-ready-1',
            generatedAt: '2026-05-30T09:07:00.000Z',
            modelProfile: 'default',
            needsReview: false,
            warningCount: 0,
            publicBullets: [],
            operatorWarnings: [],
            reviewReasons: [],
            eventRefCount: 2,
            eventRefsUsed: ['e1', 'e2'],
          },
        }),
      ],
      printInsights: printInsights(),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('watch');
    expect(summary.checks.find(check => check.id === 'storyteller')).toEqual({
      id: 'storyteller',
      label: 'Storyteller',
      tone: 'warn',
      value: '2 pending review',
      detail: '2 Storyteller digest dispatches still need operator review.',
    });
    expect(summary.nextActions).toContain('Review and clear pending Storyteller dispatches before using public canon narration.');
    expect(summary.metrics.storytellerReviewBacklog).toBe(2);

    const tiles = releaseReadinessMetricTiles(summary);
    expect(tiles.find(tile => tile.label === 'Story Review')).toEqual({
      label: 'Story Review',
      value: '2',
      tone: 'warn',
      detail: '2 Storyteller digest dispatches still need operator review.',
    });
  });

  test('warns when latest normal-life audit shows recovery clear but no AP/GP recurrence', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [digest()],
      printInsights: printInsights(),
      benchmarkRuns: capabilityBenchmarks().map(run => run.task?.id === 'normal-life-audit'
        ? normalLifeBenchmark({
          runId: 'normal_life_audit_20260530T091000Z',
          metrics: {
            totalActionAttempts: 2677,
            successfulActionSubmissions: 2677,
            failedActionSubmissions: 0,
            cause_low_health_heal_wait: 0,
            timeline_city_ap_gp_exchange: 0,
            timeline_trade_completed: 0,
            timeline_stuck_detected: 592,
            timeline_stuck_recovered: 590,
            durationMs: 20 * 60 * 1000,
          },
        })
        : run),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('watch');
    expect(summary.checks.find(check => check.id === 'normal-life')).toEqual({
      id: 'normal-life',
      label: 'Normal-life Audit',
      tone: 'warn',
      value: 'watch',
      detail: 'latest audit: 2677/2677 actions, low-health waits 0, AP/GP exchanges 0, trade closures 0, stuck recovered 590/592.',
    });
    expect(summary.nextActions).toContain('Use the latest normal-life audit caveat when describing AP/GP recurrence and stuck recovery.');
    expect(releaseReadinessMetricTiles(summary).find(tile => tile.label === 'Normal-life')).toEqual({
      label: 'Normal-life',
      value: 'watch',
      tone: 'warn',
      detail: 'latest audit: 2677/2677 actions, low-health waits 0, AP/GP exchanges 0, trade closures 0, stuck recovered 590/592.',
    });
    expect(releaseReadinessDemoProofRail(summary).find(item => item.label === 'Normal-life')).toEqual({
      label: 'Normal-life',
      tone: 'warn',
      detail: 'latest audit: 2677/2677 actions, low-health waits 0, AP/GP exchanges 0, trade closures 0, stuck recovered 590/592.',
    });
  });

  test('adds a dedicated stuck-churn action when normal-life audit includes top offenders', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [digest()],
      printInsights: printInsights(),
      benchmarkRuns: capabilityBenchmarks().map(run => run.task?.id === 'normal-life-audit'
        ? normalLifeBenchmark({
          runId: 'normal_life_audit_20260531T111938Z',
          metrics: {
            totalActionAttempts: 6914,
            successfulActionSubmissions: 6914,
            failedActionSubmissions: 0,
            cause_low_health_heal_wait: 0,
            timeline_city_ap_gp_exchange: 0,
            timeline_trade_completed: 0,
            timeline_stuck_detected: 542,
            timeline_stuck_recovered: 435,
          },
          evidenceSummaries: [
            'normal-life audit: 23 active residents, 6914/6914 actions, low-health waits 0, AP/GP exchanges 0, stuck recovered 435/542',
            'top stuck churn: qa-trader 122 (61 detected/61 recovered), agent 119 (64 detected/55 recovered), qa-social 117 (62 detected/55 recovered)',
          ],
        })
        : run),
      nowMs: Date.parse('2026-05-31T11:22:00.000Z'),
    });

    expect(summary.nextActions).toContain('Inspect top stuck-churn residents (qa-trader, agent, qa-social) before the next normal-life recurrence claim.');
    expect(releaseReadinessActionQueue(summary)).toContainEqual({
      label: 'Inspect stuck churn',
      tone: 'warn',
      detail: 'Inspect top stuck-churn residents (qa-trader, agent, qa-social) before the next normal-life recurrence claim.',
      target: 'Residents',
      path: '/residents',
    });
  });

  test('surfaces controlled-only AP/GP recurrence as a dedicated normal-life watch item', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [digest()],
      printInsights: printInsights(),
      benchmarkRuns: capabilityBenchmarks().map(run => run.task?.id === 'normal-life-audit'
        ? normalLifeBenchmark({
          runId: 'normal_life_audit_20260531T090612Z',
          metrics: {
            totalActionAttempts: 1283,
            successfulActionSubmissions: 1283,
            failedActionSubmissions: 0,
            cause_low_health_heal_wait: 0,
            timeline_city_ap_gp_exchange: 1,
            timeline_trade_completed: 0,
            timeline_stuck_detected: 79,
            timeline_stuck_recovered: 76,
            recurrence_ap_gp_exchange_events: 1,
            recurrence_trade_completed: 0,
            economy_organic_self_initiated_ap_gp_exchange_events: 0,
            economy_controlled_ap_gp_exchange_events: 1,
            durationMs: 20 * 60 * 1000,
          },
        })
        : run),
      nowMs: Date.parse('2026-05-31T09:12:00.000Z'),
    });

    expect(summary.status).toBe('watch');
    expect(summary.checks.find(check => check.id === 'normal-life')).toEqual({
      id: 'normal-life',
      label: 'Normal-life Audit',
      tone: 'warn',
      value: 'controlled only',
      detail: 'latest audit: 1283/1283 actions, low-health waits 0, AP/GP exchanges 1, organic AP/GP 0, controlled AP/GP 1, trade closures 0, stuck recovered 76/79.',
    });
    expect(summary.nextActions).toContain('Capture organic AP/GP recurrence evidence before claiming ordinary self-initiation.');
    expect(releaseReadinessActionQueue(summary)).toContainEqual({
      label: 'Prove organic AP/GP',
      tone: 'warn',
      detail: 'Capture organic AP/GP recurrence evidence before claiming ordinary self-initiation.',
      target: 'Economy',
      path: '/economy',
    });
  });

  test('counts operator warnings and review reasons as Storyteller review backlog even with warningCount zero', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [
        digest({
          runId: 'review-operator-warnings',
          digestId: 'review-operator-warnings',
          dispatch: {
            dispatchId: 'dispatch-review-operator-warnings',
            generatedAt: '2026-05-30T09:06:00.000Z',
            modelProfile: 'default',
            needsReview: false,
            warningCount: 0,
            publicBullets: [],
            operatorWarnings: ['private handle still visible'],
            reviewReasons: [],
            eventRefCount: 1,
            eventRefsUsed: ['e1'],
          },
        }),
        digest({
          runId: 'review-review-reason',
          digestId: 'review-review-reason',
          dispatch: {
            dispatchId: 'dispatch-review-review-reason',
            generatedAt: '2026-05-30T09:07:00.000Z',
            modelProfile: 'default',
            needsReview: false,
            warningCount: 0,
            publicBullets: [],
            operatorWarnings: [],
            reviewReasons: ['grounding audit requested'],
            eventRefCount: 1,
            eventRefsUsed: ['e2'],
          },
        }),
      ],
      printInsights: printInsights(),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('watch');
    expect(summary.metrics.storytellerReviewBacklog).toBe(2);
    expect(summary.checks.find(check => check.id === 'storyteller')).toEqual({
      id: 'storyteller',
      label: 'Storyteller',
      tone: 'warn',
      value: '2 pending review',
      detail: '2 Storyteller digest dispatches still need operator review.',
    });
  });

  test('points no-digest Storyteller readiness at the deterministic dry-run command', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [],
      printInsights: printInsights(),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.checks.find(check => check.id === 'storyteller')).toEqual({
      id: 'storyteller',
      label: 'Storyteller',
      tone: 'warn',
      value: 'no digest',
      detail: 'No Storyteller digest is available for operator or public narrative context.',
    });
    expect(summary.nextActions).toContain('Run `npm run storyteller:dry-run -- --fixture` and open the Storyteller feed before using public canon narration.');
    expect(releaseReadinessActionQueue(summary)).toContainEqual({
      label: 'Run dry-run',
      tone: 'warn',
      detail: 'Run `npm run storyteller:dry-run -- --fixture` and open the Storyteller feed before using public canon narration.',
      target: 'Story',
      path: '/story',
    });
    expect(releaseReadinessDemoProofRail(summary).find(item => item.label === 'Dry-run')).toEqual({
      label: 'Dry-run',
      tone: 'warn',
      detail: 'Run `npm run storyteller:dry-run -- --fixture` and open the Storyteller feed before using public canon narration.',
    });
  });

  test('keeps the dry-run demo proof rail on watch when only canon dispatches are loaded', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [digest()],
      printInsights: printInsights(),
      economyTransport: economyTransport(),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.checks.find(check => check.id === 'storyteller')).toMatchObject({
      tone: 'ok',
      value: '10m old',
    });
    expect(releaseReadinessDemoProofRail(summary).find(item => item.label === 'Dry-run')).toEqual({
      label: 'Dry-run',
      tone: 'warn',
      detail: 'No deterministic dry-run digest is loaded; run `npm run storyteller:dry-run -- --fixture` for fresh demo evidence.',
    });
  });

  test('prioritizes latest zero-top-event grounding warning over older review backlog', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [
        digest({
          runId: 'review-older',
          digestId: 'review-older',
          dispatch: {
            dispatchId: 'dispatch-review-older',
            generatedAt: '2026-05-30T09:03:00.000Z',
            modelProfile: 'default',
            needsReview: true,
            warningCount: 0,
            publicBullets: [],
            operatorWarnings: [],
            reviewReasons: [],
            eventRefCount: 1,
            eventRefsUsed: ['e1'],
          },
        }),
        digest({
          runId: 'latest-empty',
          digestId: 'latest-empty',
          builtAt: '2026-05-30T09:08:00.000Z',
          topEventCount: 0,
          residentCount: 0,
          topEvents: [],
          dispatch: {
            dispatchId: 'dispatch-latest-empty',
            generatedAt: '2026-05-30T09:08:00.000Z',
            modelProfile: 'default',
            needsReview: false,
            warningCount: 0,
            publicBullets: [],
            operatorWarnings: [],
            reviewReasons: [],
            eventRefCount: 0,
            eventRefsUsed: [],
          },
        }),
      ],
      printInsights: printInsights(),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.checks.find(check => check.id === 'storyteller')).toEqual({
      id: 'storyteller',
      label: 'Storyteller',
      tone: 'warn',
      value: 'no top events',
      detail: 'Latest Storyteller dispatch has no grounded top events selected.',
    });
    expect(summary.nextActions).toContain('Run Storyteller with grounded event evidence before using public canon narration.');
    expect(releaseReadinessActionQueue(summary)).toContainEqual({
      label: 'Ground Story',
      tone: 'warn',
      detail: 'Run Storyteller with grounded event evidence before using public canon narration.',
      target: 'Story',
      path: '/story',
    });
  });

  test('warns when the latest Storyteller dispatch cites refs missing from top events', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [digest({
        topEvents: [{
          ref: 'e1',
          kind: 'city_attention_credit',
          residentName: 'res:hans',
          ts: '2026-05-30T09:00:00.000Z',
          note: 'AP grant',
          importance: 'high',
          evidenceLabels: ['ap=50'],
        }],
        dispatch: {
          dispatchId: 'dispatch-missing-ref',
          generatedAt: '2026-05-30T09:05:00.000Z',
          modelProfile: 'default',
          needsReview: false,
          warningCount: 0,
          publicBullets: [],
          operatorWarnings: [],
          reviewReasons: [],
          eventRefCount: 2,
          eventRefsUsed: ['e1', 'ghost-ref'],
        },
      })],
      printInsights: printInsights(),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('watch');
    expect(summary.checks.find(check => check.id === 'storyteller')).toEqual({
      id: 'storyteller',
      label: 'Storyteller',
      tone: 'warn',
      value: '1 missing ref',
      detail: 'Latest Storyteller dispatch cites refs missing from digest top events: ghost-ref.',
    });
    expect(summary.nextActions).toContain('Review Storyteller grounding audit before using public canon narration.');
    expect(releaseReadinessActionQueue(summary)).toContainEqual({
      label: 'Review grounding',
      tone: 'warn',
      detail: 'Review Storyteller grounding audit before using public canon narration.',
      target: 'Story',
      path: '/story',
    });
  });

  test('warns when the latest Storyteller dispatch has no grounded top events', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [digest({
        topEventCount: 0,
        residentCount: 0,
        topEvents: [],
        dispatch: {
          dispatchId: 'dispatch-empty',
          generatedAt: '2026-05-30T09:05:00.000Z',
          modelProfile: 'default',
          needsReview: false,
          warningCount: 0,
          publicBullets: [],
          operatorWarnings: [],
          reviewReasons: [],
          eventRefCount: 0,
          eventRefsUsed: [],
        },
      })],
      printInsights: printInsights(),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('watch');
    expect(summary.checks.find(check => check.id === 'storyteller')).toEqual({
      id: 'storyteller',
      label: 'Storyteller',
      tone: 'warn',
      value: 'no top events',
      detail: 'Latest Storyteller dispatch has no grounded top events selected.',
    });
    expect(summary.nextActions).toContain('Run Storyteller with grounded event evidence before using public canon narration.');
  });

  test('mentions overflow when more than three residents have failed latest actions', () => {
    const failedResident = (name: string): ResidentDashboardRow => resident({
      name,
      body: {
        controlHeld: true,
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 42 }] } },
        lastAction: { kind: 'attack', result: 'failed', source: 'body', tick: 500 },
      },
      feed: {
        attached: true,
        tick: 500,
        ageMs: 4_000,
        nearby: { players: 0, npcs: 1, objects: 4, worldItems: 1 },
        events: 3,
        availableActions: 7,
      },
    });
    const summary = buildReleaseReadiness({
      residents: ['res:a', 'res:b', 'res:c', 'res:d'].map(failedResident),
      storyDigests: [digest()],
      printInsights: printInsights(),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.checks.find(check => check.id === 'loop')).toEqual({
      id: 'loop',
      label: 'Resident Loop',
      tone: 'fail',
      value: '4 failed actions',
      detail: 'Latest action outcomes are failed, timed out, or cancelled for res:a, res:b, res:c, and 1 more resident.',
    });
    expect(summary.blockers).toContain('Latest action outcomes are failed, timed out, or cancelled for res:a, res:b, res:c, and 1 more resident.');
  });

  test('warns when core capability proof groups are missing or stale', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [digest()],
      printInsights: printInsights(),
      benchmarkRuns: [
        benchmark({ task: { id: 'ap-gp-exchange-5m', version: '1' }, endedAt: '2026-05-27T00:00:00.000Z' }),
        benchmark({ task: { id: 'combat-prayer-10m', version: '1' }, endedAt: '2026-05-30T09:00:00.000Z' }),
      ],
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(summary.status).toBe('watch');
    expect(summary.metrics.capabilityProofs).toBe(1);
    expect(summary.metrics.capabilityMissing).toBe(4);
    expect(summary.checks.find(check => check.id === 'capabilities')).toMatchObject({
      tone: 'warn',
      value: '1/5 fresh',
    });
    expect(summary.nextActions).toContain('Run missing or stale capability benchmarks before relying on unproven resident loops.');
  });

  test('keeps the AP/GP demo proof rail on watch when the AP/GP capability proof is missing', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [digest()],
      printInsights: printInsights(),
      economyTransport: economyTransport(),
      benchmarkRuns: capabilityBenchmarks().filter(run => run.task?.id !== 'ap-gp-exchange-5m'),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(releaseReadinessDemoProofRail(summary).find(item => item.label === 'AP/GP')).toEqual({
      label: 'AP/GP',
      tone: 'warn',
      detail: 'AP/GP capability proof is missing; run an AP/GP or coin-995 capability proof before claiming resident purchasing power.',
    });
  });

  test('builds a compact first-five-minutes operator step rail from readiness state', () => {
    const summary = buildReleaseReadiness({
      residents: [],
      storyDigests: [],
      printInsights: printInsights({ activeRequests: 0, inQueue: 0, ncriTrades: { pending: 0, accepted: 0, failed: 0, recent: [] } }),
      benchmarkRuns: [],
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(releaseReadinessFirstFiveSteps(summary)).toEqual([
      {
        label: 'Stabilize',
        tone: 'fail',
        detail: 'No residents are visible in the dashboard snapshot.',
      },
      {
        label: 'Act',
        tone: 'fail',
        detail: 'Start or reconnect the controller before demoing the resident loop.',
      },
      {
        label: 'Capture',
        tone: 'warn',
        detail: 'After the blocker clears, capture resident roster, AP/GP proof, Storyteller review, and dry-run digest evidence before the public demo.',
      },
    ]);
  });

  test('names concrete demo evidence surfaces when the city is ready', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [digest()],
      printInsights: printInsights(),
      economyTransport: economyTransport(),
      benchmarkRuns: capabilityBenchmarks(),
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(releaseReadinessFirstFiveSteps(summary)[2]).toEqual({
      label: 'Capture',
      tone: 'ok',
      detail: 'Capture resident roster, AP/GP proof, Storyteller review, and dry-run digest evidence before the public demo.',
    });
  });

  test('keeps several readiness next actions visible with compact operator labels', () => {
    const summary = buildReleaseReadiness({
      residents: [
        resident({
          attention: 4,
          body: { controlHeld: true, latestPerception: { resident: { inventory: [] } } },
        }),
      ],
      storyDigests: [],
      printInsights: printInsights({ activeRequests: 0, inQueue: 0, ncriTrades: { pending: 0, accepted: 0, failed: 0, recent: [] } }),
      benchmarkRuns: [],
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(releaseReadinessActionQueue(summary)).toEqual([
      {
        label: 'Check prints',
        tone: 'warn',
        detail: 'Assign blocked print queue entries or avoid the print queue during the demo.',
        target: 'Prints',
        path: '/prints',
      },
      {
        label: 'Run audit',
        tone: 'warn',
        detail: 'Run or sync a CQA10 normal-life audit before claiming resident recurrence.',
        target: 'Operator Readiness',
        path: '/',
      },
      {
        label: 'Top up AP',
        tone: 'warn',
        detail: 'Top up low-AP residents or avoid presenting them as healthy.',
        target: 'Residents',
        path: '/residents',
      },
      {
        label: 'Prove GP',
        tone: 'warn',
        detail: 'Run an AP/GP or coin-995 capability proof before claiming resident purchasing power.',
        target: 'Economy',
        path: '/economy',
      },
    ]);
  });

  test('keeps live transport and print actions visible when the readiness queue is crowded', () => {
    const summary = buildReleaseReadiness({
      residents: [
        resident({
          attention: 4,
          body: { controlHeld: true, latestPerception: { resident: { inventory: [] } } },
        }),
      ],
      storyDigests: [],
      printInsights: printInsights({ activeRequests: 0, inQueue: 0, ncriTrades: { pending: 0, accepted: 0, failed: 0, recent: [] } }),
      economyTransport: economyTransport({
        tone: 'warn',
        label: 'polling',
        detail: 'Economy stream is unavailable; polling live and heartbeat routes.',
      }),
      benchmarkRuns: [],
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(releaseReadinessActionQueue(summary)).toEqual([
      {
        label: 'Check economy',
        tone: 'warn',
        detail: 'Restore the economy stream or confirm polling fallback before relying on live AP/GP state.',
        target: 'Economy',
        path: '/economy',
      },
      {
        label: 'Check prints',
        tone: 'warn',
        detail: 'Assign blocked print queue entries or avoid the print queue during the demo.',
        target: 'Prints',
        path: '/prints',
      },
      {
        label: 'Run audit',
        tone: 'warn',
        detail: 'Run or sync a CQA10 normal-life audit before claiming resident recurrence.',
        target: 'Operator Readiness',
        path: '/',
      },
      {
        label: 'Top up AP',
        tone: 'warn',
        detail: 'Top up low-AP residents or avoid presenting them as healthy.',
        target: 'Residents',
        path: '/residents',
      },
    ]);
  });

  test('keeps bridge configuration visible when the readiness queue is crowded', () => {
    const summary = buildReleaseReadiness({
      residents: [
        resident({
          attention: 4,
          body: { controlHeld: true, latestPerception: { resident: { inventory: [] } } },
        }),
      ],
      storyDigests: [],
      printInsights: printInsights({ activeRequests: 0, inQueue: 0, ncriTrades: { pending: 0, accepted: 0, failed: 0, recent: [] } }),
      economyTransport: economyTransport({
        tone: 'warn',
        label: 'bridge',
        detail: 'Set NULLCITY_CITY_API_URL and NULLCITY_CITY_API_TOKEN before stream or polling transport can load.',
      }),
      benchmarkRuns: [],
      nowMs: Date.parse('2026-05-30T09:10:00.000Z'),
    });

    expect(releaseReadinessActionQueue(summary)).toEqual([
      {
        label: 'Configure bridge',
        tone: 'warn',
        detail: 'Configure the live economy bridge before claiming AP/GP state is current.',
        target: 'Economy',
        path: '/economy',
      },
      {
        label: 'Check prints',
        tone: 'warn',
        detail: 'Assign blocked print queue entries or avoid the print queue during the demo.',
        target: 'Prints',
        path: '/prints',
      },
      {
        label: 'Run audit',
        tone: 'warn',
        detail: 'Run or sync a CQA10 normal-life audit before claiming resident recurrence.',
        target: 'Operator Readiness',
        path: '/',
      },
      {
        label: 'Top up AP',
        tone: 'warn',
        detail: 'Top up low-AP residents or avoid presenting them as healthy.',
        target: 'Residents',
        path: '/residents',
      },
    ]);
  });
});
