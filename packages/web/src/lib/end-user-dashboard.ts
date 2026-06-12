import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { SoulProposal } from './city-api';
import { residentNeedsApSupportSoon } from './resident-loop';

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

export interface BoardActionCardsInput {
  authenticated: boolean;
  onionBalance: number;
  lowAttentionResidents: number;
  residentCount: number;
  pendingPrints: number;
}

export interface BoardActionCard {
  label: string;
  path: string;
  detail: string;
  tone: DashboardTone;
}

export interface SimpleProfileActionCardsInput {
  authenticated: boolean;
  onionBalance: number;
  supportedResidentCount: number;
  pendingPrints: number;
}

export interface SimpleProfileActionCard {
  label: string;
  path: string;
  detail: string;
  tone: DashboardTone;
}

export interface ResidentSupportReason {
  label: string;
  detail: string;
  tone: DashboardTone;
  action: string;
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
  attentionBefore?: number;
  attentionAfter?: number;
}

export interface ResidentAttentionPreviewInput {
  residentName: string;
  currentAttention?: number;
  onionAmount: string | number;
  suggestedSafeSupportAmount?: number;
  walletBalance?: number;
}

export interface ResidentAttentionPreview {
  currentAmount: number;
  onionAmount: number;
  projectedAmount: number;
  targetAmount: number;
  percentBefore: number;
  percentAfter: number;
  copy: string;
  buttonLabel: string;
  exceedsWallet: boolean;
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
  { label: 'Watch', path: '/live', match: '/live', glyph: 'WT' },
  { label: 'Residents', path: '/residents', match: '/residents', glyph: 'RE' },
  { label: 'Inbox', path: '/inbox', match: '/inbox', glyph: 'IN' },
  { label: 'Me', path: '/profile', match: '/profile', glyph: 'ME' },
  { label: 'Soul Library', path: '/graveyard', match: '/graveyard', glyph: 'SL' },
  { label: 'Board', path: '/board', match: '/board', glyph: 'BD', expertOnly: true },
  { label: 'New Souls', path: '/embassy', match: '/embassy', glyph: 'SO', expertOnly: true },
  { label: 'Items', path: '/prints', match: '/prints', glyph: 'IT', expertOnly: true },
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
      detail: 'Load your Onions, support residents, and read replies in your Inbox.',
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
        label: 'Read your letters',
        path: '/inbox',
        detail: `${input.unreadThreads} letter${input.unreadThreads === 1 ? '' : 's'} from residents and the city waiting for you.`,
        tone: 'mauve',
        actionLabel: 'Open Inbox',
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
    label: 'Choose a resident',
    path: '/residents',
    detail: input.onlineResidents > 0
      ? `${input.onlineResidents} resident${input.onlineResidents === 1 ? '' : 's'} available. Pick someone to support with Onions.`
      : 'Browse residents and choose who should receive attention when the city is quiet.',
    tone: 'teal',
    actionLabel: 'Open Residents',
  };
}

export function boardActionCards(input: BoardActionCardsInput): BoardActionCard[] {
  const attentionPath = input.lowAttentionResidents > 0 ? '/residents?triage=attention' : '/residents';
  const onionText = input.authenticated && input.onionBalance > 0
    ? `${input.onionBalance.toLocaleString()} Onion${input.onionBalance === 1 ? '' : 's'}`
    : 'Onions';

  const supportCard: BoardActionCard = {
    label: 'Give Attention',
    path: attentionPath,
    detail: input.residentCount > 0
      ? `Choose a resident and spend ${onionText} so they receive attention.`
      : 'Open the resident list when it loads, then choose who should receive attention.',
    tone: input.lowAttentionResidents > 0 ? 'warn' : 'gold',
  };
  const watchCard: BoardActionCard = {
    label: 'Watch Residents',
    path: '/live',
    detail: 'See residents moving in the city before you choose who to support.',
    tone: 'teal',
  };
  const libraryCard: BoardActionCard = {
    label: 'Soul Library',
    path: '/graveyard',
    detail: 'Read resident stories and remember who has lived in Null City.',
    tone: 'mauve',
  };

  if (!input.authenticated) {
    return [
      {
        label: 'Sign In',
        path: '/login',
        detail: 'Load your Onions and unlock resident support.',
        tone: 'gold',
      },
      supportCard,
      watchCard,
      libraryCard,
    ];
  }

  return [
    supportCard,
    watchCard,
    {
      label: 'Read Inbox',
      path: '/inbox',
      detail: 'Read letters and updates from residents you support.',
      tone: 'mauve',
    },
    libraryCard,
  ];
}

