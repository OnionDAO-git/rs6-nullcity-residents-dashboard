import { describe, expect, test } from 'bun:test';
import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { SoulProposal } from './city-api';
import { boardActionCards, dashboardNoticeKey, dashboardNoticeVisible, dismissDashboardNotice, primaryDashboardNavItems, recommendedDashboardAction, residentAttentionGuide, residentAttentionPreview, residentAttentionResultNotice, residentSupportReason, simpleProfileActionCards, simpleModeRouteRequiresExpert, sortResidentsForAttention, sortSoulProposalsForFunding, visibleDashboardNavItems } from './end-user-dashboard';

describe('visibleDashboardNavItems', () => {
  test('keeps the default attendee nav to the Simple IA destinations', () => {
    expect(visibleDashboardNavItems({ expertMode: false }).map(item => [item.label, item.path])).toEqual([
      ['Home', '/'],
      ['Live', '/live'],
      ['Board', '/board'],
      ['Residents', '/residents'],
      ['Soul Library', '/graveyard'],
      ['Me', '/profile'],
    ]);
  });

  test('reveals diagnostic and staff destinations only in expert mode', () => {
    const labels = visibleDashboardNavItems({ expertMode: true, admin: true }).map(item => item.label);

    expect(labels).toContain('Live');
    expect(labels).toContain('Board');
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
  test('keeps mobile simple mode to the six main human actions', () => {
    expect(primaryDashboardNavItems({ expertMode: false }).map(item => [item.label, item.path])).toEqual([
      ['Home', '/'],
      ['Live', '/live'],
      ['Board', '/board'],
      ['Residents', '/residents'],
      ['Soul Library', '/graveyard'],
      ['Me', '/profile'],
    ]);
  });

  test('keeps expert destinations discoverable on mobile in expert mode', () => {
    const labels = primaryDashboardNavItems({ expertMode: true, admin: true }).map(item => item.label);

    expect(labels).toContain('Live');
    expect(labels).toContain('Board');
    expect(labels).toContain('Inbox');
    expect(labels).toContain('World');
    expect(labels).toContain('Stories');
    expect(labels).toContain('Economy');
    expect(labels).toContain('Library');
    expect(labels).toContain('Admin');
    expect(labels).toContain('Debug');
  });
});

describe('boardActionCards', () => {
  test('gives guests a simple start-here strip without expert routes or jargon', () => {
    const cards = boardActionCards({
      authenticated: false,
      onionBalance: 0,
      lowAttentionResidents: 2,
      residentCount: 10,
      pendingPrints: 0,
    });

    expect(cards.map(card => [card.label, card.path])).toEqual([
      ['Give Attention', '/residents?triage=attention'],
      ['Watch Live', '/live'],
      ['Request Item', '/login'],
      ['Sign In', '/login'],
    ]);
    expect(cards.map(card => card.detail).join(' ')).not.toMatch(/\b(debug|ops|controller|bridge|snapshot|API|backend|MVP|endpoint|shell)\b/i);
  });

  test('routes signed-in humans to their usable Board actions', () => {
    const cards = boardActionCards({
      authenticated: true,
      onionBalance: 999,
      lowAttentionResidents: 0,
      residentCount: 10,
      pendingPrints: 1,
    });

    expect(cards.map(card => [card.label, card.path])).toEqual([
      ['Give Attention', '/residents'],
      ['Watch Live', '/live'],
      ['Request Item', '/prints/new'],
      ['Me', '/profile'],
    ]);
    expect(cards[0]?.detail).toContain('999 Onions');
    expect(cards[2]?.detail).toContain('1 request');
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
      path: '/residents?triage=attention',
      tone: 'warn',
    });
  });

  test('falls back to choosing residents when there is no personal queue', () => {
    expect(recommendedDashboardAction({
      authenticated: true,
      loginReady: true,
      lowAttentionResidents: 0,
      unreadThreads: 0,
      onlineResidents: 0,
      pendingPrints: 0,
      proposalCount: 0,
    })).toMatchObject({
      label: 'Choose a resident',
      path: '/residents',
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
      label: 'Choose a resident',
      path: '/residents',
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
      path: '/residents?triage=attention',
      actionLabel: 'Pick a Resident',
      tone: 'gold',
    });
  });
});

describe('simpleProfileActionCards', () => {
  test('gives signed-in humans clear next actions from Me', () => {
    const cards = simpleProfileActionCards({
      authenticated: true,
      onionBalance: 999,
      supportedResidentCount: 2,
      pendingPrints: 1,
    });

    expect(cards.map(card => [card.label, card.path])).toEqual([
      ['Give Attention', '/residents?triage=attention'],
      ['Watch Live', '/live'],
      ['Trophies', '/prints'],
    ]);
    expect(cards[0]?.detail).toContain('999 Onions');
    expect(cards[1]?.detail).toContain('2 residents');
    expect(cards[2]?.detail).toContain('1 trophy request');
    expect(cards.map(card => card.detail).join(' ')).not.toMatch(/\b(debug|ops|controller|bridge|snapshot|API|backend|MVP|endpoint|shell)\b/i);
  });

  test('routes guests from Me toward login before protected actions', () => {
    const cards = simpleProfileActionCards({
      authenticated: false,
      onionBalance: 0,
      supportedResidentCount: 0,
      pendingPrints: 0,
    });

    expect(cards.map(card => [card.label, card.path])).toEqual([
      ['Sign In', '/login'],
      ['Watch Live', '/live'],
      ['Board', '/board'],
    ]);
  });
});

