import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { SoulProposal } from './city-api';

export type DashboardTone = 'gold' | 'teal' | 'green' | 'blue' | 'mauve' | 'amber' | 'warn';

export interface DashboardNavItem {
  label: string;
  path: string;
  match: string;
  glyph: string;
  expertOnly?: boolean;
  adminOnly?: boolean;
}

export interface VisibleDashboardNavOptions {
  expertMode: boolean;
  admin?: boolean;
}

export interface RecommendedDashboardActionInput {
  authenticated: boolean;
  loginReady: boolean;
  expertMode?: boolean;
  lowAttentionResidents: number;
  unreadThreads: number;
  onlineResidents: number;
  pendingPrints: number;
  proposalCount: number;
  onionBalance?: number;
  residentCount?: number;
}

export interface RecommendedDashboardAction {
  label: string;
  path: string;
  detail: string;
  tone: DashboardTone;
  actionLabel?: string;
}

export interface ResidentAttentionGuideInput {
  authenticated: boolean;
  residentName: string;
  suggestedOnions: number;
  currentAttention?: number;
}

export interface ResidentAttentionGuide {
  title: string;
  detail: string;
  amountLabel: string;
  primaryAction: string;
  tone: DashboardTone;
}

export interface ResidentAttentionResultNoticeInput {
  residentName: string;
  onionAmount: number;
  status: string;
  onionRequestStatus?: string;
  creditedAmount?: number;
}

export function dashboardNoticeKey(kind: string, message: string): string {
  return `${kind}:${message.trim()}`;
}

export function dashboardNoticeVisible(dismissed: ReadonlySet<string>, kind: string, message: string): boolean {
  const normalized = message.trim();
  return Boolean(normalized) && !dismissed.has(dashboardNoticeKey(kind, normalized));
}

export function dismissDashboardNotice(dismissed: ReadonlySet<string>, kind: string, message: string): Set<string> {
  return new Set([...dismissed, dashboardNoticeKey(kind, message)]);
}

export const dashboardNavItems: DashboardNavItem[] = [
  { label: 'Home', path: '/', match: '/', glyph: 'HM' },
  { label: 'Residents', path: '/residents', match: '/residents', glyph: 'RE' },
  { label: 'New Souls', path: '/embassy', match: '/embassy', glyph: 'SO' },
  { label: 'Items', path: '/prints', match: '/prints', glyph: 'IT' },
  { label: 'Graveyard', path: '/graveyard', match: '/graveyard', glyph: 'GY' },
  { label: 'Me', path: '/profile', match: '/profile', glyph: 'ME' },
  { label: 'Watch', path: '/live', match: '/live', glyph: 'WT', expertOnly: true },
  { label: 'Inbox', path: '/inbox', match: '/inbox', glyph: 'IN', expertOnly: true },
  { label: 'World', path: '/world', match: '/world', glyph: 'WO', expertOnly: true },
  { label: 'Stories', path: '/chronicle', match: '/chronicle', glyph: 'ST', expertOnly: true },
  { label: 'Economy', path: '/economy', match: '/economy', glyph: 'EC', expertOnly: true },
  { label: 'Library', path: '/library', match: '/library', glyph: 'LB', expertOnly: true },
  { label: 'Admin', path: '/admin', match: '/admin', glyph: 'AD', expertOnly: true, adminOnly: true },
  { label: 'Debug', path: '/debug', match: '/debug', glyph: 'DG', expertOnly: true, adminOnly: true },
];

export function visibleDashboardNavItems(options: VisibleDashboardNavOptions): DashboardNavItem[] {
  return dashboardNavItems.filter(item => {
    if (item.adminOnly && !options.admin) return false;
    if (item.expertOnly && !options.expertMode) return false;
    return true;
  });
}

export function primaryDashboardNavItems(options: VisibleDashboardNavOptions): DashboardNavItem[] {
  return visibleDashboardNavItems(options);
}

export function sortSoulProposalsForFunding(proposals: readonly SoulProposal[]): SoulProposal[] {
  return [...proposals].sort((a, b) => {
    const statusDelta = proposalFundingStatusRank(a.status) - proposalFundingStatusRank(b.status);
    if (statusDelta !== 0) return statusDelta;

    const progressDelta = proposalFundingProgress(b) - proposalFundingProgress(a);
    if (progressDelta !== 0) return progressDelta;

    const remainingDelta = proposalFundingRemaining(a) - proposalFundingRemaining(b);
    if (remainingDelta !== 0) return remainingDelta;

    return timestampValue(b.updatedAt) - timestampValue(a.updatedAt);
  });
}

