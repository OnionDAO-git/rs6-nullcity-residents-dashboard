/**
 * Public Soul Library data source.
 *
 * The Soul Library page (/graveyard) used to read `cityApi.library()`, which is
 * backed by a dashboard DB table that nothing writes yet. The controller's
 * public event endpoints (`/v1/graveyard` + `/v1/library`, served through the
 * BFF) carry the real remembered residents, so the page reads those instead and
 * maps them onto the existing `LibrarySoulLife` rendering shape.
 */
import type { LibrarySoulLife } from './city-api';

export interface PublicSoulLife extends LibrarySoulLife {
  displayName?: string;
}

export function mergePublicSoulLives(graveyardPayload: unknown, libraryPayload: unknown): PublicSoulLife[] {
  const deceased = arrayField(asRecord(graveyardPayload), 'deceased').map(mapGraveyardEntry).filter(isPresent);
  const residents = arrayField(asRecord(libraryPayload), 'residents').map(mapLibraryResident).filter(isPresent);
  const bySlug = new Map<string, ReturnType<typeof mapLibraryResident>>();
  for (const resident of residents) {
    if (resident) bySlug.set(resident.slug, resident);
  }

  const lives: PublicSoulLife[] = deceased.map(entry => {
    const libraryEntry = bySlug.get(entry.slug);
    if (libraryEntry) bySlug.delete(entry.slug);
    const displayName = entry.displayName || libraryEntry?.displayName;
    const goalSummary = libraryEntry?.goalSummary || entry.goalSummary;
    const life: PublicSoulLife = {
      id: entry.slug,
      nullcityResidentId: residentIdFromSlug(entry.slug),
      diedAt: entry.diedAt,
      meaningfulEvents: [],
      createdAt: entry.diedAt,
      updatedAt: entry.diedAt,
    };
    if (displayName) life.displayName = displayName;
    if (entry.deathCause) life.deathCause = entry.deathCause;
    if (entry.epitaph) life.epitaph = entry.epitaph;
    if (goalSummary) life.goalSummary = goalSummary;
    return life;
  });

  for (const resident of bySlug.values()) {
    if (!resident) continue;
    const life: PublicSoulLife = {
      id: resident.slug,
      nullcityResidentId: residentIdFromSlug(resident.slug),
      meaningfulEvents: [],
      createdAt: resident.lastUpdated,
      updatedAt: resident.lastUpdated,
    };
    if (resident.displayName) life.displayName = resident.displayName;
    if (resident.goalSummary) life.goalSummary = resident.goalSummary;
    if (resident.deceased && resident.lastUpdated) life.diedAt = resident.lastUpdated;
    lives.push(life);
  }

  return lives;
}

export async function fetchPublicSoulLives(fetcher: typeof fetch = fetch): Promise<{ lives: PublicSoulLife[] }> {
  const [graveyardPayload, libraryPayload] = await Promise.all([
    readPublicJson(fetcher, '/v1/graveyard'),
    readPublicJson(fetcher, '/v1/library'),
  ]);
  return { lives: mergePublicSoulLives(graveyardPayload, libraryPayload) };
}

async function readPublicJson(fetcher: typeof fetch, path: string): Promise<unknown> {
  try {
    const response = await fetcher(path, { headers: { accept: 'application/json' } });
    if (!response.ok) return {};
    return await response.json();
  } catch {
    return {};
  }
}

interface GraveyardSource {
  slug: string;
  displayName?: string;
  deathCause?: string;
  diedAt: string;
  epitaph?: string;
  goalSummary?: string;
}

interface LibrarySource {
  slug: string;
  displayName?: string;
  deceased: boolean;
  goalSummary?: string;
  lastUpdated: string;
}

function mapGraveyardEntry(value: unknown): GraveyardSource | undefined {
  const record = asRecord(value);
  const slug = stringField(record, 'slug');
  const diedAt = stringField(record, 'diedAt');
  if (!slug || !diedAt) return undefined;
  const cause = stringField(record, 'cause');
  const meaningfulCause = cause && cause !== 'unknown' ? humanizeCause(cause) : undefined;
  const displayName = stringField(record, 'displayName');
  const epitaph = stringField(record, 'epitaph');
  const entry: GraveyardSource = { slug, diedAt };
  if (displayName) entry.displayName = displayName;
  if (meaningfulCause) {
    entry.deathCause = meaningfulCause;
    entry.goalSummary = `Died of ${meaningfulCause}.`;
  }
  if (epitaph) entry.epitaph = epitaph;
  return entry;
}

function mapLibraryResident(value: unknown): LibrarySource | undefined {
  const record = asRecord(value);
  const slug = stringField(record, 'slug');
  if (!slug) return undefined;
  const wants = Array.isArray(record.currentWants)
    ? record.currentWants.filter((want): want is string => typeof want === 'string' && Boolean(want.trim()))
    : [];
  const goalSummary = stringField(record, 'epithet') || stringField(record, 'topQuote') || wants[0];
  const displayName = stringField(record, 'displayName');
  const entry: LibrarySource = {
    slug,
    deceased: stringField(record, 'currentState') === 'deceased',
    lastUpdated: stringField(record, 'lastUpdated') || '',
  };
  if (displayName) entry.displayName = displayName;
  if (goalSummary) entry.goalSummary = goalSummary;
  return entry;
}

function residentIdFromSlug(slug: string): string {
  return slug.startsWith('res-') ? `res:${slug.slice(4)}` : slug;
}

function humanizeCause(cause: string): string {
  return cause.replace(/[_-]+/g, ' ').trim();
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function arrayField(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}
