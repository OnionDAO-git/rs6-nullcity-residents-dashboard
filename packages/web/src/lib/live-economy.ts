import type {
  NullCityEconomyHeartbeatBridgeResponse,
  NullCityEconomyListingsBridgeResponse,
  NullCityLiveEconomyBridgeResponse,
  NullCityLiveEconomyEvent,
  NullCityLiveEconomyResident,
} from './city-api';

export interface LiveEconomySummary {
  tone: 'ok' | 'warn' | 'fail';
  headline: string;
  detail: string;
  eventLabel: string;
  proposalLabel: string;
  selfFundedLabel: string;
}

export interface EconomyHeartbeatSummary {
  tone: 'ok' | 'warn' | 'fail';
  headline: string;
  detail: string;
  degradedLabel: string;
}

export interface EconomyListingsSummary {
  tone: 'ok' | 'warn' | 'fail';
  headline: string;
  detail: string;
}

export type EconomyTransportStatus = 'polling' | 'connecting' | 'live' | 'fallback';

export interface EconomyTransportSummary {
  tone: 'ok' | 'warn' | 'fail';
  label: string;
  detail: string;
}

export interface EconomyEventDisplay {
  kindLabel: string;
  title: string;
  detail: string;
}

export interface EconomyResidentDisplay {
  tone: 'ok' | 'warn' | 'fail';
  title: string;
  detail: string;
  status: string;
}

export interface SelfFundedApResidentRow {
  residentName: string;
  apTotal: number;
  gpSpent: number;
  exchangeCount: number;
  latestAt: string;
  detail: string;
}

export function summarizeLiveEconomy(response: NullCityLiveEconomyBridgeResponse | undefined): LiveEconomySummary {
  if (!response?.available || !response.snapshot) {
    return {
      tone: 'warn',
      headline: 'Live economy bridge not configured',
      detail: 'Set NULLCITY_CITY_API_URL and NULLCITY_CITY_API_TOKEN for AP/GP totals.',
      eventLabel: 'no live events',
      proposalLabel: 'no live proposals',
      selfFundedLabel: 'no self-funded AP',
    };
  }

  const snapshot = response.snapshot;
  const selfFundedLabel = summarizeSelfFundedAp(snapshot.recentEvents);
  const apGpEvents = (snapshot.countsByKind.ap_topup || 0) +
    (snapshot.countsByKind.ap_grant || 0) +
    (snapshot.countsByKind.ap_decay || 0) +
    (snapshot.countsByKind.ap_gp_exchange || 0) +
    (snapshot.countsByKind.gp_traded || 0);
  const pendingFunding = snapshot.pendingProposals.filter(proposal => proposal.status === 'proposed' || proposal.status === 'funding').length;
  const tone: LiveEconomySummary['tone'] = snapshot.city.residentCount === 0 ? 'fail' : snapshot.recentEvents.length === 0 ? 'warn' : 'ok';

  return {
    tone,
    headline: `${snapshot.city.residentCount.toLocaleString()} residents carrying ${snapshot.city.attentionTotal.toLocaleString()} AP`,
    detail: `${economyWindowResidentLabel(snapshot.city.activeResidentCount, snapshot.window.windowMs)} · AP Δ ${signed(snapshot.city.attentionDelta)} · GP Δ ${signed(snapshot.city.gpNetDelta)}`,
    eventLabel: `${apGpEvents.toLocaleString()} AP/GP events`,
    proposalLabel: pendingFunding === 1 ? '1 Soul funding' : `${pendingFunding.toLocaleString()} Souls funding`,
    selfFundedLabel,
  };
}

