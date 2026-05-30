import type { EconomyEvent } from './api';

export interface NcriEventSummary {
  eventCount: number;
  saleCount: number;
  redemptionCount: number;
  netApDelta: number;
  netGpDelta: number;
  recentNcriIds: string[];
}

export function summarizeNcriEvents(events: EconomyEvent[]): NcriEventSummary | undefined {
  const ncriEvents = events
    .filter(event => isNcriEvent(event))
    .slice()
    .sort((a, b) => timeMs(b.ts) - timeMs(a.ts));
  if (!ncriEvents.length) return undefined;

  const recentNcriIds: string[] = [];
  const seen = new Set<string>();
  let saleCount = 0;
  let redemptionCount = 0;
  let netApDelta = 0;
  let netGpDelta = 0;

  for (const event of ncriEvents) {
    if (event.kind === 'ncri_sale') saleCount += 1;
    if (event.kind === 'ncri_redemption') redemptionCount += 1;
    if (typeof event.apDelta === 'number' && Number.isFinite(event.apDelta)) netApDelta += event.apDelta;
    if (typeof event.gpDelta === 'number' && Number.isFinite(event.gpDelta)) netGpDelta += event.gpDelta;

    const ncriId = event.ncriId?.trim();
    if (ncriId && !seen.has(ncriId)) {
      seen.add(ncriId);
      recentNcriIds.push(ncriId);
    }
  }

  return {
    eventCount: ncriEvents.length,
    saleCount,
    redemptionCount,
    netApDelta,
    netGpDelta,
    recentNcriIds,
  };
}

function timeMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function isNcriEvent(event: EconomyEvent): boolean {
  return Boolean(event.ncriId) || event.kind === 'ncri_sale' || event.kind === 'ncri_redemption';
}
