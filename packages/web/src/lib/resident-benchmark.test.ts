import { describe, expect, test } from 'bun:test';
import type { BenchmarkArtifactSummary } from '@nullcity-dashboard/shared';
import { latestBenchmarkForResident, residentBenchmarkSignal } from './resident-benchmark';

function run(overrides: Partial<BenchmarkArtifactSummary> = {}): BenchmarkArtifactSummary {
  return {
    file: 'artifact.json',
    runId: 'bench_1',
    task: { id: 'starter-gp-pickup-3m', version: '1' },
    module: { id: 'onion.runescape.standard', version: '0.2.0' },
    mode: 'autonomous',
    resident: 'res:agent',
    status: 'passed',
    score: 1,
    metrics: {},
    startedAt: '2026-05-30T00:00:00.000Z',
    endedAt: '2026-05-30T00:05:00.000Z',
    ...overrides,
  };
}

describe('latestBenchmarkForResident', () => {
  test('selects most recent artifact for the requested resident', () => {
    const selected = latestBenchmarkForResident(
      [
        run({ runId: 'old', endedAt: '2026-05-29T00:00:00.000Z' }),
        run({ runId: 'new', endedAt: '2026-05-30T01:00:00.000Z' }),
        run({ runId: 'other', resident: 'res:hans', endedAt: '2026-05-30T02:00:00.000Z' }),
      ],
      'res:agent',
    );
    expect(selected?.runId).toBe('new');
  });
});

describe('residentBenchmarkSignal', () => {
  test('warns when no run exists', () => {
    const signal = residentBenchmarkSignal(undefined);
    expect(signal.tone).toBe('warn');
    expect(signal.summary).toContain('No resident benchmark artifact');
  });

  test('fails when latest run is non-passing', () => {
    const signal = residentBenchmarkSignal(run({ status: 'failed', score: 0.2, failureReason: 'timeout', runId: 'bench_fail' }));
    expect(signal.tone).toBe('fail');
    expect(signal.detail).toContain('timeout');
  });

  test('warns when run is stale', () => {
    const signal = residentBenchmarkSignal(
      run({ runId: 'bench_stale', endedAt: '2026-05-28T00:00:00.000Z' }),
      Date.parse('2026-05-30T12:00:00.000Z'),
    );
    expect(signal.tone).toBe('warn');
    expect(signal.summary).toContain('stale');
  });

  test('returns ok for fresh passing run', () => {
    const signal = residentBenchmarkSignal(
      run({ runId: 'bench_fresh', endedAt: '2026-05-30T11:00:00.000Z' }),
      Date.parse('2026-05-30T12:00:00.000Z'),
    );
    expect(signal.tone).toBe('ok');
    expect(signal.summary).toContain('passed');
  });
});
