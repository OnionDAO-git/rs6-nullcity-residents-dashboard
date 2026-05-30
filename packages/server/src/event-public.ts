import fs from 'node:fs/promises';
import path from 'node:path';
import type { DashboardConfig } from './config';
import type { RuntimeRepository } from './runtime';
import { asRecord, jsonResponse, listFiles, pathExists, readJsonFile, readJsonl, residentSlug } from './util';

const CURRENCY_NAME = 'Shards';
const DAILY_CHECK_IN_SHARDS = 1;
const STANDING_TIERS = [
  { name: 'stranger', minPoints: 0 },
  { name: 'acquaintance', minPoints: 10 },
  { name: 'ally', minPoints: 30 },
  { name: 'officer', minPoints: 75 },
] as const;

type PublicRouteContext = {
  config: DashboardConfig;
  runtime: RuntimeRepository;
};

export async function routePublicEventApi(request: Request, url: URL, context: PublicRouteContext): Promise<Response | undefined> {
  if (!url.pathname.startsWith('/v1/')) return undefined;
  if (request.method !== 'GET') return jsonResponse({ error: `Method ${request.method} not allowed` }, { status: 405 });

  const memoryRoot = context.config.memoryRoot;
  if (url.pathname === '/v1/inbox') return routeInbox(url, memoryRoot);
  if (url.pathname === '/v1/wall/snapshot') return routeWall(url, context);
  if (url.pathname === '/v1/graveyard') return routeGraveyard(memoryRoot);
  if (url.pathname === '/v1/library') return routeLibrary(memoryRoot);
  if (url.pathname === '/v1/patron/balance') return routePatronBalance(url, memoryRoot);
  if (url.pathname === '/v1/patron/standing') return routePatronStanding(url, memoryRoot);
  if (url.pathname === '/v1/patron/checkin') return routePatronCheckIn(url, memoryRoot);
  if (url.pathname === '/v1/patron/residents') return routePatronResidents(url, memoryRoot);
  if (url.pathname === '/v1/health') return routeHealth(context.config);
  return jsonResponse({ error: 'Not Found' }, { status: 404 });
}

async function routeInbox(url: URL, memoryRoot: string): Promise<Response> {
  const human = requiredHuman(url);
  if (!human) return missingHuman();
  return jsonResponse({ letters: await readInbox(memoryRoot, human) });
}

async function routeWall(url: URL, context: PublicRouteContext): Promise<Response> {
  const limit = numberParam(url.searchParams.get('limit'), 40);
  const [recentLetters, library, graveyard, stockpiles] = await Promise.all([
    context.runtime.recentLetters(limit),
    readLibraryEntries(context.config.memoryRoot),
    readGraveyardEntries(context.config.memoryRoot),
    readFactionStockpiles(context.config.memoryRoot),
  ]);
  const publicLetters = recentLetters.filter(letter => !isSyntheticLetter(letter));
  return jsonResponse({
    recentLetters: publicLetters,
    letters: publicLetters,
    residents: library
      .filter(entry => !isSyntheticSlug(entry.slug))
      .map(entry => ({
        slug: entry.slug,
        displayName: entry.displayName,
        alive: entry.currentState !== 'deceased',
        factionId: entry.factionId,
        factionDisplayName: entry.factionDisplayName,
        factionColor: entry.factionColor,
        activeGoal: entry.currentWants[0],
        arcPhase: entry.arcPhase,
      })),
    factionStockpiles: stockpiles,
    deathsToday: graveyard.filter(entry => isToday(entry.diedAt)).length,
    asOf: new Date().toISOString(),
  });
}

async function routeGraveyard(memoryRoot: string): Promise<Response> {
  const deceased = await readGraveyardEntries(memoryRoot);
  return jsonResponse({ deceased, total: deceased.length, asOf: new Date().toISOString() });
}

async function routeLibrary(memoryRoot: string): Promise<Response> {
  const residents = (await readLibraryEntries(memoryRoot)).filter(entry => !isSyntheticSlug(entry.slug));
  return jsonResponse({ residents, total: residents.length, asOf: new Date().toISOString() });
}

async function routePatronBalance(url: URL, memoryRoot: string): Promise<Response> {
  const human = requiredHuman(url);
  if (!human) return missingHuman();
  const currency = await readJsonFile<unknown>(path.join(memoryRoot, 'patron-currency.json'));
  return jsonResponse({ human, balance: numberField(asRecord(asRecord(currency).balances), human) ?? 0, currency: CURRENCY_NAME });
}

