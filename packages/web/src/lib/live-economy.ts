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

export function summarizeLiveEconomy(response: NullCityLiveEconomyBridgeResponse | undefined): LiveEconomySummary {
  if (!response?.available || !response.snapshot) {
    return {
      tone: 'warn',
      headline: 'Live economy bridge not configured',
      detail: 'Set NULLCITY_CITY_API_URL and NULLCITY_CITY_API_TOKEN for AP/GP totals.',
      eventLabel: 'no live events',
      proposalLabel: 'no live proposals',
    };
  }

  const snapshot = response.snapshot;
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
    detail: `${snapshot.city.activeResidentCount.toLocaleString()} active in economy window · AP Δ ${signed(snapshot.city.attentionDelta)} · GP Δ ${signed(snapshot.city.gpNetDelta)}`,
    eventLabel: `${apGpEvents.toLocaleString()} AP/GP events`,
    proposalLabel: pendingFunding === 1 ? '1 Soul funding' : `${pendingFunding.toLocaleString()} Souls funding`,
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
  return {
    tone,
    headline: `${heartbeat.activeResidentCount.toLocaleString()} / ${heartbeat.residentCount.toLocaleString()} residents active`,
    detail: `${heartbeat.economyEventCount.toLocaleString()} economy events · last ${lastKind}`,
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

function signed(value: number): string {
  return value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString();
}
