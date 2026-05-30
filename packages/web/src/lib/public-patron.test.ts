import { afterEach, describe, expect, test } from 'bun:test';
import {
  fetchPublicPatronProfile,
  publicPatronHandleFromSearch,
  publicPatronInitials,
  publicPatronStandingLabel,
} from './public-patron';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('public patron profile', () => {
  test('parses the public human query parameter without treating blanks as handles', () => {
    expect(publicPatronHandleFromSearch('?human=demo%40onion')).toBe('demo@onion');
    expect(publicPatronHandleFromSearch('human=alice')).toBe('alice');
    expect(publicPatronHandleFromSearch('?human=')).toBe('');
    expect(publicPatronHandleFromSearch('?other=alice')).toBe('');
  });

  test('fetches balance, standing, inbox, and resident links from public event endpoints', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async input => {
      const path = String(input);
      calls.push(path);
      if (path.startsWith('/v1/patron/balance')) {
        return json({ human: 'demo@onion', balance: 12, currency: 'Shards' });
      }
      if (path.startsWith('/v1/patron/standing')) {
        return json({ human: 'demo@onion', faction: 'embassy', points: 35, tier: 'ally', nextTier: 'officer', pointsToNext: 40 });
      }
      if (path.startsWith('/v1/inbox')) {
        return json({
          letters: [
            { subject: 'A letter from Hans', createdAt: '2026-05-30T20:00:00.000Z' },
            { title: 'A second note', ts: '2026-05-30T20:03:00.000Z' },
            { subject: 'A dispatched note', dispatchedAt: '2026-05-30T20:04:00.000Z' },
          ],
        });
      }
      if (path.startsWith('/v1/patron/residents')) {
        return json({
          residents: [
            { slug: 'res-hans', displayName: 'Hans' },
            { slug: 'res-pip', displayName: 'Pip' },
          ],
          total: 2,
        });
      }
      return json({ error: 'not found' }, 404);
    }) as typeof fetch;

    const profile = await fetchPublicPatronProfile('demo@onion');

    expect(calls).toEqual([
      '/v1/patron/balance?human=demo%40onion',
      '/v1/patron/standing?human=demo%40onion',
      '/v1/inbox?human=demo%40onion',
      '/v1/patron/residents?human=demo%40onion',
    ]);
    expect(profile).toMatchObject({
      human: 'demo@onion',
      displayName: 'demo@onion',
      apBalance: 12,
      currencyLabel: 'AP',
      legacyCurrencyLabel: 'Shards',
      standing: { faction: 'embassy', points: 35, tier: 'ally', nextTier: 'officer', pointsToNext: 40 },
      letterCount: 3,
      residentCount: 2,
    });
    expect(profile.latestLetter).toEqual({ subject: 'A dispatched note', at: '2026-05-30T20:04:00.000Z' });
    expect(profile.residents.map(resident => resident.displayName)).toEqual(['Hans', 'Pip']);
  });

  test('uses readable fallback labels when public ledgers are empty', async () => {
    globalThis.fetch = (async input => {
      const path = String(input);
      if (path.startsWith('/v1/patron/balance')) return json({ human: 'new-human', balance: 0, currency: 'AP' });
      if (path.startsWith('/v1/patron/standing')) return json({ human: 'new-human', faction: 'embassy', points: 0, tier: null });
      if (path.startsWith('/v1/inbox')) return json({ letters: [] });
      if (path.startsWith('/v1/patron/residents')) return json({ residents: [], total: 0 });
      return json({});
    }) as typeof fetch;

    const profile = await fetchPublicPatronProfile('new-human');

    expect(publicPatronInitials(profile)).toBe('NH');
    expect(publicPatronStandingLabel(profile)).toBe('stranger in embassy');
    expect(profile.latestLetter).toBeUndefined();
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