describe('simpleModeRouteRequiresExpert', () => {
  test('gates direct expert-only city routes while Simple mode is active', () => {
    expect(simpleModeRouteRequiresExpert('/inbox')).toBe(true);
    expect(simpleModeRouteRequiresExpert('/inbox/thread-1')).toBe(true);
    expect(simpleModeRouteRequiresExpert('/chronicle')).toBe(true);
    expect(simpleModeRouteRequiresExpert('/chronicle/run-1')).toBe(true);
    expect(simpleModeRouteRequiresExpert('/economy')).toBe(true);
    expect(simpleModeRouteRequiresExpert('/library')).toBe(true);
    expect(simpleModeRouteRequiresExpert('/debug')).toBe(true);
    expect(simpleModeRouteRequiresExpert('/debug/residents')).toBe(true);
    expect(simpleModeRouteRequiresExpert('/admin')).toBe(true);
    expect(simpleModeRouteRequiresExpert('/admin/economy')).toBe(true);
    expect(simpleModeRouteRequiresExpert('/world')).toBe(true);
  });

  test('keeps the human action routes and resident world observe links Simple-safe', () => {
    expect(simpleModeRouteRequiresExpert('/')).toBe(false);
    expect(simpleModeRouteRequiresExpert('/residents')).toBe(false);
    expect(simpleModeRouteRequiresExpert('/residents/res%3Ahans')).toBe(false);
    expect(simpleModeRouteRequiresExpert('/embassy')).toBe(false);
    expect(simpleModeRouteRequiresExpert('/prints')).toBe(false);
    expect(simpleModeRouteRequiresExpert('/board')).toBe(false);
    expect(simpleModeRouteRequiresExpert('/graveyard')).toBe(false);
    expect(simpleModeRouteRequiresExpert('/profile')).toBe(false);
    expect(simpleModeRouteRequiresExpert('/live')).toBe(false);
    expect(simpleModeRouteRequiresExpert('/world', '?resident=res%3Ahans')).toBe(false);
    expect(simpleModeRouteRequiresExpert('/world', '?observe=res%3Ahans')).toBe(false);
  });
});

describe('sortSoulProposalsForFunding', () => {
  function proposal(input: Partial<SoulProposal> & Pick<SoulProposal, 'id' | 'displayName' | 'attentionThreshold' | 'contributedAttention' | 'status'>): SoulProposal {
    return {
      proposerCityUserId: 'user-1',
      residentName: input.displayName.toLowerCase(),
      goal: 'Goal',
      personality: '',
      vices: '',
      virtues: '',
      fears: '',
      voice: '',
      firstMemory: '',
      secret: '',
      appearance: {},
      startingLevels: {},
      startingEquipment: [],
      startingInventory: [],
      quote: { threshold: input.attentionThreshold, breakdown: { base: 0, levels: 0, equipment: 0, inventory: 0, complexity: 0 } },
      createdAt: input.createdAt || '2026-01-01T00:00:00.000Z',
      updatedAt: input.updatedAt || '2026-01-01T00:00:00.000Z',
      ...input,
    };
  }

  test('puts threshold-crossed and nearly-funded souls first', () => {
    const sorted = sortSoulProposalsForFunding([
      proposal({ id: 'new', displayName: 'New Idea', status: 'submitted', attentionThreshold: 100, contributedAttention: 20, updatedAt: '2026-01-03T00:00:00.000Z' }),
      proposal({ id: 'nearly', displayName: 'Nearly Ready', status: 'funding', attentionThreshold: 100, contributedAttention: 90, updatedAt: '2026-01-01T00:00:00.000Z' }),
      proposal({ id: 'ready', displayName: 'Ready Soul', status: 'ready_to_birth', attentionThreshold: 100, contributedAttention: 100, updatedAt: '2026-01-02T00:00:00.000Z' }),
    ]);

    expect(sorted.map(item => item.id)).toEqual(['ready', 'nearly', 'new']);
  });
});

