import { describe, expect, test } from 'bun:test';
import type { BenchmarkArtifactSummary, ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { PrintResidentSignal } from './print-resident-signals';
import { printResidentProofSignal } from './print-resident-proof';

function resident(overrides: Partial<ResidentDashboardRow> = {}): ResidentDashboardRow {
  const base = {
    name: 'res:atlas',
    online: true,
    attention: 42,
    storyArc: {
      phase: 'rising',
      summary: 'trading NCRI for AP',
      latestEventKind: 'city_trade_completed',
      latestEventTick: 100,
      updatedAt: '2026-05-30T12:00:00.000Z',
    },
    thinking: {
      mode: 'executing',
      activePlan: 'trade NCRI for AP',
    },
    feed: {
      attached: true,
      ageMs: 8_000,
      availableActions: 4,
      events: [],
      nearby: { players: 1, npcs: 2, objects: 3, worldItems: 1 },
      latestEventKind: 'say',
      latestEventText: 'ready to trade',
    },
    body: {
      controlHolder: 'thinking',
      latestPerception: {
        resident: {
          inventory: [
            { itemId: 995, amount: 25 },
          ],
        },
      },
      recentEvents: [],
      recentActions: [],
      recentActionsBySource: {},
      actionResultHistogram: {},
      recentActionResults: [],
      eventKindHistogram: {},
      lastAction: {
        kind: 'trade_offer',
        source: 'thinking',
      },
      feed: {
        attached: true,
        ageMs: 8_000,
        availableActions: 4,
        events: [],
        nearby: { players: 1, npcs: 2, objects: 3, worldItems: 1 },
      },
    },
  };
  return { ...(base as unknown as ResidentDashboardRow), ...overrides };
}

function benchmark(overrides: Partial<BenchmarkArtifactSummary> = {}): BenchmarkArtifactSummary {
  return {
    file: 'artifact.json',
    runId: 'bench_good',
    task: { id: 'ap-gp-honesty-5m', version: '1' },
    module: { id: 'onion.runescape.standard', version: '0.2.0' },
    mode: 'autonomous',
    resident: 'res:atlas',
    status: 'passed',
    score: 1,
    metrics: {},
    endedAt: '2026-05-30T12:00:00.000Z',
    ...overrides,
  };
}

function signal(overrides: Partial<PrintResidentSignal> = {}): PrintResidentSignal {
  return {
    residentId: 'res:atlas',
    sources: ['ncri_registry'],
    latestAt: '2026-05-30T12:05:00.000Z',
    resident: resident(),
    ...overrides,
  };
}

describe('printResidentProofSignal', () => {
  test('warns when resident snapshot is missing', () => {
    const proof = printResidentProofSignal(
      {
        residentId: 'res:atlas',
        sources: ['ncri_registry'],
        latestAt: '2026-05-30T12:05:00.000Z',
      },
      [],
    );
    expect(proof.tone).toBe('warn');
    expect(proof.summary).toContain('snapshot missing');
  });

  test('returns benchmark success when resident signals are healthy', () => {
    const proof = printResidentProofSignal(
      signal(),
      [benchmark()],
      Date.parse('2026-05-30T12:10:00.000Z'),
    );

    expect(proof.tone).toBe('ok');
    expect(proof.summary).toContain('passed');
  });

  test('surfaces fail warning from resident/operator checks', () => {
    const proof = printResidentProofSignal(
      signal({
        resident: resident({ online: false }),
      }),
      [benchmark()],
      Date.parse('2026-05-30T12:10:00.000Z'),
    );

    expect(proof.tone).toBe('fail');
    expect(proof.summary).toContain('offline');
  });

  test('surfaces benchmark failure for resident with latest failed proof', () => {
    const proof = printResidentProofSignal(
      signal(),
      [benchmark({ runId: 'bench_bad', status: 'failed', score: 0.12, failureReason: 'unsafe loop' })],
      Date.parse('2026-05-30T12:10:00.000Z'),
    );

    expect(proof.tone).toBe('fail');
    expect(proof.summary).toContain('failed');
  });
});