async function routePatronStanding(url: URL, memoryRoot: string): Promise<Response> {
  const human = requiredHuman(url);
  if (!human) return missingHuman();
  const faction = url.searchParams.get('faction') || 'embassy';
  const standing = await readJsonFile<unknown>(path.join(memoryRoot, 'patron-standing.json'));
  const points = numberField(asRecord(asRecord(standing).points), `${human}|${faction}`) ?? 0;
  const tier = tierForPoints(points);
  const next = nextTier(points);
  const tierMin = STANDING_TIERS.find(entry => entry.name === tier)?.minPoints ?? 0;
  return jsonResponse({
    human,
    faction,
    points,
    tier: tier === 'stranger' ? null : tier,
    tierMin,
    nextTier: next?.name ?? null,
    pointsToNext: next ? next.minPoints - points : null,
  });
}

async function routePatronCheckIn(url: URL, memoryRoot: string): Promise<Response> {
  const human = requiredHuman(url);
  if (!human) return missingHuman();

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const currencyPath = path.join(memoryRoot, 'patron-currency.json');
  const checkInPath = path.join(memoryRoot, 'patron-check-in.json');
  const currency = normalizeCurrencySnapshot(await readJsonFile<unknown>(currencyPath));
  const checkIn = normalizeCheckInSnapshot(await readJsonFile<unknown>(checkInPath));
  const dates = new Set(checkIn.checkInDates[human] || []);

  if (dates.has(today)) {
    return jsonResponse({
      result: 'already_checked_in',
      shards_earned: 0,
      new_balance: currency.balances[human] ?? 0,
      currency: CURRENCY_NAME,
    });
  }

  currency.balances[human] = (currency.balances[human] ?? 0) + DAILY_CHECK_IN_SHARDS;
  currency.history[human] = [
    ...(currency.history[human] || []),
    { kind: 'credit', amount: DAILY_CHECK_IN_SHARDS, reason: 'daily-check-in', ts: now },
  ];
  dates.add(today);
  checkIn.checkInDates[human] = [...dates].sort();

  await writeJsonAtomic(currencyPath, currency);
  await writeJsonAtomic(checkInPath, checkIn);

  return jsonResponse({
    result: 'checked_in',
    shards_earned: DAILY_CHECK_IN_SHARDS,
    new_balance: currency.balances[human],
    currency: CURRENCY_NAME,
  });
}

async function routePatronResidents(url: URL, memoryRoot: string): Promise<Response> {
  const human = requiredHuman(url);
  if (!human) return missingHuman();
  const lower = human.toLowerCase();
  const residents = (await readLibraryEntries(memoryRoot)).filter(entry => entry.patronHandles.some(handle => handle.toLowerCase() === lower));
  return jsonResponse({ residents, total: residents.length, asOf: new Date().toISOString() });
}

async function routeHealth(config: DashboardConfig): Promise<Response> {
  const [memory, souls] = await Promise.all([pathExists(config.memoryRoot), pathExists(config.soulsRoot)]);
  const ok = memory || souls;
  return jsonResponse(
    {
      ok,
      controller: ok ? 'ok' : 'unavailable',
      roots: { memory: config.memoryRoot, souls: config.soulsRoot },
    },
    { status: ok ? 200 : 503 },
  );
}

async function readInbox(memoryRoot: string, human: string): Promise<unknown[]> {
  return readJsonl(path.join(memoryRoot, 'data', 'letters', handleSlug(human), 'inbox.jsonl'), Number.MAX_SAFE_INTEGER);
}

