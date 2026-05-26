import { describe, expect, test } from 'bun:test';
import type { RuntimeReadModel, SpectatorSession } from '@nullcity-dashboard/shared';
import { residentIsOnline } from './resident-status';

function runtime(online: boolean | undefined): RuntimeReadModel | undefined {
  if (online === undefined) return undefined;
  return { online } as RuntimeReadModel;
}

function session(overrides: Partial<SpectatorSession> = {}): SpectatorSession {
  return {
    id: 'session-1',
    subject: { kind: 'resident', name: 'res:agent' },
    mode: 'follow',
    connected: true,
    ...overrides,
  } as SpectatorSession;
}

describe('residentIsOnline', () => {
  test('uses a connected resident spectator session while runtime is still loading', () => {
    expect(residentIsOnline(undefined, session())).toBe(true);
  });

  test('keeps an explicit offline runtime offline even if a stale session exists', () => {
    expect(residentIsOnline(runtime(false), session())).toBe(false);
  });

  test('ignores connected non-resident sessions', () => {
    expect(residentIsOnline(undefined, session({ subject: { kind: 'player', username: 'newshell' } }))).toBe(false);
  });
});
