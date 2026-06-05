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
  { label: 'Watch', path: '/live', match: '/live', glyph: 'WT' },
  { label: 'Residents', path: '/residents', match: '/residents', glyph: 'RE' },
  { label: 'Inbox', path: '/inbox', match: '/inbox', glyph: 'IN' },
  { label: 'Me', path: '/profile', match: '/profile', glyph: 'ME' },
  { label: 'World', path: '/world', match: '/world', glyph: 'WO', expertOnly: true },
  { label: 'Stories', path: '/chronicle', match: '/chronicle', glyph: 'ST', expertOnly: true },
  { label: 'Economy', path: '/economy', match: '/economy', glyph: 'EC', expertOnly: true },
  { label: 'Soul Proposals', path: '/embassy', match: '/embassy', glyph: 'SO', expertOnly: true },
  { label: 'Print Quotes', path: '/prints', match: '/prints', glyph: 'PR', expertOnly: true },
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

export function recommendedDashboardAction(input: RecommendedDashboardActionInput): RecommendedDashboardAction {
  if (!input.authenticated && input.loginReady) {
    return {
      label: 'Sign in to participate',
      path: '/login',
      detail: 'Unlock attention, inbox, Soul proposal, and print quote actions.',
      tone: 'gold',
      actionLabel: 'Sign In',
    };
  }

  if (input.authenticated && (input.onionBalance ?? 0) > 0 && (input.residentCount ?? 0) > 0) {
    const path = input.lowAttentionResidents > 0 ? '/residents?focus=needs-attention' : '/residents';
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
      path: '/residents?focus=needs-attention',
      detail: `${input.lowAttentionResidents} resident${input.lowAttentionResidents === 1 ? '' : 's'} may need attention soon.`,
      tone: 'warn',
      actionLabel: 'Give Attention',
    };
  }

  if (input.unreadThreads > 0) {
    return {
      label: 'Open your inbox',
      path: '/inbox',
      detail: `${input.unreadThreads} unread resident or city update${input.unreadThreads === 1 ? '' : 's'}.`,
      tone: 'mauve',
      actionLabel: 'Open Inbox',
    };
  }

  if (input.proposalCount > 0) {
    return {
      label: 'Browse Soul proposals',
      path: '/embassy',
      detail: `${input.proposalCount} proposal${input.proposalCount === 1 ? '' : 's'} can be reviewed or funded.`,
      tone: 'green',
      actionLabel: 'Browse',
    };
  }

  if (input.pendingPrints > 0) {
    return {
      label: 'Check print quotes',
      path: '/prints',
      detail: `${input.pendingPrints} print request${input.pendingPrints === 1 ? '' : 's'} in progress.`,
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
