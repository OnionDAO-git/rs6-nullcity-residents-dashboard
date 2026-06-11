import { describe, expect, test } from 'bun:test';
import { fetchPublicSoulLives, mergePublicSoulLives } from './soul-library';

const graveyardPayload = {
  deceased: [
    {
      slug: 'res-hans',
      displayName: 'Hans',
      cause: 'attention_collapse',
      diedAt: '2026-06-01T12:00:00.000Z',
      livedTicks: 4200,
      epitaph: 'He greeted every stranger by name.',
    },
    {
      slug: 'res-pip',
      displayName: 'Pip',
      cause: 'unknown',
      diedAt: '2026-06-02T08:00:00.000Z',
      livedTicks: 90,
    },
  ],
  total: 2,
};

const libraryPayload = {
  residents: [
    {
      slug: 'res-hans',
      displayName: 'Hans',
      currentState: 'deceased',
      livesCount: 1,
      epithet: 'the Greeter',
      patronHandles: ['@ada'],
      currentWants: ['welcome every visitor'],
      lastUpdated: '2026-06-01T12:00:00.000Z',
    },
    {
      slug: 'res-fern',
      displayName: 'Fern',
      currentState: 'living',
      livesCount: 1,
      topQuote: 'The river keeps no secrets.',
      patronHandles: [],
      currentWants: ['map the river'],
      lastUpdated: '2026-06-10T10:00:00.000Z',
    },
  ],
  total: 2,
};

describe('mergePublicSoulLives', () => {
  test('maps public graveyard entries onto the LibrarySoulLife rendering shape', () => {
    const lives = mergePublicSoulLives(graveyardPayload, libraryPayload);
    const hans = lives.find(life => life.id === 'res-hans');

    expect(hans).toBeDefined();
    expect(hans?.nullcityResidentId).toBe('res:hans');
    expect(hans?.diedAt).toBe('2026-06-01T12:00:00.000Z');
    expect(hans?.epitaph).toBe('He greeted every stranger by name.');
    expect(hans?.displayName).toBe('Hans');
    expect(hans?.deathCause).toBe('attention collapse');
    expect(hans?.meaningfulEvents).toEqual([]);
  });

  test('keeps deceased residents readable when no epitaph exists', () => {
    const lives = mergePublicSoulLives(graveyardPayload, libraryPayload);
    const pip = lives.find(life => life.id === 'res-pip');

    expect(pip).toBeDefined();
    expect(pip?.epitaph).toBeUndefined();
    expect(pip?.diedAt).toBe('2026-06-02T08:00:00.000Z');
    // 'unknown' cause is not surfaced as a fake story line.
    expect(pip?.deathCause).toBeUndefined();
  });

  test('enriches deceased entries with library story lines when present', () => {
    const lives = mergePublicSoulLives(graveyardPayload, libraryPayload);
    const hans = lives.find(life => life.id === 'res-hans');

    expect(hans?.goalSummary).toBe('the Greeter');
  });

  test('includes living library residents without inventing a death date', () => {
    const lives = mergePublicSoulLives(graveyardPayload, libraryPayload);
    const fern = lives.find(life => life.id === 'res-fern');

    expect(fern).toBeDefined();
    expect(fern?.diedAt).toBeUndefined();
    expect(fern?.nullcityResidentId).toBe('res:fern');
    expect(fern?.goalSummary).toBe('The river keeps no secrets.');
  });

  test('returns an empty list when both payloads are missing or malformed', () => {
    expect(mergePublicSoulLives(undefined, undefined)).toEqual([]);
    expect(mergePublicSoulLives({ deceased: 'nope' }, { residents: 42 })).toEqual([]);
  });
});

describe('fetchPublicSoulLives', () => {
  test('reads /v1/graveyard and /v1/library through the BFF', async () => {
    const requested: string[] = [];
    const fetcher = (async (input: URL | RequestInfo) => {
      const path = String(input);
      requested.push(path);
      const body = path.includes('graveyard') ? graveyardPayload : libraryPayload;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;

    const { lives } = await fetchPublicSoulLives(fetcher);

    expect(requested).toEqual(['/v1/graveyard', '/v1/library']);
    expect(lives.filter(life => Boolean(life.diedAt))).toHaveLength(2);
    expect(lives).toHaveLength(3);
  });

  test('degrades to an empty page instead of throwing when the endpoints are down', async () => {
    const fetcher = (async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;

    const { lives } = await fetchPublicSoulLives(fetcher);

    expect(lives).toEqual([]);
  });
});
