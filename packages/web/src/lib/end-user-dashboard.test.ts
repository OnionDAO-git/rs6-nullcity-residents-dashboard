import { describe, expect, test } from 'bun:test';
import { dashboardNoticeKey, dashboardNoticeVisible, dismissDashboardNotice, primaryDashboardNavItems, recommendedDashboardAction, residentAttentionGuide, residentAttentionResultNotice, visibleDashboardNavItems } from './end-user-dashboard';

describe('visibleDashboardNavItems', () => {
  test('keeps the default attendee nav small and action-focused', () => {
    expect(visibleDashboardNavItems({ expertMode: false }).map(item => item.label)).toEqual([
      'Home',
      'Residents',
      'New Souls',
      'Items',
      'Graveyard',
      'Me',
    ]);
  });

  test('reveals diagnostic and staff destinations only in expert mode', () => {
    const labels = visibleDashboardNavItems({ expertMode: true, admin: true }).map(item => item.label);

    expect(labels).toContain('Watch');
    expect(labels).toContain('Inbox');
    expect(labels).toContain('World');
    expect(labels).toContain('Stories');
    expect(labels).toContain('Economy');
    expect(labels).toContain('New Souls');
    expect(labels).toContain('Items');
    expect(labels).toContain('Library');
    expect(labels).toContain('Admin');
    expect(labels).toContain('Debug');
  });
});

describe('primaryDashboardNavItems', () => {
  test('keeps mobile simple mode to the five main human actions', () => {
    expect(primaryDashboardNavItems({ expertMode: false }).map(item => item.label)).toEqual([
      'Home',
      'Residents',
      'New Souls',
      'Items',
      'Me',
    ]);
  });

  test('keeps expert destinations discoverable on mobile in expert mode', () => {
    const labels = primaryDashboardNavItems({ expertMode: true, admin: true }).map(item => item.label);

    expect(labels).toContain('Watch');
    expect(labels).toContain('Inbox');
    expect(labels).toContain('World');
    expect(labels).toContain('Stories');
    expect(labels).toContain('Economy');
    expect(labels).toContain('Library');
    expect(labels).toContain('Admin');
    expect(labels).toContain('Debug');
  });
});

describe('recommendedDashboardAction', () => {
  test('asks guests to sign in when a login URL is configured', () => {
    expect(recommendedDashboardAction({
      authenticated: false,
      loginReady: true,
      lowAttentionResidents: 2,
      unreadThreads: 0,
      onlineResidents: 3,
      pendingPrints: 0,
      proposalCount: 0,
    })).toMatchObject({
      label: 'Sign in to participate',
      path: '/login',
      detail: 'Unlock Onion spending, resident messages, new souls, and item requests.',
      tone: 'gold',
    });
  });

  test('prioritizes resident attention before lower-stakes activity', () => {
    expect(recommendedDashboardAction({
      authenticated: true,
      loginReady: true,
      lowAttentionResidents: 2,
      unreadThreads: 4,
      onlineResidents: 3,
      pendingPrints: 1,
      proposalCount: 2,
    })).toMatchObject({
      label: 'Choose a resident',
      path: '/residents?focus=needs-attention',
      tone: 'warn',
    });
  });

  test('falls back to the live overview when there is no personal queue', () => {
    expect(recommendedDashboardAction({
      authenticated: true,
      loginReady: true,
      lowAttentionResidents: 0,
      unreadThreads: 0,
      onlineResidents: 0,
      pendingPrints: 0,
      proposalCount: 0,
    })).toMatchObject({
      label: 'Watch live overview',
      path: '/live',
      tone: 'teal',
    });
  });

  test('keeps unfinished proposal and print loops out of the simple-mode recommendation', () => {
    expect(recommendedDashboardAction({
      authenticated: true,
      loginReady: true,
      lowAttentionResidents: 0,
      unreadThreads: 0,
      onlineResidents: 3,
      pendingPrints: 1,
      proposalCount: 2,
      expertMode: false,
    })).toMatchObject({
      label: 'Watch live overview',
      path: '/live',
      tone: 'teal',
    });
  });

  test('routes unread messages to Me instead of the expert-only inbox in simple mode', () => {
    expect(recommendedDashboardAction({
      authenticated: true,
      loginReady: true,
      lowAttentionResidents: 0,
      unreadThreads: 3,
      onlineResidents: 3,
      pendingPrints: 0,
      proposalCount: 0,
      expertMode: false,
    })).toMatchObject({
      label: 'Check your messages',
      path: '/profile',
      tone: 'mauve',
    });
  });

  test('can still recommend inbox directly in expert mode', () => {
    expect(recommendedDashboardAction({
      authenticated: true,
      loginReady: true,
      lowAttentionResidents: 0,
      unreadThreads: 3,
      onlineResidents: 3,
      pendingPrints: 0,
      proposalCount: 0,
      expertMode: true,
    })).toMatchObject({
      label: 'Open your inbox',
      path: '/inbox',
      tone: 'mauve',
    });
  });

  test('can still recommend proposal review in expert mode', () => {
    expect(recommendedDashboardAction({
      authenticated: true,
      loginReady: true,
      lowAttentionResidents: 0,
      unreadThreads: 0,
      onlineResidents: 3,
      pendingPrints: 0,
      proposalCount: 2,
      expertMode: true,
    })).toMatchObject({
      label: 'Review new souls',
      path: '/embassy',
      tone: 'green',
    });
  });

  test('points attendees with Onions to resident attention before passive watching', () => {
    expect(recommendedDashboardAction({
      authenticated: true,
      loginReady: true,
      lowAttentionResidents: 0,
      unreadThreads: 0,
      onlineResidents: 10,
      pendingPrints: 0,
      proposalCount: 0,
      onionBalance: 1009,
      residentCount: 23,
    })).toMatchObject({
      label: 'Use your 1,009 Onions',
      path: '/residents',
      detail: 'Choose a resident and pick an amount. When the Onion request completes, Null City credits that resident with attention.',
      actionLabel: 'Pick a Resident',
      tone: 'gold',
    });
  });

  test('keeps the Onion explanation even when residents need attention', () => {
    expect(recommendedDashboardAction({
      authenticated: true,
      loginReady: true,
      lowAttentionResidents: 2,
      unreadThreads: 4,
      onlineResidents: 3,
      pendingPrints: 1,
      proposalCount: 2,
      onionBalance: 1009,
      residentCount: 23,
    })).toMatchObject({
      label: 'Use your 1,009 Onions',
      path: '/residents?focus=needs-attention',
      actionLabel: 'Pick a Resident',
      tone: 'gold',
    });
  });
});

