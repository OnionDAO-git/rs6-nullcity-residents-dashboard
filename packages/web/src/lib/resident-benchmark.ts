import type { BenchmarkArtifactSummary } from '@nullcity-dashboard/shared';

export interface ResidentBenchmarkSignal {
  tone: 'ok' | 'warn' | 'fail';
  summary: string;
  detail: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function latestBenchmarkForResident(
  runs: BenchmarkArtifactSummary[],
  residentName: string | undefined,
): BenchmarkArtifactSummary | undefined {
  const target = residentName?.trim().toLowerCase();
  if (!target) return undefined;
  const matches = runs.filter(run => run.resident.trim().toLowerCase() === target);
  if (!matches.length) return undefined;
  return [...matches].sort((a, b) => benchmarkTs(b) - benchmarkTs(a))[0];
}

export function residentBenchmarkSignal(
  run: BenchmarkArtifactSummary | undefined,
  nowMs = Date.now(),
): ResidentBenchmarkSignal {
  if (!run) {
    return {
      tone: 'warn',
      summary: 'No resident benchmark artifact found.',
      detail: 'Run a focused capability benchmark for this resident and capture proof.',
    };
  }
  const taskId = run.task?.id || 'unknown-task';
  const ageMs = Math.max(0, nowMs - benchmarkTs(run));
  const ageHours = Math.floor(ageMs / (60 * 60 * 1000));
  if (run.status !== 'passed') {
    return {
      tone: 'fail',
      summary: `Latest benchmark ${run.status} on ${taskId}.`,
      detail: run.failureReason || `Score ${run.score.toFixed(2)}. Review artifact ${run.runId}.`,
    };
  }
  if (run.score < 0.95) {
    return {
      tone: 'warn',
      summary: `Latest benchmark score is weak (${run.score.toFixed(2)}).`,
      detail: `Task ${taskId} passed but should be rerun for stronger confidence.`,
    };
  }
  if (ageMs > DAY_MS) {
    return {
      tone: 'warn',
      summary: `Latest benchmark is stale (${ageHours}h old).`,
      detail: `Last proof is ${run.runId} on ${taskId}; rerun to keep confidence current.`,
    };
  }
  return {
    tone: 'ok',
    summary: `Latest benchmark passed on ${taskId}.`,
    detail: `Run ${run.runId} score ${run.score.toFixed(2)}.`,
  };
}

function benchmarkTs(run: BenchmarkArtifactSummary): number {
  const stamp = run.endedAt || run.startedAt || run.generatedAt;
  const ts = stamp ? Date.parse(stamp) : 0;
  return Number.isFinite(ts) ? ts : 0;
}
