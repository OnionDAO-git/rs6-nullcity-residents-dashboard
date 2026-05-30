import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { PointLedgerEntry } from './city-api';
import { residentCoinEvidenceAmount, residentNeedsAp } from './resident-loop';

export type ProfileEconomyTone = 'ok' | 'warn' | 'fail';

export interface ProfileEconomyMetric {
  id: 'ap-balance' | 'gp-balance' | 'ap-net-24h' | 'gp-net-24h' | 'ledger-24h' | 'resident-ap';
  label: string;
  value: string;
  detail: string;
  tone: ProfileEconomyTone;
}

export interface ProfileEconomySummary {
  tone: ProfileEconomyTone;
  headline: string;
  detail: string;
  metrics: ProfileEconomyMetric[];
  warnings: string[];
  nextActions: string[];
}

export interface ProfileEconomyInput {
  apBalance: number;
  gpBalance: number;
  ledger: PointLedgerEntry[];
  residents: ResidentDashboardRow[];
  nowMs?: number;
}

const LOOKBACK_MS = 24 * 60 * 60 * 1000;

export function buildProfileEconomySummary(input: ProfileEconomyInput): ProfileEconomySummary {
  const nowMs = input.nowMs ?? Date.now();
  const recentLedger = input.ledger.filter(entry => nowMs - entryTimestamp(entry) <= LOOKBACK_MS);

  const apRecent = summarizeResource(recentLedger, 'AP');
  const gpRecent = summarizeResource(recentLedger, 'GP');
  const lowApResidents = input.residents.filter(row => residentNeedsAp(row)).length;
  const observedResidentGp = input.residents.reduce((sum, row) => sum + residentCoinEvidenceAmount(row), 0);

  const warnings: string[] = [];
  if (input.apBalance <= 0) warnings.push('AP is empty; profile actions are blocked until you top up.');
  else if (input.apBalance <= 10) warnings.push(`AP is low (${input.apBalance}); recharge soon to keep funding actions available.`);

  if (recentLedger.length === 0) warnings.push('No AP/GP ledger events in the last 24h.');
  if (input.gpBalance <= 0 && observedResidentGp <= 0) warnings.push('No GP in profile balance or resident coin-995 evidence.');
  if (lowApResidents > 0) warnings.push(`${lowApResidents} resident${lowApResidents === 1 ? ' is' : 's are'} low on AP.`);

  const tone: ProfileEconomyTone = input.apBalance <= 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'ok';
  const headline =
    tone === 'ok' ? 'AP/GP loop looks healthy' : tone === 'fail' ? 'AP/GP loop needs immediate attention' : 'AP/GP loop needs operator review';
  const detail =
    tone === 'ok'
      ? 'Balances, ledger activity, and resident AP pressure are all in a safe range.'
      : 'Review warnings and apply the next actions before promising AP/GP flow in demos.';

  const nextActions = buildNextActions({
    apBalance: input.apBalance,
    gpBalance: input.gpBalance,
    lowApResidents,
    hasRecentLedger: recentLedger.length > 0,
    observedResidentGp,
  });

  return {
    tone,
    headline,
    detail,
    metrics: [
      {
        id: 'ap-balance',
        label: 'AP Balance',
        value: `${input.apBalance.toLocaleString()} AP`,
        detail: 'Current attendee AP available to spend.',
        tone: input.apBalance <= 0 ? 'fail' : input.apBalance <= 10 ? 'warn' : 'ok',
      },
      {
        id: 'gp-balance',
        label: 'GP Balance',
        value: `${input.gpBalance.toLocaleString()} GP`,
        detail: 'Current attendee GP ledger balance.',
        tone: input.gpBalance <= 0 ? 'warn' : 'ok',
      },
      {
        id: 'ap-net-24h',
        label: 'AP Net (24h)',
        value: signed(apRecent.net),
        detail: `${apRecent.credits.toLocaleString()} in / ${Math.abs(apRecent.debits).toLocaleString()} out`,
        tone: apRecent.net < 0 ? 'warn' : 'ok',
      },
      {
        id: 'gp-net-24h',
        label: 'GP Net (24h)',
        value: signed(gpRecent.net),
        detail: `${gpRecent.credits.toLocaleString()} in / ${Math.abs(gpRecent.debits).toLocaleString()} out`,
        tone: gpRecent.net < 0 ? 'warn' : 'ok',
      },
      {
        id: 'ledger-24h',
        label: 'Ledger Events (24h)',
        value: recentLedger.length.toLocaleString(),
        detail: 'Recent AP/GP entries from profile ledger.',
        tone: recentLedger.length === 0 ? 'warn' : 'ok',
      },
      {
        id: 'resident-ap',
        label: 'Residents Low AP',
        value: lowApResidents.toLocaleString(),
        detail: `${observedResidentGp.toLocaleString()} GP observed across resident snapshots.`,
        tone: lowApResidents > 0 ? 'warn' : 'ok',
      },
    ],
    warnings,
    nextActions,
  };
}

function summarizeResource(entries: PointLedgerEntry[], resource: 'AP' | 'GP'): { net: number; credits: number; debits: number } {
  const scoped = entries.filter(entry => entry.resource === resource);
  let net = 0;
  let credits = 0;
  let debits = 0;
  for (const entry of scoped) {
    net += entry.delta;
    if (entry.delta >= 0) credits += entry.delta;
    else debits += entry.delta;
  }
  return { net, credits, debits };
}

function signed(value: number): string {
  if (value > 0) return `+${value.toLocaleString()}`;
  return value.toLocaleString();
}

function entryTimestamp(entry: PointLedgerEntry): number {
  const ts = Date.parse(entry.createdAt);
  return Number.isFinite(ts) ? ts : 0;
}

function buildNextActions(input: {
  apBalance: number;
  gpBalance: number;
  lowApResidents: number;
  hasRecentLedger: boolean;
  observedResidentGp: number;
}): string[] {
  const actions: string[] = [];
  if (input.apBalance <= 10) actions.push('Run check-in sync or request an AP grant before funding new actions.');
  if (!input.hasRecentLedger) actions.push('Generate fresh ledger activity so AP/GP claims are time-bounded.');
  if (input.gpBalance <= 0 && input.observedResidentGp <= 0) actions.push('Run AP-for-GP or coin-995 resident proof before promising GP-backed flows.');
  if (input.lowApResidents > 0) actions.push('Top up low-AP residents before showing autonomous loop health.');
  if (actions.length === 0) actions.push('Keep profile ledger and resident AP/GP snapshots refreshed for demos.');
  return actions;
}