describe('dismissible dashboard notices', () => {
  test('hides a dismissed notice without hiding a new notice', () => {
    const message = 'Onions spent. The Steward received 100 attention.';
    const dismissed = dismissDashboardNotice(new Set<string>(), 'action', message);

    expect([...dismissed]).toEqual([dashboardNoticeKey('action', message)]);
    expect(dashboardNoticeVisible(dismissed, 'action', message)).toBe(false);
    expect(dashboardNoticeVisible(dismissed, 'action', 'Loading city state')).toBe(true);
  });
});

describe('residentAttentionGuide', () => {
  test('makes the Onion-to-attention path explicit for signed-in humans', () => {
    expect(residentAttentionGuide({
      authenticated: true,
      residentName: 'Hans',
      suggestedOnions: 75,
      currentAttention: 4,
    })).toEqual({
      title: 'Give attention to Hans',
      detail: 'Spend Onions to create an approval request. When the request completes, Hans receives attention.',
      amountLabel: '75 Onions suggested',
      primaryAction: 'Give Attention',
      tone: 'warn',
    });
  });

  test('asks guests to sign in before spending Onions', () => {
    expect(residentAttentionGuide({
      authenticated: false,
      residentName: 'Hans',
      suggestedOnions: 0,
    })).toMatchObject({
      title: 'Give attention to Hans',
      primaryAction: 'Sign in to Give Attention',
      amountLabel: 'Choose an Onion amount after sign in',
      tone: 'gold',
    });
  });
});

describe('residentAttentionResultNotice', () => {
  test('confirms settled Onion attention in resident terms', () => {
    expect(residentAttentionResultNotice({
      residentName: 'Hans',
      onionAmount: 75,
      status: 'settled',
      onionRequestStatus: 'completed',
      creditedAmount: 75,
    })).toBe('Onions spent. Hans received 75 attention.');
  });

  test('keeps pending Onion settlement explicit', () => {
    expect(residentAttentionResultNotice({
      residentName: 'Hans',
      onionAmount: 75,
      status: 'pending_onion_settlement',
      onionRequestStatus: 'pending',
    })).toBe('Approval pending in Onion portal. Hans has not received attention yet.');
  });
});
