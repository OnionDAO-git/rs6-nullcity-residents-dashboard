import { describe, expect, test } from 'bun:test';
import type { BenchmarkArtifactSummary, ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { StorytellerDigestSummary } from './api';
import type { PrintQueueInsightSummary } from './print-queue-insights';
import { buildReleaseReadiness } from './release-readiness';

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
    storyArc: { phase: 'progress', summary: 'Working toward the city loop.' },
    ...overrides,
  };
}

function digest(overrides: Partial<StorytellerDigestSummary> = {}): StorytellerDigestSummary {
  return {
    runId: 'run-1',
    digestId: 'digest-1',
    builtAt: '2026-05-30T09:00:00.000Z',
    topEventCount: 2,
    residentCount: 1,
    topEvents: [],
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

function capabilityBenchmarks(): BenchmarkArtifactSummary[] {
  return [
    benchmark({ runId: 'bench_apgp', task: { id: 'ap-gp-exchange-5m', version: '1' } }),
    benchmark({ runId: 'named_trade_soak_20260530125718', task: { id: 'named-trade-soak', version: '1' } }),
    benchmark({ runId: 'bench_combat', task: { id: 'combat-prayer-10m', version: '1' } }),
    benchmark({ runId: 'named_equip_soak_20260530120900', task: { id: 'named-equip-soak', version: '1' } }),
    benchmark({ runId: 'bench_memory', task: { id: 'memory-route-recall-5m', version: '1' } }),
  ];
}

describe('buildReleaseReadiness', () => {
  test('marks the city ready when residents, plans, GP, Storyteller, and NCRI/print signals are present', () => {
    const summary = buildReleaseReadiness({
      residents: [resident()],
      storyDigests: [digest()],
      printInsights: printInsights(),
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
      observedGp: 42,
      latestStorytellerAgeMinutes: 10,
      capabilityProofs: 5,
      capabilityMissing: 0,
    });
    expect(summary.checks.map(check => [check.id, check.tone])).toEqual([
      ['residents', 'ok'],
      ['plans', 'ok'],
      ['ap', 'ok'],
      ['gp', 'ok'],
      ['capabilities', 'ok'],
      ['storyteller', 'ok'],
      ['ncri-print', 'ok'],
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
});
