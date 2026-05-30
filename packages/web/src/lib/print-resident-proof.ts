import type { BenchmarkArtifactSummary } from '@nullcity-dashboard/shared';
import { latestBenchmarkForResident, residentBenchmarkSignal } from './resident-benchmark';
import { residentOperatorWarnings } from './resident-loop';
import type { PrintResidentSignal } from './print-resident-signals';

export interface PrintResidentProofSignal {
  tone: 'ok' | 'warn' | 'fail';
  summary: string;
  detail: string;
}

export function printResidentProofSignal(
  signal: PrintResidentSignal,
  benchmarkRuns: BenchmarkArtifactSummary[],
  nowMs = Date.now(),
): PrintResidentProofSignal {
  if (!signal.resident) {
    return {
      tone: 'warn',
      summary: 'Resident snapshot missing for this NCRI/print participant.',
      detail: 'Reload residents or reconnect the dashboard feed before treating this as live proof.',
    };
  }

  const benchmark = residentBenchmarkSignal(
    latestBenchmarkForResident(benchmarkRuns, signal.resident.name),
    nowMs,
  );
  const warnings = residentOperatorWarnings(signal.resident, benchmark).filter(warning => warning.tone !== 'ok');
  const worstWarning = warnings.find(warning => warning.tone === 'fail') || warnings[0];

  if (worstWarning) {
    return {
      tone: worstWarning.tone,
      summary: worstWarning.summary,
      detail: `${worstWarning.detail} (${benchmark.summary})`,
    };
  }

  return benchmark;
}