export function summarizeEconomyHeartbeat(response: NullCityEconomyHeartbeatBridgeResponse | undefined): EconomyHeartbeatSummary {
  if (!response?.available || !response.heartbeat) {
    return {
      tone: 'warn',
      headline: 'Economy heartbeat unavailable',
      detail: 'Set NULLCITY_CITY_API_URL and NULLCITY_CITY_API_TOKEN to show controller liveness.',
      degradedLabel: 'bridge',
    };
  }

  const heartbeat = response.heartbeat;
  const tone: EconomyHeartbeatSummary['tone'] = heartbeat.degradedFlags.length > 0
    ? heartbeat.activeResidentCount > 0 ? 'warn' : 'fail'
    : 'ok';
  const lastKind = heartbeat.lastEconomyEventKind ? heartbeat.lastEconomyEventKind.replace(/_/g, ' ') : 'none';
  const lastEventFreshness = heartbeat.lastEconomyEventTs
    ? formatFreshness(heartbeat.lastEconomyEventTs, heartbeat.asOf)
    : 'unknown';
  const digestFreshness = heartbeat.lastDigestBuiltAt
    ? formatFreshness(heartbeat.lastDigestBuiltAt, heartbeat.asOf)
    : 'unknown';
  const lastEventLabel = lastEventFreshness === 'unknown'
    ? `last ${lastKind}`
    : `last ${lastKind} ${lastEventFreshness}`;
  return {
    tone,
    headline: `${heartbeat.activeResidentCount.toLocaleString()} / ${heartbeat.residentCount.toLocaleString()} residents active`,
    detail: `${heartbeat.economyEventCount.toLocaleString()} economy events · ${lastEventLabel} · digest ${digestFreshness}`,
    degradedLabel: heartbeat.degradedFlags.length ? heartbeat.degradedFlags.join(', ') : 'healthy',
  };
}

export function summarizeEconomyListings(response: NullCityEconomyListingsBridgeResponse | undefined): EconomyListingsSummary {
  if (!response?.available) {
    return {
      tone: 'warn',
      headline: 'NCRI listings unavailable',
      detail: 'Admin session and Null City control bridge are required.',
    };
  }

  const count = response.listings.length;
  const latest = response.listings[0];
  return {
    tone: count > 0 ? 'ok' : 'warn',
    headline: count === 1 ? '1 NCRI listed' : `${count.toLocaleString()} NCRIs listed`,
    detail: latest
      ? `Latest: ${latest.displayName} from ${latest.sourceResidentName || latest.owner}`
      : 'No approved, available NCRIs are listed for AP/GP trades yet.',
  };
}

export function summarizeEconomyTransport(
  status: EconomyTransportStatus,
  live: NullCityLiveEconomyBridgeResponse | undefined,
  heartbeat: NullCityEconomyHeartbeatBridgeResponse | undefined,
): EconomyTransportSummary {
  if (status === 'live') {
    return {
      tone: 'ok',
      label: 'stream',
      detail: 'SSE snapshots are updating heartbeat and AP/GP totals.',
    };
  }

  if (status === 'connecting') {
    return {
      tone: 'warn',
      label: 'opening stream',
      detail: 'Trying the economy stream; polling snapshot remains visible.',
    };
  }

  if (status === 'fallback') {
    return {
      tone: 'warn',
      label: 'polling',
      detail: 'Economy stream is unavailable; polling live and heartbeat routes.',
    };
  }

  if (!live?.available && !heartbeat?.available) {
    return {
      tone: 'warn',
      label: 'bridge',
      detail: 'Set NULLCITY_CITY_API_URL and NULLCITY_CITY_API_TOKEN before stream or polling transport can load.',
    };
  }

  return {
    tone: 'ok',
    label: 'polling',
    detail: 'Polling live and heartbeat routes for AP/GP updates.',
  };
}

export function economyStreamStatusAfterTimeout(status: EconomyTransportStatus): EconomyTransportStatus {
  return status === 'connecting' ? 'fallback' : status;
}

export function economyEventDisplay(event: NullCityLiveEconomyEvent): EconomyEventDisplay {
  const deltas = [
    event.apDelta !== undefined ? `AP ${signed(event.apDelta)}` : undefined,
    event.gpDelta !== undefined ? `GP ${signed(event.gpDelta)}` : undefined,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    kindLabel: event.kind.replace(/_/g, ' '),
    title: [event.residentName || 'city', ...deltas].join(' · '),
    detail: event.cityUserId || event.refId || event.note || 'public',
  };
}

