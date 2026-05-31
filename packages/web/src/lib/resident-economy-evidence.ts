import type { EconomyEvent, ResidentEconomy } from './api';
import type { NullCityLiveEconomyBridgeResponse, NullCityLiveEconomyEvent, NullCityLiveEconomyResident } from './city-api';

export interface ResidentEconomyGpEvidence {
  tone: 'ok' | 'warn';
  summary: string;
  detail: string;
}

export interface ResidentEconomyMoment {
  tone: 'ok' | 'warn';
  label: string;
  title: string;
  detail: string;
}

export interface ResidentEconomyReceipt {
  id: string;
  source: 'live' | 'resident';
  kind: string;
  deltaLabel: string;
  refLabel: string;
  ts: string;
  note?: string;
}

export interface ResidentEconomyReceiptTrailOptions {
  economy?: ResidentEconomy | undefined;
  liveEconomy?: NullCityLiveEconomyBridgeResponse | undefined;
  residentName?: string | undefined;
  limit?: number;
}

const GP_EVIDENCE_KINDS = new Set(['gp_observed', 'gp_traded', 'ap_gp_exchange']);
const AP_SUPPORT_KINDS = new Set(['ap_topup', 'attention_grant', 'city_attention_credit', 'patron_gift']);

export function residentEconomyGpEvidence(economy: ResidentEconomy | undefined): ResidentEconomyGpEvidence | undefined {
  const event = economy?.recentEvents.find(item => GP_EVIDENCE_KINDS.has(item.kind) || (item.gpDelta ?? 0) !== 0);
  if (!event) return undefined;
  return {
    tone: 'ok',
    summary: 'Recent economy GP evidence is available.',
    detail: gpEventDetail(event.kind, event.note, event.gpDelta),
  };
}

export function residentLiveEconomyGpEvidence(
  response: NullCityLiveEconomyBridgeResponse | undefined,
  residentName: string,
): ResidentEconomyGpEvidence | undefined {
  const snapshot = response?.snapshot;
  if (!response?.available || !snapshot) return undefined;
  const target = residentEconomyKey(residentName);
  const event = snapshot.recentEvents.find(item => (
    item.residentName !== undefined &&
    residentEconomyKey(item.residentName) === target &&
    (GP_EVIDENCE_KINDS.has(item.kind) || (item.gpDelta ?? 0) !== 0)
  ));
  if (event) return liveEconomyEventEvidence(event);

  const resident = [...snapshot.residents, ...snapshot.topResidentsByAttention].find(item => (
    residentEconomyKey(item.residentName) === target &&
    item.gpNetDelta !== 0
  ));
  if (!resident) return undefined;
  return liveEconomyResidentEvidence(resident);
}

export function residentLiveEconomyMoment(
  response: NullCityLiveEconomyBridgeResponse | undefined,
  residentName: string,
): ResidentEconomyMoment | undefined {
  const snapshot = response?.snapshot;
  if (!response?.available || !snapshot) return undefined;
  const target = residentEconomyKey(residentName);
  const event = snapshot.recentEvents
    .filter(item => (
      item.residentName !== undefined &&
      residentEconomyKey(item.residentName) === target &&
      economyMomentRelevant(item)
    ))
    .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts))[0];
  if (!event) return undefined;
  return liveEconomyMoment(event);
}

export function residentEconomyReceiptTrail({
  economy,
  liveEconomy,
  residentName,
  limit = 4,
}: ResidentEconomyReceiptTrailOptions): ResidentEconomyReceipt[] {
  const target = residentName ? residentEconomyKey(residentName) : undefined;
  const receipts: ResidentEconomyReceipt[] = [];
  const snapshot = liveEconomy?.snapshot;
  if (liveEconomy?.available && snapshot && target) {
    for (const event of snapshot.recentEvents) {
      if (
        event.residentName !== undefined &&
        residentEconomyKey(event.residentName) === target &&
        economyReceiptRelevant(event)
      ) {
        receipts.push(economyReceipt(event, 'live'));
      }
    }
  }
  for (const event of economy?.recentEvents ?? []) {
    if (economyReceiptRelevant(event)) {
      receipts.push(economyReceipt(event, 'resident'));
    }
  }
  const byId = new Map<string, ResidentEconomyReceipt>();
  for (const receipt of receipts) {
    if (!byId.has(receipt.id)) byId.set(receipt.id, receipt);
  }
  return [...byId.values()]
    .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts))
    .slice(0, Math.max(0, limit));
}

