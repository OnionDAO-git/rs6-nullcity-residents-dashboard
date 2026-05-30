import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { NullCityNcriRecord, ResidentTrade } from './city-api';

export type PrintResidentSignalSource = 'ncri_registry' | 'ncri_trade';

export interface PrintResidentSignal {
  residentId: string;
  resident?: ResidentDashboardRow;
  latestAt?: string;
  sources: PrintResidentSignalSource[];
}

type PrintResidentSignalBucket = {
  residentId: string;
  resident: ResidentDashboardRow | undefined;
  latestAt: string | undefined;
  latestAtMs: number;
  sources: Set<PrintResidentSignalSource>;
};

const SOURCE_ORDER: PrintResidentSignalSource[] = ['ncri_registry', 'ncri_trade'];

export function printResidentSignals(
  residents: ResidentDashboardRow[],
  ncriRecords: NullCityNcriRecord[],
  trades: ResidentTrade[],
  limit = 4,
): PrintResidentSignal[] {
  const residentsByKey = new Map<string, ResidentDashboardRow>();
  for (const resident of residents) {
    const key = normalizeResidentId(resident.name);
    if (!key) continue;
    residentsByKey.set(key, resident);
  }

  const buckets = new Map<string, PrintResidentSignalBucket>();

  for (const record of ncriRecords) {
    const owner = record.owner?.trim();
    if (!owner) continue;
    const ownerKey = normalizeResidentId(owner);
    if (!ownerKey) continue;
    const knownResident = residentsByKey.get(ownerKey);
    if (!knownResident && !owner.toLowerCase().startsWith('res:')) continue;
    upsertSignalBucket(buckets, ownerKey, knownResident, owner, record.updatedAt, 'ncri_registry');
  }

  for (const trade of trades) {
    if (!/\bncri\b/i.test(trade.requestedItem || '')) continue;
    const residentId = trade.residentId?.trim();
    if (!residentId) continue;
    const residentKey = normalizeResidentId(residentId);
    if (!residentKey) continue;
    upsertSignalBucket(buckets, residentKey, residentsByKey.get(residentKey), residentId, trade.updatedAt, 'ncri_trade');
  }

  return [...buckets.values()]
    .sort((a, b) => b.latestAtMs - a.latestAtMs || a.residentId.localeCompare(b.residentId))
    .slice(0, Math.max(0, limit))
    .map(({ residentId, resident, latestAt, sources }) => {
      const signal: PrintResidentSignal = {
        residentId,
        sources: SOURCE_ORDER.filter(source => sources.has(source)),
      };
      if (resident) signal.resident = resident;
      if (latestAt) signal.latestAt = latestAt;
      return signal;
    });
}

function upsertSignalBucket(
  buckets: Map<string, PrintResidentSignalBucket>,
  key: string,
  resident: ResidentDashboardRow | undefined,
  residentId: string,
  updatedAt: string | undefined,
  source: PrintResidentSignalSource,
): void {
  const timestamp = timestampMs(updatedAt);
  const existing = buckets.get(key);
  if (existing) {
    existing.sources.add(source);
    if (resident && !existing.resident) existing.resident = resident;
    if (timestamp >= existing.latestAtMs) {
      existing.latestAtMs = timestamp;
      if (updatedAt) existing.latestAt = updatedAt;
    }
    return;
  }

  buckets.set(key, {
    residentId,
    resident,
    latestAt: updatedAt,
    latestAtMs: timestamp,
    sources: new Set([source]),
  });
}

function timestampMs(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeResidentId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  const withoutPrefix = trimmed.startsWith('res:') ? trimmed.slice(4) : trimmed;
  return withoutPrefix.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