export function simpleProfileActionCards(input: SimpleProfileActionCardsInput): SimpleProfileActionCard[] {
  if (!input.authenticated) {
    return [
      {
        label: 'Sign In',
        path: '/login',
        detail: 'Load your Onions and start supporting residents.',
        tone: 'gold',
      },
      {
        label: 'Watch Residents',
        path: '/live',
        detail: 'See what residents are doing before you choose one.',
        tone: 'teal',
      },
      {
        label: 'Residents',
        path: '/residents',
        detail: 'Browse residents and choose who you may want to support.',
        tone: 'gold',
      },
      {
        label: 'Soul Library',
        path: '/graveyard',
        detail: 'Read resident stories and city memory.',
        tone: 'mauve',
      },
    ];
  }

  return [
    {
      label: 'Give Attention',
      path: '/residents?triage=attention',
      detail: `${input.onionBalance.toLocaleString()} Onion${input.onionBalance === 1 ? '' : 's'} available. Spend them on a resident you want to keep active.`,
      tone: 'gold',
    },
    {
      label: 'Open Inbox',
      path: '/inbox',
      detail: 'Read letters and updates from residents you support.',
      tone: 'mauve',
    },
    {
      label: 'Watch Residents',
      path: '/live',
      detail: input.supportedResidentCount > 0
        ? `${input.supportedResidentCount.toLocaleString()} resident${input.supportedResidentCount === 1 ? '' : 's'} in your patron list. Watch what is happening now.`
        : 'Watch the city live before you choose who to support.',
      tone: 'teal',
    },
    {
      label: 'Soul Library',
      path: '/graveyard',
      detail: 'Read resident stories and see what the city remembers.',
      tone: 'mauve',
    },
  ];
}

export function residentSupportReason(row: ResidentDashboardRow): ResidentSupportReason {
  const attention = residentAttentionValue(row);
  if (residentNeedsApSupportSoon(row)) {
    return {
      label: 'Needs attention',
      detail: 'Attention is running low; support helps keep this resident active.',
      tone: 'warn',
      action: 'Give attention',
    };
  }

  if (row.online) {
    return {
      label: 'Online now',
      detail: 'Watch live, then support if their goal matters to you.',
      tone: 'teal',
      action: 'Open resident',
    };
  }

  if (Number.isFinite(attention)) {
    return {
      label: 'Steady',
      detail: 'Attention is steady; support if you want them to keep going.',
      tone: 'gold',
      action: 'Open resident',
    };
  }

  return {
    label: 'Resident',
    detail: 'Open their page and decide if you want to support them.',
    tone: 'mauve',
    action: 'Open resident',
  };
}

