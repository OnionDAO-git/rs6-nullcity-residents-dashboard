import { SQL } from 'bun';
import type { CityStore } from './store';
import type { CityUser, PointLedgerEntry } from './types';

type BunSql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
};

export type LandingCheckinKind = 'daily_checkin' | 'event_checkin';

export interface LandingCheckinAwardSource {
  kind: LandingCheckinKind;
  sourceId: string;
  landingUserId: string;
  occurredAt?: string;
  eventId?: string;
  eventName?: string;
}

export interface LandingCheckinReader {
  listAwardableCheckins(landingUserId: string): Promise<LandingCheckinAwardSource[]>;
}

export interface LandingCheckinSyncResult {
  ok: boolean;
  awarded: Array<{
    kind: LandingCheckinKind;
    sourceId: string;
    apAmount: number;
    ledger: PointLedgerEntry;
  }>;
  message?: string;
}

interface CheckinAwardRecorder {
  recordCheckinAwardSource(
    source: LandingCheckinAwardSource,
    cityUser: CityUser,
    ledger: PointLedgerEntry,
    apAmount: number,
  ): Promise<void>;
}

export class BunSqlLandingCheckinReader implements LandingCheckinReader {
  private readonly sql: BunSql;

  constructor(databaseUrl: string) {
    const SqlConstructor = SQL as unknown as new (url: string) => BunSql;
    this.sql = new SqlConstructor(databaseUrl);
  }

  async listAwardableCheckins(landingUserId: string): Promise<LandingCheckinAwardSource[]> {
    const dailyRows = await this.sql`
      SELECT
        d.id::text AS id,
        d.user_id::text AS landing_user_id,
        d.checked_in_at AS occurred_at
      FROM daily_checkins d
      WHERE d.user_id::text = ${landingUserId}
      ORDER BY d.checked_in_at ASC
    `;
    const eventRows = await this.sql`
      SELECT
        r.id::text AS id,
        r.user_id::text AS landing_user_id,
        r.checked_in_at AS occurred_at,
        r.event_id::text AS event_id,
        e.name AS event_name
      FROM event_registrations r
      JOIN events e ON e.id = r.event_id
      WHERE r.user_id::text = ${landingUserId}
        AND r.checked_in_at IS NOT NULL
      ORDER BY r.checked_in_at ASC
    `;
    return [
      ...dailyRows.map(row => mapLandingCheckin(row, 'daily_checkin')),
      ...eventRows.map(row => mapLandingCheckin(row, 'event_checkin')),
    ].sort((a, b) => (a.occurredAt || '').localeCompare(b.occurredAt || ''));
  }
}

export async function syncLandingCheckins(
  store: CityStore,
  cityUser: CityUser,
  reader: LandingCheckinReader | undefined,
): Promise<LandingCheckinSyncResult> {
  if (!reader) return { ok: false, awarded: [], message: 'landing_database_not_configured' };

  const sources = await reader.listAwardableCheckins(cityUser.landingUserId);
  const awarded: LandingCheckinSyncResult['awarded'] = [];
  for (const source of sources) {
    const apAmount = source.kind === 'daily_checkin' ? 100 : 500;
    const ledger = await store.appendPointLedger({
      cityUserId: cityUser.id,
      resource: 'AP',
      delta: apAmount,
      sourceType: source.kind,
      sourceId: source.sourceId,
      memo: source.kind === 'daily_checkin' ? 'Landing daily check-in' : `Landing event check-in: ${source.eventName || source.eventId || source.sourceId}`,
      metadata: {
        landingUserId: source.landingUserId,
        occurredAt: source.occurredAt,
        eventId: source.eventId,
        eventName: source.eventName,
      },
    });
    await (store as CityStore & Partial<CheckinAwardRecorder>).recordCheckinAwardSource?.(source, cityUser, ledger, apAmount);
    awarded.push({ kind: source.kind, sourceId: source.sourceId, apAmount, ledger });
  }
  return { ok: true, awarded };
}

function mapLandingCheckin(row: unknown, kind: LandingCheckinKind): LandingCheckinAwardSource {
  const record = row as Record<string, unknown>;
  return {
    kind,
    sourceId: String(record.id),
    landingUserId: String(record.landing_user_id),
    occurredAt: dateString(record.occurred_at),
    eventId: nullableString(record.event_id),
    eventName: nullableString(record.event_name),
  };
}

function nullableString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function dateString(value: unknown): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : String(value);
}
