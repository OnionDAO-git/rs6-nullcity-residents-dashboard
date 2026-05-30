import type { ResidentEconomy } from './api';
import type { NullCityLiveEconomyBridgeResponse, NullCityLiveEconomyEvent, NullCityLiveEconomyResident } from './city-api';

export interface ResidentEconomyGpEvidence {
  tone: 'ok' | 'warn';
  summary: string;
  detail: string;
}

const GP_EVIDENCE_KINDS = new Set(['gp_observed', 'gp_traded', 'ap_gp_exchange']);

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
