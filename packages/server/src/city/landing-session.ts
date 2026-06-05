import { SQL } from 'bun';
import type { CityConfig } from './config';
import { parseCookieHeader } from './cookies';
import type { LandingSessionUser } from './types';

export type LandingAuthMode = 'disabled' | 'landing-db';

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

export function createLandingSessionAuthenticator(
  config: CityConfig,
  reader: LandingSessionReader | undefined = config.landingDatabaseUrl
    ? new BunSqlLandingSessionReader(config.landingDatabaseUrl)
    : undefined,
): LandingSessionAuthenticator {
  const mode: LandingAuthMode = reader ? 'landing-db' : 'disabled';

  return {
    mode,
    async authenticate(request: Request): Promise<LandingSessionResult> {
      if (!reader) {
        return { mode, user: null, reason: 'not_configured' };
      }

      const token = parseCookieHeader(request.headers.get('cookie')).get(config.authCookieName);
      if (!token) {
        return { mode, user: null, reason: 'missing_cookie' };
      }

      try {
        const user = await reader.findUserBySessionToken(token);
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
