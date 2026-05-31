import type { ResidentEconomy } from './api';
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

function gpEventDetail(kind: string, note: string | undefined, gpDelta: number | undefined): string {
  return `${kind}: ${note || economyEventDelta(gpDelta) || 'GP event recorded'}`;
}

function economyMomentRelevant(event: NullCityLiveEconomyEvent): boolean {
  if (event.kind === 'ap_gp_exchange') return true;
  if (AP_SUPPORT_KINDS.has(event.kind) && (event.apDelta ?? 0) > 0) return true;
  return GP_EVIDENCE_KINDS.has(event.kind) || (event.gpDelta ?? 0) !== 0;
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
  return [
    event.apDelta === undefined ? '' : `${signed(event.apDelta)} AP`,
    event.gpDelta === undefined ? '' : `${signed(event.gpDelta)} GP`,
    event.note || event.refId || event.kind,
  ].filter(Boolean).join(' · ');
}

function economyEventDelta(gpDelta: number | undefined): string {
  if (gpDelta === undefined) return '';
  return `${signed(gpDelta)} GP`;
}

function signed(value: number): string {
  return value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString();
}

function residentEconomyKey(name: string): string {
  const normalized = name.trim().toLowerCase();
  return normalized.startsWith('res:') ? normalized.slice(4) : normalized;
}
