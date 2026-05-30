export interface PublicPatronStanding {
  faction: string;
  points: number;
  tier?: string;
  nextTier?: string;
  pointsToNext?: number;
}

export interface PublicPatronLetter {
  subject: string;
  at?: string;
}

export interface PublicPatronResident {
  slug: string;
  displayName: string;
}

export interface PublicPatronProfile {
  human: string;
  displayName: string;
  apBalance: number;
  currencyLabel: string;
  legacyCurrencyLabel?: string;
  standing: PublicPatronStanding;
  letterCount: number;
  latestLetter?: PublicPatronLetter;
  residentCount: number;
  residents: PublicPatronResident[];
}

export function publicPatronHandleFromSearch(search: string): string {
  const normalized = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(normalized).get('human')?.trim() || '';
}

export async function fetchPublicPatronProfile(human: string): Promise<PublicPatronProfile> {
  const handle = human.trim();
  const encoded = encodeURIComponent(handle);
  const [balance, standing, inbox, residents] = await Promise.all([
    requestRecord(`/v1/patron/balance?human=${encoded}`),
    requestRecord(`/v1/patron/standing?human=${encoded}`),
    requestRecord(`/v1/inbox?human=${encoded}`),
    requestRecord(`/v1/patron/residents?human=${encoded}`),
  ]);
  const rawLetters = Array.isArray(inbox.letters) ? inbox.letters : [];
  const rawResidents = Array.isArray(residents.residents) ? residents.residents : [];
  const currency = stringField(balance, 'currency') || 'AP';
  const tier = stringField(standing, 'tier');
  const next = stringField(standing, 'nextTier');
  const pointsToNext = numberField(standing, 'pointsToNext');
  const publicStanding: PublicPatronStanding = {
    faction: stringField(standing, 'faction') || 'embassy',
    points: numberField(standing, 'points') ?? 0,
  };
  if (tier) publicStanding.tier = tier;
  if (next) publicStanding.nextTier = next;
  if (pointsToNext !== undefined) publicStanding.pointsToNext = pointsToNext;
  const newestLetter = latestLetter(rawLetters);

  const profile: PublicPatronProfile = {
    human: stringField(balance, 'human') || handle,
    displayName: displayNameForHandle(handle),
    apBalance: numberField(balance, 'balance') ?? 0,
    currencyLabel: currency.toLowerCase() === 'shards' ? 'AP' : currency,
    standing: publicStanding,
    letterCount: rawLetters.length,
    residentCount: numberField(residents, 'total') ?? rawResidents.length,
    residents: rawResidents.map(publicResident).filter((resident): resident is PublicPatronResident => Boolean(resident)),
  };
  if (currency.toLowerCase() === 'shards') profile.legacyCurrencyLabel = currency;
  if (newestLetter) profile.latestLetter = newestLetter;
  return profile;
}

export function publicPatronInitials(profile: Pick<PublicPatronProfile, 'displayName' | 'human'>): string {
  const source = profile.displayName || profile.human;
  const words = source.replace(/[@._-]+/g, ' ').split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map(word => word[0]?.toUpperCase()).join('');
  return initials || 'AP';
}

export function publicPatronStandingLabel(profile: Pick<PublicPatronProfile, 'standing'>): string {
  return `${profile.standing.tier || 'stranger'} in ${profile.standing.faction}`;
}

async function requestRecord(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(path, { headers: { accept: 'application/json' } });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : {};
  if (!response.ok) {
    const record = asRecord(payload);
    throw new Error(stringField(record, 'error') || `${response.status} ${response.statusText}`);
  }
  return asRecord(payload);
}

function latestLetter(values: unknown[]): PublicPatronLetter | undefined {
  return values
    .map(value => {
      const record = asRecord(value);
      const subject = stringField(record, 'subject') || stringField(record, 'title') || 'Untitled letter';
      const at =
        stringField(record, 'createdAt') ||
        stringField(record, 'dispatchedAt') ||
        stringField(record, 'generatedAt') ||
        stringField(record, 'ts') ||
        stringField(record, 'date');
      return at ? { subject, at } : { subject };
    })
    .sort((a, b) => timestampMs(b.at) - timestampMs(a.at))[0];
}

function publicResident(value: unknown): PublicPatronResident | undefined {
  const record = asRecord(value);
  const slug = stringField(record, 'slug') || stringField(record, 'resident') || stringField(record, 'id');
  if (!slug) return undefined;
  return {
    slug,
    displayName: stringField(record, 'displayName') || stringField(record, 'residentName') || humanize(slug),
  };
}

function displayNameForHandle(handle: string): string {
  const trimmed = handle.trim();
  if (!trimmed) return 'Guest patron';
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

function humanize(value: string): string {
  return value.replace(/^res[:-]?/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, match => match.toUpperCase());
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function timestampMs(value: string | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}