export function economyResidentDisplay(resident: NullCityLiveEconomyResident): EconomyResidentDisplay {
  const tone: EconomyResidentDisplay['tone'] = resident.online && resident.activeInWindow
    ? 'ok'
    : resident.online || resident.activeInWindow
      ? 'warn'
      : 'warn';
  const status = resident.online
    ? resident.activeInWindow ? 'online + active' : 'online'
    : resident.activeInWindow ? 'active recently' : 'offline';
  const recentEvents = resident.windowEventCount === 1 ? '1 recent event' : `${resident.windowEventCount.toLocaleString()} recent events`;
  return {
    tone,
    title: resident.residentName,
    detail: `${resident.attentionBalance.toLocaleString()} AP · GP Δ ${signed(resident.gpNetDelta)} · ${recentEvents}`,
    status,
  };
}

export function selfFundedApResidentRows(
  response: NullCityLiveEconomyBridgeResponse | undefined,
  limit = 6,
): SelfFundedApResidentRow[] {
  const snapshot = response?.snapshot;
  if (!response?.available || !snapshot) return [];

  const byResident = new Map<string, SelfFundedApResidentRow>();
  for (const event of selfFundedApEvents(snapshot.recentEvents)) {
    const residentName = event.residentName;
    if (!residentName) continue;
    const existing = byResident.get(residentName);
    const apDelta = Math.max(0, event.apDelta ?? 0);
    const gpSpent = Math.abs(Math.min(0, event.gpDelta ?? 0));
    if (!existing) {
      byResident.set(residentName, {
        residentName,
        apTotal: apDelta,
        gpSpent,
        exchangeCount: 1,
        latestAt: event.ts,
        detail: '',
      });
      continue;
    }

    existing.apTotal += apDelta;
    existing.gpSpent += gpSpent;
    existing.exchangeCount += 1;
    if (Date.parse(event.ts) > Date.parse(existing.latestAt)) {
      existing.latestAt = event.ts;
    }
  }

  return [...byResident.values()]
    .map(row => ({
      ...row,
      detail: `${row.apTotal.toLocaleString()} AP for ${row.gpSpent.toLocaleString()} GP across ${row.exchangeCount.toLocaleString()} exchange${row.exchangeCount === 1 ? '' : 's'}`,
    }))
    .sort((left, right) => Date.parse(right.latestAt) - Date.parse(left.latestAt))
    .slice(0, Math.max(0, limit));
}

function signed(value: number): string {
  return value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString();
}

function economyWindowResidentLabel(activeResidentCount: number, windowMs: number): string {
  const count = Math.max(0, activeResidentCount);
  const minutes = Math.max(1, Math.round(windowMs / 60000));
  return `${count.toLocaleString()} resident${count === 1 ? '' : 's'} with economy events in ${minutes.toLocaleString()}m`;
}

function summarizeSelfFundedAp(events: NullCityLiveEconomyEvent[]): string {
  const exchanges = selfFundedApEvents(events).sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts));
  if (!exchanges.length) return 'no self-funded AP';

  const apTotal = exchanges.reduce((total, event) => total + Math.max(0, event.apDelta ?? 0), 0);
  const latestResident = exchanges[0]?.residentName || 'unknown resident';
  return `${apTotal.toLocaleString()} AP via ${latestResident}`;
}

function selfFundedApEvents(events: NullCityLiveEconomyEvent[]): NullCityLiveEconomyEvent[] {
  return events.filter(event => event.kind === 'ap_gp_exchange' && (event.apDelta ?? 0) > 0 && (event.gpDelta ?? 0) < 0);
}

function formatFreshness(value: string, reference: string): string {
  const timestamp = Date.parse(value);
  const referenceTimestamp = Date.parse(reference);
  if (!Number.isFinite(timestamp) || !Number.isFinite(referenceTimestamp)) {
    return 'unknown';
  }

  const elapsedSeconds = Math.max(0, Math.floor((referenceTimestamp - timestamp) / 1000));
  if (elapsedSeconds < 5) {
    return 'now';
  }
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 48) {
    return `${elapsedHours}h ago`;
  }

  return `${Math.floor(elapsedHours / 24)}d ago`;
}