describe('sortResidentsForAttention', () => {
  function resident(input: Partial<ResidentDashboardRow> & Pick<ResidentDashboardRow, 'name'>): ResidentDashboardRow {
    return {
      name: input.name,
      online: input.online ?? false,
      attention: input.attention,
    } as ResidentDashboardRow;
  }

  test('puts lowest-attention residents first for simple support decisions', () => {
    const sorted = sortResidentsForAttention([
      resident({ name: 'Steady', online: true, attention: 20 }),
      resident({ name: 'Unknown', online: true }),
      resident({ name: 'Critical', online: false, attention: 0 }),
      resident({ name: 'Low', online: true, attention: 2 }),
    ]);

    expect(sorted.map(item => item.name)).toEqual(['Critical', 'Low', 'Steady', 'Unknown']);
  });
});

describe('residentSupportReason', () => {
  function resident(input: Partial<ResidentDashboardRow> & Pick<ResidentDashboardRow, 'name'>): ResidentDashboardRow {
    return {
      name: input.name,
      online: input.online ?? false,
      attention: input.attention,
    } as ResidentDashboardRow;
  }

  test('explains why low-attention residents are the first support target', () => {
    expect(residentSupportReason(resident({ name: 'Hans', online: true, attention: 2 }))).toEqual({
      label: 'Needs attention',
      detail: 'Attention is running low; support helps keep this resident active.',
      tone: 'warn',
      action: 'Give attention',
    });
  });

  test('gives non-urgent residents a human reason without expert terms', () => {
    expect(residentSupportReason(resident({ name: 'Ada', online: true, attention: 40 }))).toEqual({
      label: 'Online now',
      detail: 'Watch live, then support if their goal matters to you.',
      tone: 'teal',
      action: 'Open resident',
    });
    expect(residentSupportReason(resident({ name: 'Pip', online: false, attention: 16 })).detail).not.toMatch(/\b(AP|GP|debug|ops|controller|backend|snapshot)\b/i);
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

describe('residentAttentionPreview', () => {
  test('previews typed Onions as attention toward the suggested safe support target', () => {
    expect(residentAttentionPreview({
      residentName: 'Ada',
      currentAttention: 40,
      onionAmount: '100',
      suggestedSafeSupportAmount: 100,
      walletBalance: 250,
    })).toEqual({
      currentAmount: 40,
      onionAmount: 100,
      projectedAmount: 140,
      targetAmount: 140,
      percentBefore: 29,
      percentAfter: 100,
      copy: '100 Onions will give Ada about 100 attention.',
      buttonLabel: 'Give 100 Onions',
      exceedsWallet: false,
    });
  });

  test('uses a projected fallback target and marks wallet overages', () => {
    expect(residentAttentionPreview({
      residentName: 'Hans',
      currentAttention: 25,
      onionAmount: '75',
      suggestedSafeSupportAmount: 0,
      walletBalance: 50,
    })).toMatchObject({
      currentAmount: 25,
      onionAmount: 75,
      projectedAmount: 100,
      targetAmount: 100,
      percentBefore: 25,
      percentAfter: 100,
      copy: '75 Onions will give Hans about 75 attention.',
      buttonLabel: 'Give 75 Onions',
      exceedsWallet: true,
    });
  });

  test('accepts comma-formatted Onion amounts the same way the submit flow does', () => {
    expect(residentAttentionPreview({
      residentName: 'Ada',
      currentAttention: 10,
      onionAmount: '1,000',
      suggestedSafeSupportAmount: 1000,
      walletBalance: 1200,
    })).toMatchObject({
      onionAmount: 1000,
      projectedAmount: 1010,
      copy: '1,000 Onions will give Ada about 1,000 attention.',
      buttonLabel: 'Give 1,000 Onions',
      exceedsWallet: false,
    });
  });

  test('keeps empty amounts human-facing and avoids a zero-width progress target', () => {
    expect(residentAttentionPreview({
      residentName: 'Ada',
      currentAttention: 0,
      onionAmount: '',
      suggestedSafeSupportAmount: 0,
    })).toEqual({
      currentAmount: 0,
      onionAmount: 0,
      projectedAmount: 0,
      targetAmount: 1,
      percentBefore: 0,
      percentAfter: 0,
      copy: 'Choose how many Onions to give Ada.',
      buttonLabel: 'Choose Onions',
      exceedsWallet: false,
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

  test('uses actual before and after attention when the city returns them', () => {
    expect(residentAttentionResultNotice({
      residentName: 'Hans',
      onionAmount: 75,
      status: 'settled',
      onionRequestStatus: 'completed',
      creditedAmount: 75,
      attentionBefore: 4,
      attentionAfter: 79,
    })).toBe('You gave Hans 75 Onions. Their attention rose from 4 to 79.');
  });

  test('keeps before and after attention authoritative when credited amount differs from the Onion amount', () => {
    expect(residentAttentionResultNotice({
      residentName: 'Hans',
      onionAmount: 100,
      status: 'settled',
      onionRequestStatus: 'completed',
      creditedAmount: 75,
      attentionBefore: 4,
      attentionAfter: 79,
    })).toBe('You gave Hans 100 Onions. Their attention rose from 4 to 79.');
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