async function readLibraryEntries(memoryRoot: string): Promise<LibraryEntry[]> {
  const libraryRoot = path.join(memoryRoot, 'library');
  const files = (await listFiles(libraryRoot, ['portrait.json'])).filter(file => path.basename(file) === 'portrait.json');
  const entries = await Promise.all(
    files.map(async (file): Promise<LibraryEntry | undefined> => {
      const slug = file.split(/[\\/]/)[0] || '';
      if (!slug.startsWith('res-')) return undefined;
      const portrait = asRecord(await readJsonFile<unknown>(path.join(libraryRoot, file)));
      if (Object.keys(portrait).length === 0) return undefined;
      const currentState = stringField(portrait, 'currentState');
      const livesCount = numberValue(portrait.livesCount) ?? (Array.isArray(portrait.lives) ? portrait.lives.length : 1);
      const entry: LibraryEntry = {
        slug,
        displayName: stringField(portrait, 'residentName') || humanizeName(slug),
        currentState: normalizeLibraryState(currentState, livesCount),
        livesCount,
        patronHandles: patronHandles(portrait),
        currentWants: arrayStrings(asRecord(portrait.wants).current).slice(0, 3),
        lastUpdated: stringField(asRecord(portrait.lastUpdated), 'ts') || stringField(portrait, 'updatedAt') || '',
      };
      const factionId = stringField(portrait, 'factionId');
      const factionDisplayName = stringField(portrait, 'factionDisplayName');
      const factionColor = stringField(portrait, 'factionColor');
      const epithet = stringField(portrait, 'epithet');
      const arcPhase = stringField(asRecord(portrait.storyArc), 'phase');
      const quote = topQuote(portrait);
      if (factionId) entry.factionId = factionId;
      if (factionDisplayName) entry.factionDisplayName = factionDisplayName;
      if (factionColor) entry.factionColor = factionColor;
      if (epithet) entry.epithet = epithet;
      if (arcPhase) entry.arcPhase = arcPhase;
      if (quote) entry.topQuote = quote;
      return entry;
    }),
  );
  return entries
    .filter((entry): entry is LibraryEntry => Boolean(entry))
    .sort((a, b) => libraryStateRank(a.currentState) - libraryStateRank(b.currentState) || a.displayName.localeCompare(b.displayName));
}

async function readGraveyardEntries(memoryRoot: string): Promise<GraveyardEntry[]> {
  const runtimeFiles = (await listFiles(memoryRoot, ['runtime-state.json'])).filter(file => path.basename(file) === 'runtime-state.json');
  const entries = await Promise.all(
    runtimeFiles.map(async (file): Promise<GraveyardEntry | undefined> => {
      const slug = file.split(/[\\/]/)[0] || '';
      if (!slug.startsWith('res-')) return undefined;
      const state = asRecord(await readJsonFile<unknown>(path.join(memoryRoot, file)));
      const deceased = asRecord(state.deceased);
      const diedAt = stringField(deceased, 'date');
      if (!diedAt) return undefined;
      const libraryEntry = (await readLibraryEntry(memoryRoot, slug)) || {};
      const entry: GraveyardEntry = {
        slug,
        displayName: stringField(libraryEntry, 'displayName') || humanizeName(slug),
        cause: stringField(deceased, 'cause') || 'unknown',
        diedAt,
        livedTicks: numberValue(state.tick) ?? 0,
      };
      const factionId = stringField(libraryEntry, 'factionId');
      const factionDisplayName = stringField(libraryEntry, 'factionDisplayName');
      const factionColor = stringField(libraryEntry, 'factionColor');
      const epitaph = await readOptionalText(path.join(memoryRoot, 'library', slug, 'prepared-epitaph.txt'));
      if (factionId) entry.factionId = factionId;
      if (factionDisplayName) entry.factionDisplayName = factionDisplayName;
      if (factionColor) entry.factionColor = factionColor;
      if (epitaph) entry.epitaph = epitaph;
      return entry;
    }),
  );
  return entries
    .filter((entry): entry is GraveyardEntry => Boolean(entry))
    .sort((a, b) => timestampMs(b.diedAt) - timestampMs(a.diedAt));
}

async function readLibraryEntry(memoryRoot: string, slug: string): Promise<Record<string, unknown> | undefined> {
  const entries = await readLibraryEntries(memoryRoot);
  return entries.find(entry => entry.slug === slug) as unknown as Record<string, unknown> | undefined;
}

async function readFactionStockpiles(memoryRoot: string): Promise<unknown[]> {
  const stockpile = await readJsonFile<unknown>(path.join(memoryRoot, 'faction-stockpile.json'));
  const resources = asRecord(stockpile).resources;
  if (!resources || typeof resources !== 'object') return [];
  return Object.entries(resources as Record<string, unknown>).map(([factionId, raw]) => {
    const values = asRecord(raw);
    const entries = Object.entries(values).map(([resource, amount]) => ({ resource, amount: numberValue(amount) ?? 0 }));
    return {
      factionId,
      factionDisplayName: humanizeName(factionId),
      factionColor: undefined,
      total: entries.reduce((sum, entry) => sum + entry.amount, 0),
      resources: entries,
    };
  });
}

function requiredHuman(url: URL): string | undefined {
  const human = url.searchParams.get('human')?.trim();
  return human || undefined;
}

function missingHuman(): Response {
  return jsonResponse({ error: 'Query parameter `human` is required' }, { status: 400 });
}

