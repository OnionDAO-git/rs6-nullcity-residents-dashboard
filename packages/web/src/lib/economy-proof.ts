import type { BenchmarkArtifactSummary } from '@nullcity-dashboard/shared';

const PROOF_STALE_MS = 48 * 60 * 60 * 1000;
const RUN_ID_PREFIX_LENGTH = 7;
const RUN_ID_TAIL_LENGTH = 8;
const MAX_RUN_ID_LABEL_LENGTH = RUN_ID_PREFIX_LENGTH + RUN_ID_TAIL_LENGTH + 3;

export type EconomyProofTone = 'ok' | 'warn' | 'fail';

export interface EconomyProofCheck {
  id: 'ap-topup-resume' | 'ap-gp-hierarchy' | 'ap-for-gp-exchange';
  label: string;
  tone: EconomyProofTone;
  summary: string;
  detail: string;
}

export interface EconomyProofSummary {
  headline: string;
  checks: EconomyProofCheck[];
  ready: number;
  total: number;
}

export function buildEconomyProofSummary(
  runs: BenchmarkArtifactSummary[],
  nowMs = Date.now(),
): EconomyProofSummary {
  const checks: EconomyProofCheck[] = [
    topupResumeProof(runs, nowMs),
    hierarchyProof(runs, nowMs),
    exchangeProof(runs, nowMs),
  ];
  const ready = checks.filter(check => check.tone === 'ok').length;
  return {
    headline: ready === checks.length
      ? 'Core AP/GP loop proofs are fresh.'
      : `${ready.toLocaleString()}/${checks.length.toLocaleString()} AP/GP loop proofs are fresh.`,
    checks,
    ready,
    total: checks.length,
  };
}

function topupResumeProof(runs: BenchmarkArtifactSummary[], nowMs: number): EconomyProofCheck {
  const run = latestRun(runs, /(ap[-_]topup[-_]resume[-_]5m|ap[-_]top[-_]up[-_]resume)/i);
  return runCheck({
    id: 'ap-topup-resume',
    label: 'AP top-up/resume',
    missing: 'No AP top-up/resume proof run found yet.',
    run,
    nowMs,
  });
}

function exchangeProof(runs: BenchmarkArtifactSummary[], nowMs: number): EconomyProofCheck {
  const run = latestRun(runs, /ap[-_]gp[-_]exchange[-_]5m/i);
  return runCheck({
    id: 'ap-for-gp-exchange',
    label: 'AP-for-GP exchange',
    missing: 'No AP-for-GP exchange proof run found yet.',
    run,
    nowMs,
  });
}

function hierarchyProof(runs: BenchmarkArtifactSummary[], nowMs: number): EconomyProofCheck {
  const strategy = latestRun(runs, /ap[-_]gp[-_]library[-_]strategy[-_]5m/i);
  const honesty = latestRun(runs, /ap[-_]gp[-_]honesty[-_]5m/i);
  const strategyCheck = classifyRun(strategy, nowMs);
  const honestyCheck = classifyRun(honesty, nowMs);

  if (strategyCheck.tone === 'ok' && honestyCheck.tone === 'ok') {
    return {
      id: 'ap-gp-hierarchy',
      label: 'AP/GP hierarchy',
      tone: 'ok',
      summary: 'Hierarchy + no-GP honesty proofs are fresh.',
      detail: `${runLabel(strategy)}; ${runLabel(honesty)}.`,
    };
  }

  if (strategyCheck.tone === 'fail' || honestyCheck.tone === 'fail') {
    const reasons = [
      strategyCheck.tone === 'fail' ? `strategy: ${strategyCheck.detail}` : '',
      honestyCheck.tone === 'fail' ? `honesty: ${honestyCheck.detail}` : '',
    ].filter(Boolean).join(' ');
    return {
      id: 'ap-gp-hierarchy',
      label: 'AP/GP hierarchy',
      tone: 'fail',
      summary: 'Hierarchy proof has a failing benchmark.',
      detail: reasons,
    };
  }

  const missing = [
    !strategy ? 'strategy proof missing' : '',
    !honesty ? 'honesty proof missing' : '',
  ].filter(Boolean).join(', ');
  const stale = [
    strategy && strategyCheck.tone === 'warn' ? `strategy stale: ${runLabel(strategy)}` : '',
    honesty && honestyCheck.tone === 'warn' ? `honesty stale: ${runLabel(honesty)}` : '',
  ].filter(Boolean).join('; ');

  return {
    id: 'ap-gp-hierarchy',
    label: 'AP/GP hierarchy',
    tone: 'warn',
    summary: 'Hierarchy proofs are partial or stale.',
    detail: [missing, stale].filter(Boolean).join(' · ') || 'Need fresh strategy and honesty proofs.',
  };
}