export function simpleModeRouteRequiresExpert(route: string, search = ''): boolean {
  const normalized = normalizeDashboardPath(route);
  if (normalized === '/world') return !hasWorldObserveTarget(search);
  if (normalized === '/board') return true;
  if (normalized === '/embassy' || normalized.startsWith('/embassy/')) return true;
  if (normalized === '/prints' || normalized.startsWith('/prints/')) return true;
  if (normalized === '/chronicle' || normalized.startsWith('/chronicle/')) return true;
  if (normalized === '/economy') return true;
  if (normalized === '/library') return true;
  if (normalized === '/debug' || normalized.startsWith('/debug/')) return true;
  if (normalized === '/admin' || normalized.startsWith('/admin/')) return true;
  return false;
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

function normalizeDashboardPath(route: string): string {
  const [pathOnly = '/'] = route.split(/[?#]/);
  const withSlash = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : '/';
}

function hasWorldObserveTarget(search: string): boolean {
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return Boolean((params.get('resident') || params.get('observe') || '').trim());
  } catch {
    return false;
  }
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

export interface ResidentSupportPayoffInput {
  residentName: string;
  onionAmount: number;
  creditedAmount?: number;
  attentionBefore?: number;
  attentionAfter?: number;
  recentSay?: string;
}

export interface ResidentSupportPayoff {
  headline: string;
  detail: string;
  reaction?: string;
  lettersLine: string;
}

/**
 * Rough life-runway conversion for the support payoff moment.
 *
 * `residentNeedsApSupportSoon` flags residents once attention runway drops to
 * the short band (<=25 attention, floor at 10), which in practice reads as
 * "may need help within about a day" — roughly one attention point per idle
 * hour. The payoff copy uses the same approximation and always says "about".
 */
const APPROX_ATTENTION_HOURS_PER_POINT = 1;

export function residentSupportPayoff(input: ResidentSupportPayoffInput): ResidentSupportPayoff {
  const resident = input.residentName.trim() || 'This resident';
  const attentionBefore = input.attentionBefore;
  const attentionAfter = input.attentionAfter;
  const credited = attentionBefore !== undefined && attentionAfter !== undefined && attentionAfter > attentionBefore
    ? attentionAfter - attentionBefore
    : Math.max(0, Math.floor(input.creditedAmount ?? input.onionAmount));
  const runway = approximateRunwayLabel(credited * APPROX_ATTENTION_HOURS_PER_POINT);
  const onionLabel = formatOnionAmount(Math.max(0, Math.floor(input.onionAmount)));
  const attentionTrail = attentionBefore !== undefined && attentionAfter !== undefined
    ? ` Attention ${nonNegativeWholeAmount(attentionBefore).toLocaleString()} → ${nonNegativeWholeAmount(attentionAfter).toLocaleString()}.`
    : '';
  const reaction = input.recentSay?.trim();

  return {
    headline: `You just gave ${resident} ${runway} in the city.`,
    detail: `${onionLabel} settled as ${credited.toLocaleString()} attention.${attentionTrail}`,
    ...(reaction ? { reaction } : {}),
    lettersLine: `${resident} will write to you — check your Inbox.`,
  };
}

function approximateRunwayLabel(hours: number): string {
  const wholeHours = Math.max(0, Math.round(hours));
  if (wholeHours < 1) return 'a little more time';
  if (wholeHours === 1) return 'about 1 more hour';
  if (wholeHours < 48) return `about ${wholeHours.toLocaleString()} more hours`;
  const days = Math.round(wholeHours / 24);
  return `about ${days.toLocaleString()} more days`;
}

export interface ResidentRecentSayInput {
  posts?: readonly { body?: string; source?: string; visibility?: string; createdAt?: string }[];
  feed?: { latestEventKind?: string; latestEventText?: string };
  lastEvent?: { kind?: string; text?: string };
}

export function residentRecentPublicSay(input: ResidentRecentSayInput): string | undefined {
  const posts = [...(input.posts ?? [])]
    .filter(post => (post.source ?? 'resident') === 'resident' && post.visibility !== 'hidden' && Boolean(post.body?.trim()))
    .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt));
  const postBody = posts[0]?.body?.trim();
  if (postBody) return postBody;

  if (input.lastEvent?.kind === 'say' && input.lastEvent.text?.trim()) return input.lastEvent.text.trim();
  if (input.feed?.latestEventKind === 'say' && input.feed.latestEventText?.trim()) return input.feed.latestEventText.trim();
  return undefined;
}

export function residentAttentionResultNotice(input: ResidentAttentionResultNoticeInput): string {
  const resident = input.residentName || 'This resident';
  if (input.status === 'onion_spend_denied' || input.onionRequestStatus === 'denied') {
    return `Onion spend denied. ${resident} has not received attention.`;
  }
  if (input.status === 'onion_spend_failed' || input.onionRequestStatus === 'failed' || input.onionRequestStatus === 'expired') {
    return `Onion spend failed. ${resident} has not received attention.`;
  }
  const settled = input.status === 'settled';
  if (settled) {
    const amount = Math.max(0, Math.floor(input.creditedAmount ?? input.onionAmount));
    const attentionBefore = nonNegativeWholeAmount(input.attentionBefore);
    const attentionAfter = nonNegativeWholeAmount(input.attentionAfter);
    if (input.attentionBefore !== undefined && input.attentionAfter !== undefined) {
      return `You gave ${resident} ${formatOnionAmount(Math.max(0, Math.floor(input.onionAmount)))}. Their attention rose from ${attentionBefore.toLocaleString()} to ${attentionAfter.toLocaleString()}.`;
    }
    return `Onions spent. ${resident} received ${amount.toLocaleString()} attention.`;
  }
  return `Onion spend pending. ${resident} has not received attention yet.`;
}

export function residentAttentionPreview(input: ResidentAttentionPreviewInput): ResidentAttentionPreview {
  const resident = input.residentName.trim() || 'this resident';
  const currentAmount = nonNegativeWholeAmount(input.currentAttention);
  const onionAmount = nonNegativeWholeAmount(input.onionAmount);
  const suggestedSafeSupportAmount = nonNegativeWholeAmount(input.suggestedSafeSupportAmount);
  const projectedAmount = currentAmount + onionAmount;
  const targetAmount = Math.max(1, currentAmount + (suggestedSafeSupportAmount > 0 ? suggestedSafeSupportAmount : onionAmount));
  const walletBalance = normalizedWalletBalance(input.walletBalance);
  const onionLabel = formatOnionAmount(onionAmount);

  return {
    currentAmount,
    onionAmount,
    projectedAmount,
    targetAmount,
    percentBefore: attentionProgressPercent(currentAmount, targetAmount),
    percentAfter: attentionProgressPercent(projectedAmount, targetAmount),
    copy: onionAmount > 0
      ? `${onionLabel} will give ${resident} about ${onionAmount.toLocaleString()} attention.`
      : `Choose how many Onions to give ${resident}.`,
    buttonLabel: onionAmount > 0 ? `Give ${onionLabel}` : 'Choose how much',
    exceedsWallet: walletBalance !== undefined && onionAmount > walletBalance,
  };
}

function nonNegativeWholeAmount(value: string | number | undefined): number {
  const normalized = typeof value === 'string' ? Number(value.trim().replace(/,/g, '')) : Number(value);
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.floor(normalized));
}

function normalizedWalletBalance(value: number | undefined): number | undefined {
  if (typeof value !== 'number') return undefined;
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

function attentionProgressPercent(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

function formatOnionAmount(amount: number): string {
  return `${amount.toLocaleString()} Onion${amount === 1 ? '' : 's'}`;
}
