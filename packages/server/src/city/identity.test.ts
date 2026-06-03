import { describe, expect, test } from 'bun:test';
import { InMemoryCityStore } from './memory-store';
import { createInMemoryCityStore } from './store';
import { cityMigrations } from './migrations/schema';
import type { LandingSessionUser } from './types';

const landingUser: LandingSessionUser = {
  id: 'landing-user-1',
  email: 'alice@example.com',
  name: 'Alice Example',
  handle: 'alice',
  avatarUrl: null,
  isAdmin: false,
  profileClaimed: true,
};

describe('resolveOnionId (personId === landing users.id)', () => {
  test('returns the landing_user_id for a known cityUserId', async () => {
    const store = new InMemoryCityStore({ now: () => '2026-06-03T00:00:00.000Z', id: () => 'city-user-1' });
    const cityUser = await store.upsertUserFromLanding(landingUser);
    expect(await store.resolveOnionId(cityUser.id)).toBe('landing-user-1');
  });

  test('throws 404 for an unknown cityUserId', async () => {
    const store = new InMemoryCityStore();
    await expect(store.resolveOnionId('missing')).rejects.toMatchObject({ status: 404 });
  });

  test('factory store also resolves the personId', async () => {
    const store = createInMemoryCityStore(() => new Date('2026-06-03T00:00:00.000Z'));
    const cityUser = await store.upsertUserFromLanding(landingUser);
    expect(await store.resolveOnionId(cityUser.id)).toBe('landing-user-1');
  });
});

describe('identity aliases (personId -> patronHandle)', () => {
  test('setIdentityAlias then resolvePatronHandle round-trips', async () => {
    const store = new InMemoryCityStore({ now: () => '2026-06-03T00:00:00.000Z', id: () => 'city-user-1' });
    await store.upsertUserFromLanding(landingUser);
    await store.setIdentityAlias('landing-user-1', 'alice');
    expect(await store.resolvePatronHandle('landing-user-1')).toBe('alice');
  });

  test('resolvePatronHandle returns undefined when no alias exists', async () => {
    expect(await new InMemoryCityStore().resolvePatronHandle('landing-user-1')).toBeUndefined();
  });

  test('setIdentityAlias upserts the handle', async () => {
    const store = new InMemoryCityStore({ now: () => '2026-06-03T00:00:00.000Z', id: () => 'city-user-1' });
    await store.upsertUserFromLanding(landingUser);
    await store.setIdentityAlias('landing-user-1', 'alice');
    await store.setIdentityAlias('landing-user-1', 'alice-2');
    expect(await store.resolvePatronHandle('landing-user-1')).toBe('alice-2');
  });

  test('factory store aliases round-trip', async () => {
    const store = createInMemoryCityStore(() => new Date('2026-06-03T00:00:00.000Z'));
    await store.setIdentityAlias('landing-user-1', 'alice');
    expect(await store.resolvePatronHandle('landing-user-1')).toBe('alice');
  });
});

describe('city_identity_aliases migration', () => {
  test('002 migration creates the table with person_id PK + unique handle', () => {
    const m = cityMigrations.find(x => x.id === '002_city_identity_aliases');
    expect(m).toBeDefined();
    expect(m!.sql).toContain('CREATE TABLE IF NOT EXISTS city_identity_aliases');
    expect(m!.sql).toContain('person_id TEXT PRIMARY KEY');
    expect(m!.sql).toContain('patron_handle TEXT NOT NULL');
    expect(m!.sql).toContain('idx_city_identity_aliases_handle');
  });
});
