import type { NullCityLiveEconomyBridgeResponse } from './city-api';

export interface LiveEconomySummary {
  tone: 'ok' | 'warn' | 'fail';
  headline: string;
  detail: string;
  eventLabel: string;
  proposalLabel: string;
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

function signed(value: number): string {
  return value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString();
}
