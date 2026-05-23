import type { BenchmarkEvidence } from '@nullcity-dashboard/shared';

export interface BenchmarkActionRow {
  key: string;
  actionLabel: string;
  statusLabel: string;
  effectLabel: string;
  detail: string;
  ok: boolean | undefined;
}

export function benchmarkActionRows(evidence: BenchmarkEvidence | undefined): BenchmarkActionRow[] {
  const attempts = Array.isArray(evidence?.actionAttempts) ? evidence.actionAttempts : [];
  return attempts.map((attempt, index) => {
    const record = asRecord(attempt);
    const requestId = stringField(record, 'requestId');
    const actionKind = stringField(record, 'actionKind') || 'action';
    const finalStatus = stringField(record, 'finalStatus');
    const ok = typeof record.ok === 'boolean' ? record.ok : undefined;
    const evidenceCount = numberField(record, 'evidenceCount');
    const effectEvidenceCount = numberField(record, 'effectEvidenceCount');
    const module = moduleLabel(asRecord(record.sparkModule));
    const detail = [
      stringField(record, 'source'),
      stringField(record, 'cause'),
      module,
      evidenceCount !== undefined ? `${evidenceCount} evidence` : '',
      stringField(record, 'finalReason'),
    ].filter(Boolean);

    return {
      key: requestId || `${actionKind}-${index}`,
      actionLabel: actionKind.replaceAll('_', ' '),
      statusLabel: finalStatus || okLabel(ok),
      effectLabel: effectLabel(effectEvidenceCount),
      detail: detail.join(' | ') || '-',
      ok,
    };
  });
}

function effectLabel(count: number | undefined): string {
  if (!count) {
    return 'no effects';
  }
  return `${count} effect${count === 1 ? '' : 's'}`;
}

function okLabel(ok: boolean | undefined): string {
  if (ok === true) {
    return 'accepted';
  }
  if (ok === false) {
    return 'rejected';
  }
  return 'observed';
}

function moduleLabel(module: Record<string, unknown>): string {
  const id = stringField(module, 'id');
  if (!id) {
    return '';
  }
  const version = stringField(module, 'version');
  return version ? `${id}@${version}` : id;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
