import { describe, expect, test } from 'bun:test';
import type { BenchmarkArtifactSummary } from '@nullcity-dashboard/shared';
import { buildEconomyProofSummary, economyProofNextActions } from './economy-proof';

function run(overrides: Partial<BenchmarkArtifactSummary> = {}): BenchmarkArtifactSummary {
  return {
    file: 'bench.json',
    runId: 'bench',
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

describe('buildEconomyProofSummary', () => {
  test('marks all loop proofs ready when fresh benchmark evidence exists', () => {
    const summary = buildEconomyProofSummary([
      run({ runId: 'bench_topup', task: { id: 'ap-topup-resume-5m', version: '1' } }),
      run({ runId: 'bench_strategy', task: { id: 'ap-gp-library-strategy-5m', version: '1' } }),
      run({ runId: 'bench_honesty', task: { id: 'ap-gp-honesty-5m', version: '1' } }),
      run({ runId: 'bench_exchange', task: { id: 'ap-gp-exchange-5m', version: '1' } }),
    ], Date.parse('2026-05-30T12:00:00.000Z'));

    expect(summary.ready).toBe(3);
    expect(summary.total).toBe(3);
    expect(summary.headline).toContain('fresh');
    expect(summary.checks.map(check => check.tone)).toEqual(['ok', 'ok', 'ok']);
  });

  test('warns top-up and exchange checks when proof runs are missing', () => {
    const summary = buildEconomyProofSummary([
      run({ runId: 'bench_strategy', task: { id: 'ap-gp-library-strategy-5m', version: '1' } }),
      run({ runId: 'bench_honesty', task: { id: 'ap-gp-honesty-5m', version: '1' } }),
    ], Date.parse('2026-05-30T12:00:00.000Z'));

    expect(summary.checks.find(check => check.id === 'ap-topup-resume')).toMatchObject({ tone: 'warn' });
    expect(summary.checks.find(check => check.id === 'ap-gp-hierarchy')).toMatchObject({ tone: 'ok' });
    expect(summary.checks.find(check => check.id === 'ap-for-gp-exchange')).toMatchObject({ tone: 'warn' });
  });

  test('warns hierarchy when one sub-proof is missing', () => {
    const summary = buildEconomyProofSummary([
      run({ runId: 'bench_topup', task: { id: 'ap-topup-resume-5m', version: '1' } }),
      run({ runId: 'bench_strategy', task: { id: 'ap-gp-library-strategy-5m', version: '1' } }),
      run({ runId: 'bench_exchange', task: { id: 'ap-gp-exchange-5m', version: '1' } }),
    ], Date.parse('2026-05-30T12:00:00.000Z'));

    expect(summary.checks.find(check => check.id === 'ap-gp-hierarchy')).toMatchObject({
      tone: 'warn',
      summary: 'Hierarchy proofs are partial or stale.',
      detail: 'honesty proof missing',
    });
  });

  test('warns hierarchy when one of strategy/honesty proofs is stale', () => {
    const summary = buildEconomyProofSummary([
      run({ runId: 'bench_topup', task: { id: 'ap-topup-resume-5m', version: '1' }, endedAt: '2026-05-30T09:00:00.000Z' }),
      run({ runId: 'bench_strategy', task: { id: 'ap-gp-library-strategy-5m', version: '1' }, endedAt: '2026-05-30T09:00:00.000Z' }),
      run({ runId: 'bench_honesty', task: { id: 'ap-gp-honesty-5m', version: '1' }, endedAt: '2026-05-26T09:00:00.000Z' }),
      run({ runId: 'bench_exchange', task: { id: 'ap-gp-exchange-5m', version: '1' }, endedAt: '2026-05-30T09:00:00.000Z' }),
    ], Date.parse('2026-05-30T12:00:00.000Z'));

    expect(summary.checks.find(check => check.id === 'ap-gp-hierarchy')).toMatchObject({
      tone: 'warn',
      summary: 'Hierarchy proofs are partial or stale.',
    });
  });

  test('fails when a matching proof benchmark run failed', () => {
    const summary = buildEconomyProofSummary([
      run({ runId: 'bench_topup', task: { id: 'ap-topup-resume-5m', version: '1' } }),
      run({ runId: 'bench_strategy', task: { id: 'ap-gp-library-strategy-5m', version: '1' } }),
      run({ runId: 'bench_honesty', task: { id: 'ap-gp-honesty-5m', version: '1' }, status: 'failed', score: 0.2, failureReason: 'hallucinated exchange' }),
      run({ runId: 'bench_exchange', task: { id: 'ap-gp-exchange-5m', version: '1' }, status: 'failed', score: 0.1, failureReason: 'trade rejected' }),
    ], Date.parse('2026-05-30T12:00:00.000Z'));

    expect(summary.checks.find(check => check.id === 'ap-gp-hierarchy')).toMatchObject({ tone: 'fail' });
    expect(summary.checks.find(check => check.id === 'ap-for-gp-exchange')).toMatchObject({ tone: 'fail' });
  });

  test('keeps run labels concise for long run ids', () => {
    const longRunId = '2026-05-30T09-00-00.000Z_nullcity_controller_ap_gp_exchange_very_long_demo_run_identifier_abcdef1234567890';
    const summary = buildEconomyProofSummary([
      run({ runId: 'bench_topup', task: { id: 'ap-topup-resume-5m', version: '1' } }),
      run({ runId: 'bench_strategy', task: { id: 'ap-gp-library-strategy-5m', version: '1' } }),
      run({ runId: 'bench_honesty', task: { id: 'ap-gp-honesty-5m', version: '1' } }),
      run({ runId: longRunId, task: { id: 'ap-gp-exchange-5m', version: '1' } }),
    ], Date.parse('2026-05-30T12:00:00.000Z'));

    const exchange = summary.checks.find(check => check.id === 'ap-for-gp-exchange');
    expect(exchange?.detail).toBe('ap-gp-exchange-5m (2026-05...34567890)');
    expect(exchange?.detail).not.toContain(longRunId);
  });

  test('builds command-free operator next actions for missing AP/GP proofs', () => {
    const summary = buildEconomyProofSummary([
      run({ runId: 'bench_strategy', task: { id: 'ap-gp-library-strategy-5m', version: '1' } }),
      run({ runId: 'bench_honesty', task: { id: 'ap-gp-honesty-5m', version: '1' } }),
    ], Date.parse('2026-05-30T12:00:00.000Z'));

    const actions = economyProofNextActions(summary);
    expect(actions).toEqual([
      {
        label: 'Run top-up proof',
        tone: 'warn',
        detail: 'Run the AP top-up/resume capability proof from the controller benchmark suite.',
      },
      {
        label: 'Run exchange proof',
        tone: 'warn',
        detail: 'Run the AP-for-GP exchange capability proof from the controller benchmark suite.',
      },
    ]);
    expect(actions.map(action => action.detail).join(' ')).not.toContain('npm run');
  });
});
