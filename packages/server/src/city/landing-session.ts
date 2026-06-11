import { SQL } from 'bun';
import type { CityConfig } from './config';
import { parseCookieHeader } from './cookies';
import type { LandingSessionUser } from './types';

export type LandingAuthMode = 'disabled' | 'landing-db' | 'landing-api';

export interface LandingSessionReader {
  findUserBySessionToken(token: string): Promise<LandingSessionUser | null>;
}

export interface LandingSessionResult {
  mode: LandingAuthMode;
  user: LandingSessionUser | null;
  reason?: 'not_configured' | 'missing_cookie' | 'invalid_session';
  error?: string;
}

export interface LandingSessionAuthenticator {
  readonly mode: LandingAuthMode;
  authenticate(request: Request): Promise<LandingSessionResult>;
  loginUrl(requestUrl: URL): string;
}

type BunSql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
};

export class BunSqlLandingSessionReader implements LandingSessionReader {
  private readonly sql: BunSql;

  constructor(databaseUrl: string) {
    const SqlConstructor = SQL as unknown as new (url: string) => BunSql;
    this.sql = new SqlConstructor(databaseUrl);
  }

  async findUserBySessionToken(token: string): Promise<LandingSessionUser | null> {
    const rows = await this.sql`
      SELECT
        u.id,
        u.email,
        u.name,
        u.handle,
        u.avatar_url,
        u.is_admin,
        u.profile_claimed
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ${token}
        AND s.expires_at > now()
      LIMIT 1
    `;
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      email: String(row.email || ''),
      name: String(row.name || ''),
      handle: nullableString(row.handle),
      avatarUrl: nullableString(row.avatar_url),
      isAdmin: row.is_admin === true,
      profileClaimed: row.profile_claimed === true,
    };
  }
}

/**
 * Reads the landing session over HTTP instead of hitting landing's Postgres
 * directly. It forwards the attendee's `session` cookie to landing's
 * introspection endpoint (`GET <base>/api/public/session`, see
 * landing-2026/src/routes/api/public/session/+server.ts), which returns
 * `{ user: null }` (HTTP 200) for an absent/invalid/expired session and
 * `{ user: { id, email, name, handle, avatarUrl, isAdmin, isStaff } }` for a
 * valid one. This removes the cross-account DB dependency so landing never has
 * to expose `LANDING_DATABASE_URL` to the dashboard.
 *
 * The endpoint does NOT return `profile_claimed`; we default it to `false`.
 * Network/HTTP failures fail closed (return `null`) so a transient landing
 * outage logs the attendee out rather than throwing.
 */
export class HttpLandingSessionReader implements LandingSessionReader {
  private readonly endpoint: string;
  private readonly cookieName: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { baseUrl: string; cookieName: string; fetchImpl?: typeof fetch }) {
    this.endpoint = new URL('/api/public/session', options.baseUrl).toString();
    this.cookieName = options.cookieName;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async findUserBySessionToken(token: string): Promise<LandingSessionUser | null> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          cookie: `${this.cookieName}=${encodeURIComponent(token)}`,
        },
      });
    } catch {
      // Network error / DNS / connection refused: fail closed.
      return null;
    }

    if (!response.ok) return null;

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return null;
    }

    const user = (payload as Record<string, unknown> | null)?.user;
    if (!user || typeof user !== 'object') return null;
    const record = user as Record<string, unknown>;
    if (!record.id) return null;

    return {
      id: String(record.id),
      email: String(record.email || ''),
      name: String(record.name || ''),
      handle: nullableString(record.handle),
      avatarUrl: nullableString(record.avatarUrl),
      isAdmin: record.isAdmin === true,
      // Landing's /api/public/session does not return profile_claimed; default
      // to false. City self-claim flows do not depend on this for auth.
      profileClaimed: record.profileClaimed === true || record.profile_claimed === true,
    };
  }
}

/**
 * Picks the landing session reader for the configured auth mode. The HTTP
 * reader is used when `LANDING_SESSION_MODE=api` OR when no
 * `LANDING_DATABASE_URL` is set (the production / single-container default,
 * where landing's Postgres is not reachable). Otherwise the direct DB reader is
 * used. Returns `undefined` only when auth is fully unconfigured.
 */
export function defaultLandingSessionReader(config: CityConfig): LandingSessionReader | undefined {
  if (config.landingSessionMode === 'api' || !config.landingDatabaseUrl) {
    if (!config.landingAuthBaseUrl) return undefined;
    return new HttpLandingSessionReader({
      baseUrl: config.landingAuthBaseUrl,
      cookieName: config.authCookieName,
    });
  }
  return new BunSqlLandingSessionReader(config.landingDatabaseUrl);
}

function readerMode(config: CityConfig, reader: LandingSessionReader | null | undefined): LandingAuthMode {
  if (!reader) return 'disabled';
  if (reader instanceof HttpLandingSessionReader) return 'landing-api';
  if (reader instanceof BunSqlLandingSessionReader) return 'landing-db';
  // A test/double reader: report the configured intent.
  return config.landingSessionMode === 'api' || !config.landingDatabaseUrl ? 'landing-api' : 'landing-db';
}

/**
 * Build the landing session authenticator.
 *
 * `reader`:
 * - omit / `undefined` → use the env-selected default reader
 *   (`defaultLandingSessionReader`), i.e. api or db per config.
 * - `null`             → explicitly disable auth (mode 'disabled').
 * - a reader instance  → use it as-is (tests pass doubles here).
 */
export function createLandingSessionAuthenticator(
  config: CityConfig,
  reader: LandingSessionReader | null | undefined = defaultLandingSessionReader(config),
): LandingSessionAuthenticator {
  const resolvedReader = reader === null ? undefined : reader;
  const mode: LandingAuthMode = readerMode(config, resolvedReader);

  return {
    mode,
    async authenticate(request: Request): Promise<LandingSessionResult> {
      if (!resolvedReader) {
        return { mode, user: null, reason: 'not_configured' };
      }

      const token = parseCookieHeader(request.headers.get('cookie')).get(config.authCookieName);
      if (!token) {
        return { mode, user: null, reason: 'missing_cookie' };
      }

      try {
        const user = await resolvedReader.findUserBySessionToken(token);
        return user ? { mode, user } : { mode, user: null, reason: 'invalid_session' };
      } catch (error) {
        return {
          mode,
          user: null,
          error: error instanceof Error ? error.message : 'landing_session_validation_failed',
        };
      }
    },
    loginUrl(requestUrl: URL): string {
      const login = new URL(config.devAuthEnabled ? '/api/dev/auth/login' : '/login', config.landingAuthBaseUrl);
      const returnTo = canonicalLocalhostUrl(
        config.publicBaseUrl ? new URL(requestUrl.pathname + requestUrl.search, config.publicBaseUrl) : requestUrl,
      );
      login.searchParams.set('returnTo', returnTo.toString());
      if (config.devAuthEnabled && config.devAuthEmail) {
        login.searchParams.set('email', config.devAuthEmail);
      }
      return login.toString();
    },
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function canonicalLocalhostUrl(url: URL): URL {
  const copy = new URL(url);
  const normalized = copy.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (normalized === '127.0.0.1' || normalized === '::1') {
    copy.hostname = 'localhost';
  }
  return copy;
}
