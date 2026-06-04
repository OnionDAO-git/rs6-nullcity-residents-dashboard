import { describe, expect, test } from 'bun:test';
import { recommendedDashboardAction, visibleDashboardNavItems } from './end-user-dashboard';

describe('visibleDashboardNavItems', () => {
  test('keeps the default attendee nav small and action-focused', () => {
    expect(visibleDashboardNavItems({ expertMode: false }).map(item => item.label)).toEqual([
      'Home',
      'Watch',
      'Residents',
      'Inbox',
      'Me',
    ]);
  });

  test('reveals diagnostic and staff destinations only in expert mode', () => {
    const labels = visibleDashboardNavItems({ expertMode: true, admin: true }).map(item => item.label);

    expect(labels).toContain('World');
    expect(labels).toContain('Stories');
    expect(labels).toContain('Economy');
    expect(labels).toContain('Soul Proposals');
    expect(labels).toContain('Print Quotes');
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
});