function liveEconomyEventEvidence(event: NullCityLiveEconomyEvent): ResidentEconomyGpEvidence {
  return {
    tone: 'ok',
    summary: 'Recent economy GP evidence is available.',
    detail: gpEventDetail(event.kind, event.note, event.gpDelta),
  };
}

function liveEconomyResidentEvidence(resident: NullCityLiveEconomyResident): ResidentEconomyGpEvidence {
  return {
    tone: 'ok',
    summary: 'Recent economy GP evidence is available.',
    detail: `live_economy: GP net delta ${signed(resident.gpNetDelta)} across ${resident.eventCount.toLocaleString()} economy events`,
  };
}

function gpEventDetail(kind: string, note: string | undefined, gpDelta: number | null | undefined): string {
  return `${kind}: ${note || economyEventDelta(gpDelta) || 'GP event recorded'}`;
}

type EconomyReceiptEvent = Pick<EconomyEvent, 'id' | 'ts' | 'kind' | 'note'> & {
  apDelta?: number | null;
  gpDelta?: number | null;
  refId?: string;
};

function economyReceiptRelevant(event: EconomyReceiptEvent): boolean {
  if ((numberDelta(event.apDelta) ?? 0) !== 0 || (numberDelta(event.gpDelta) ?? 0) !== 0) return true;
  return economyMomentRelevant(event);
}

function economyReceipt(event: EconomyReceiptEvent, source: ResidentEconomyReceipt['source']): ResidentEconomyReceipt {
  return {
    id: event.id,
    source,
    kind: event.kind,
    deltaLabel: economyReceiptDeltaLabel(event),
    refLabel: event.refId || event.id,
    ts: event.ts,
    ...(event.note !== undefined ? { note: event.note } : {}),
  };
}

function economyReceiptDeltaLabel(event: EconomyReceiptEvent): string {
  const apDelta = numberDelta(event.apDelta);
  const gpDelta = numberDelta(event.gpDelta);
  return [
    apDelta === undefined ? '' : `AP ${signed(apDelta)}`,
    gpDelta === undefined ? '' : `GP ${signed(gpDelta)}`,
  ].filter(Boolean).join(' · ') || 'no AP/GP delta';
}

function economyMomentRelevant(event: EconomyReceiptEvent): boolean {
  if (event.kind === 'ap_gp_exchange') return true;
  if (AP_SUPPORT_KINDS.has(event.kind) && (numberDelta(event.apDelta) ?? 0) > 0) return true;
  return GP_EVIDENCE_KINDS.has(event.kind) || (numberDelta(event.gpDelta) ?? 0) !== 0;
}

function liveEconomyMoment(event: NullCityLiveEconomyEvent): ResidentEconomyMoment {
  if (event.kind === 'ap_gp_exchange') {
    return {
      tone: 'ok',
      label: 'AP/GP exchange',
      title: 'Converted real GP into AP.',
      detail: economyMomentDetail(event),
    };
  }
  if (AP_SUPPORT_KINDS.has(event.kind) && (event.apDelta ?? 0) > 0) {
    return {
      tone: 'ok',
      label: 'AP support',
      title: 'Recent AP support landed.',
      detail: economyMomentDetail(event),
    };
  }
  return {
    tone: 'ok',
    label: 'GP proof',
    title: 'Recent coin-995 GP proof.',
    detail: economyMomentDetail(event),
  };
}

function economyMomentDetail(event: NullCityLiveEconomyEvent): string {
  const apDelta = numberDelta(event.apDelta);
  const gpDelta = numberDelta(event.gpDelta);
  return [
    apDelta === undefined ? '' : `${signed(apDelta)} AP`,
    gpDelta === undefined ? '' : `${signed(gpDelta)} GP`,
    event.note || event.refId || event.kind,
  ].filter(Boolean).join(' · ');
}

function economyEventDelta(gpDelta: number | null | undefined): string {
  const delta = numberDelta(gpDelta);
  if (delta === undefined) return '';
  return `${signed(delta)} GP`;
}

function numberDelta(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function signed(value: number): string {
  return value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString();
}

function residentEconomyKey(name: string): string {
  const normalized = name.trim().toLowerCase();
  return normalized.startsWith('res:') ? normalized.slice(4) : normalized;
}
