import type { ResidentEconomy } from './api';

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
    detail: `${event.kind}: ${event.note || economyEventDelta(event) || 'GP event recorded'}`,
  };
}

function economyEventDelta(event: ResidentEconomy['recentEvents'][number]): string {
  if (event.gpDelta === undefined) return '';
  const sign = event.gpDelta > 0 ? '+' : '';
  return `${sign}${event.gpDelta.toLocaleString()} GP`;
}