export function sortResidentsForAttention(rows: readonly ResidentDashboardRow[]): ResidentDashboardRow[] {
  return [...rows].sort((a, b) => {
    const attentionDelta = residentAttentionValue(a) - residentAttentionValue(b);
    if (attentionDelta !== 0) return attentionDelta;

    if (a.online !== b.online) return a.online ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function recommendedDashboardAction(input: RecommendedDashboardActionInput): RecommendedDashboardAction {
  const expertMode = input.expertMode === true;

  if (!input.authenticated && input.loginReady) {
    return {
      label: 'Sign in to participate',
      path: '/login',
      detail: 'Unlock Onion spending, resident messages, new souls, and item requests.',
      tone: 'gold',
      actionLabel: 'Sign In',
    };
  }

  if (input.authenticated && (input.onionBalance ?? 0) > 0 && (input.residentCount ?? 0) > 0) {
    const path = input.lowAttentionResidents > 0 ? '/residents?triage=attention' : '/residents';
    return {
      label: `Use your ${(input.onionBalance ?? 0).toLocaleString()} Onions`,
      path,
      detail: 'Choose a resident and pick an amount. When the Onion request completes, Null City credits that resident with attention.',
      tone: 'gold',
      actionLabel: 'Pick a Resident',
    };
  }

  if (input.lowAttentionResidents > 0) {
    return {
      label: 'Choose a resident',
      path: '/residents?triage=attention',
      detail: `${input.lowAttentionResidents} resident${input.lowAttentionResidents === 1 ? '' : 's'} may need attention soon.`,
      tone: 'warn',
      actionLabel: 'Give Attention',
    };
  }

  if (input.unreadThreads > 0) {
    if (!expertMode) {
      return {
        label: 'Check your messages',
        path: '/profile',
        detail: `${input.unreadThreads} unread update${input.unreadThreads === 1 ? '' : 's'} can be reached from Me.`,
        tone: 'mauve',
        actionLabel: 'Open Me',
      };
    }
    return {
      label: 'Open your inbox',
      path: '/inbox',
      detail: `${input.unreadThreads} unread resident or city update${input.unreadThreads === 1 ? '' : 's'}.`,
      tone: 'mauve',
      actionLabel: 'Open Inbox',
    };
  }

  if (expertMode && input.proposalCount > 0) {
    return {
      label: 'Review new souls',
      path: '/embassy',
      detail: `${input.proposalCount} future resident${input.proposalCount === 1 ? '' : 's'} can be reviewed or funded.`,
      tone: 'green',
      actionLabel: 'Browse',
    };
  }

  if (expertMode && input.pendingPrints > 0) {
    return {
      label: 'Check item requests',
      path: '/prints',
      detail: `${input.pendingPrints} item or print request${input.pendingPrints === 1 ? '' : 's'} in progress.`,
      tone: 'amber',
      actionLabel: 'Check Quotes',
    };
  }

  return {
    label: 'Watch live overview',
    path: '/live',
    detail: input.onlineResidents > 0
      ? `${input.onlineResidents} resident${input.onlineResidents === 1 ? '' : 's'} online right now.`
      : 'Open the public live view while the city syncs resident activity.',
    tone: 'teal',
    actionLabel: 'Watch',
  };
}

function proposalFundingStatusRank(status: SoulProposal['status']): number {
  if (status === 'ready_to_birth' || status === 'birthing') return 0;
  if (status === 'funding') return 1;
  if (status === 'submitted') return 2;
  if (status === 'draft') return 3;
  if (status === 'born') return 4;
  return 5;
}

function proposalFundingProgress(proposal: SoulProposal): number {
  if (proposal.attentionThreshold <= 0) return 0;
  return proposal.contributedAttention / proposal.attentionThreshold;
}

function proposalFundingRemaining(proposal: SoulProposal): number {
  return Math.max(0, proposal.attentionThreshold - proposal.contributedAttention);
}

function residentAttentionValue(row: ResidentDashboardRow): number {
  return Number.isFinite(row.attention) ? row.attention ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
}

function timestampValue(value: string | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

export function residentAttentionGuide(input: ResidentAttentionGuideInput): ResidentAttentionGuide {
  const resident = input.residentName || 'this resident';
  const suggested = Math.max(0, Math.floor(input.suggestedOnions || 0));

  if (!input.authenticated) {
    return {
      title: `Give attention to ${resident}`,
      detail: 'Sign in to spend Onions and support this resident.',
      amountLabel: 'Choose an Onion amount after sign in',
      primaryAction: 'Sign in to Give Attention',
      tone: 'gold',
    };
  }

  const lowAttention = input.currentAttention !== undefined && input.currentAttention <= 10;
  return {
    title: `Give attention to ${resident}`,
    detail: `Spend Onions to create an approval request. When the request completes, ${resident} receives attention.`,
    amountLabel: suggested > 0 ? `${suggested.toLocaleString()} Onions suggested` : 'Choose how many Onions to spend',
    primaryAction: 'Give Attention',
    tone: lowAttention || suggested > 0 ? 'warn' : 'teal',
  };
}

export function residentAttentionResultNotice(input: ResidentAttentionResultNoticeInput): string {
  const resident = input.residentName || 'This resident';
  const settled = input.status === 'settled' || input.onionRequestStatus === 'completed';
  if (settled) {
    const amount = Math.max(0, Math.floor(input.creditedAmount ?? input.onionAmount));
    return `Onions spent. ${resident} received ${amount.toLocaleString()} attention.`;
  }
  return `Approval pending in Onion portal. ${resident} has not received attention yet.`;
}