function runCheck(input: {
  id: EconomyProofCheck['id'];
  label: string;
  missing: string;
  run: BenchmarkArtifactSummary | undefined;
  nowMs: number;
}): EconomyProofCheck {
  const status = classifyRun(input.run, input.nowMs);
  if (!input.run) {
    return {
      id: input.id,
      label: input.label,
      tone: 'warn',
      summary: input.missing,
      detail: 'Run the related controller benchmark and refresh this dashboard view.',
    };
  }

  if (status.tone === 'ok') {
    return {
      id: input.id,
      label: input.label,
      tone: 'ok',
      summary: `${input.label} proof is fresh.`,
      detail: runLabel(input.run),
    };
  }

  if (status.tone === 'warn') {
    return {
      id: input.id,
      label: input.label,
      tone: 'warn',
      summary: `${input.label} proof is stale.`,
      detail: runLabel(input.run),
    };
  }

  return {
    id: input.id,
    label: input.label,
    tone: 'fail',
    summary: `${input.label} proof failed.`,
    detail: status.detail,
  };
}

function classifyRun(
  run: BenchmarkArtifactSummary | undefined,
  nowMs: number,
): { tone: EconomyProofTone; detail: string } {
  if (!run) return { tone: 'warn', detail: 'missing benchmark run' };
  const pass = run.status === 'passed' && run.score >= 0.95;
  if (!pass) {
    return {
      tone: 'fail',
      detail: `${runLabel(run)}${run.failureReason ? ` (${run.failureReason})` : ''}`,
    };
  }
  const ageMs = nowMs - benchmarkTimestamp(run);
  if (ageMs > PROOF_STALE_MS) {
    return { tone: 'warn', detail: `stale (${runLabel(run)})` };
  }
  return { tone: 'ok', detail: runLabel(run) };
}

function latestRun(runs: BenchmarkArtifactSummary[], pattern: RegExp): BenchmarkArtifactSummary | undefined {
  let best: BenchmarkArtifactSummary | undefined;
  for (const run of runs) {
    if (!pattern.test(runSearchText(run))) continue;
    if (!best || benchmarkTimestamp(run) > benchmarkTimestamp(best)) best = run;
  }
  return best;
}

function runSearchText(run: BenchmarkArtifactSummary): string {
  return [run.task?.id, run.runId, run.file].filter(Boolean).join(' ');
}

function runLabel(run: BenchmarkArtifactSummary | undefined): string {
  if (!run) return 'missing run';
  return `${run.task?.id || 'unknown-task'} (${shortRunId(run.runId)})`;
}

function shortRunId(runId: string): string {
  if (runId.length <= MAX_RUN_ID_LABEL_LENGTH) return runId;
  return `${runId.slice(0, RUN_ID_PREFIX_LENGTH)}...${runId.slice(-RUN_ID_TAIL_LENGTH)}`;
}

function benchmarkTimestamp(run: BenchmarkArtifactSummary): number {
  const stamp = run.endedAt || run.startedAt || run.generatedAt;
  if (!stamp) return 0;
  const ts = Date.parse(stamp);
  return Number.isFinite(ts) ? ts : 0;
}