function handleSlug(handle: string): string {
  return handle
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeCurrencySnapshot(raw: unknown): { schemaVersion: 1; balances: Record<string, number>; history: Record<string, unknown[]> } {
  const record = asRecord(raw);
  return {
    schemaVersion: 1,
    balances: numberRecord(record.balances),
    history: historyRecord(record.history),
  };
}

function normalizeCheckInSnapshot(raw: unknown): { schemaVersion: 1; checkInDates: Record<string, string[]>; referralCredited: Record<string, string> } {
  const record = asRecord(raw);
  const checkInDates: Record<string, string[]> = {};
  for (const [handle, dates] of Object.entries(asRecord(record.checkInDates))) {
    checkInDates[handle] = arrayStrings(dates);
  }
  const referralCredited: Record<string, string> = {};
  for (const [handle, referrer] of Object.entries(asRecord(record.referralCredited))) {
    if (typeof referrer === 'string') referralCredited[handle] = referrer;
  }
  return { schemaVersion: 1, checkInDates, referralCredited };
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tempPath, filePath);
}

async function readOptionalText(filePath: string): Promise<string | undefined> {
  try {
    const text = (await fs.readFile(filePath, 'utf8')).trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  return numberValue(record[key]);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function numberRecord(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(asRecord(value))) {
    const number = numberValue(raw);
    if (number !== undefined) out[key] = number;
  }
  return out;
}

function historyRecord(value: unknown): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const [key, raw] of Object.entries(asRecord(value))) {
    out[key] = Array.isArray(raw) ? raw : [];
  }
  return out;
}

function arrayStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function patronHandles(portrait: Record<string, unknown>): string[] {
  return Array.isArray(portrait.patrons)
    ? portrait.patrons.flatMap(patron => {
        const handle = stringField(asRecord(patron), 'handle');
        return handle && handle !== 'anonymous' ? [handle] : [];
      })
    : [];
}

function topQuote(portrait: Record<string, unknown>): string | undefined {
  const quotes = Array.isArray(asRecord(portrait.voice).quotes) ? (asRecord(portrait.voice).quotes as unknown[]) : [];
  const first = quotes.find(quote => stringField(asRecord(quote), 'tag') === 'first') ?? quotes[0];
  return first ? stringField(asRecord(first), 'text') : undefined;
}

function normalizeLibraryState(value: string | undefined, livesCount: number): LibraryEntry['currentState'] {
  if (value === 'deceased' || value === 'ended') return 'deceased';
  if (value === 'reborn' || livesCount > 1) return 'reborn';
  return 'living';
}

function tierForPoints(points: number): (typeof STANDING_TIERS)[number]['name'] {
  let current: (typeof STANDING_TIERS)[number]['name'] = 'stranger';
  for (const tier of STANDING_TIERS) {
    if (points >= tier.minPoints) current = tier.name;
  }
  return current;
}

function nextTier(points: number): (typeof STANDING_TIERS)[number] | undefined {
  return STANDING_TIERS.find(tier => tier.minPoints > points && tier.name !== 'stranger');
}

function humanizeName(value: string): string {
  return value
    .replace(/^res[:-]?/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function libraryStateRank(state: LibraryEntry['currentState']): number {
  if (state === 'living') return 0;
  if (state === 'reborn') return 1;
  return 2;
}

function timestampMs(value: string | undefined): number {
  const time = value ? Date.parse(value) : 0;
  return Number.isFinite(time) ? time : 0;
}

function numberParam(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 500) : fallback;
}

function isToday(iso: string): boolean {
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function isSyntheticSlug(slug: string): boolean {
  return /^res-(qa-|bench-|test-|tmp-|synthetic-)/i.test(residentSlug(slug));
}

function isSyntheticLetter(letter: unknown): boolean {
  const senderResident = stringField(asRecord(letter), 'senderResident');
  return senderResident ? isSyntheticSlug(senderResident) : false;
}

interface LibraryEntry {
  slug: string;
  displayName: string;
  factionId?: string;
  factionDisplayName?: string;
  factionColor?: string;
  currentState: 'living' | 'deceased' | 'reborn';
  livesCount: number;
  epithet?: string;
  arcPhase?: string;
  topQuote?: string;
  patronHandles: string[];
  currentWants: string[];
  lastUpdated: string;
}

interface GraveyardEntry {
  slug: string;
  displayName: string;
  factionId?: string;
  factionDisplayName?: string;
  factionColor?: string;
  cause: string;
  diedAt: string;
  livedTicks: number;
  epitaph?: string;
}
