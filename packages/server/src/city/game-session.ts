import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { CityUser, LandingSessionUser } from './types';

const TICKET_PREFIX = 'ncgt.v1';
const DEFAULT_TICKET_TTL_SECONDS = 120;
const DEFAULT_DEV_SECRET = 'dev-only-nullcity-dashboard-game-ticket-secret';

export interface GameSessionTicketResponse {
  ticket: string;
  landingUserId: string;
  gameUsername: string;
  expiresAt: string;
  nonce: string;
}

export interface GameSessionTicketPayload {
  version: 1;
  ticketId: string;
  landingUserId: string;
  cityUserId: string;
  gameUsername: string;
  csrfHash: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

export interface IssueGameSessionTicketOptions {
  landingUser: LandingSessionUser;
  cityUser: CityUser;
  csrfToken: string;
  secret: string;
  now?: Date;
  ttlSeconds?: number;
}

export interface VerifyGameSessionTicketOptions {
  secret: string;
  now?: Date;
  csrfToken?: string;
  expectedLandingUserId?: string;
  expectedCityUserId?: string;
}

export type GameSessionTicketVerification =
  | { ok: true; payload: GameSessionTicketPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'csrf_mismatch' | 'identity_mismatch' };

export function issueGameSessionTicket(options: IssueGameSessionTicketOptions): GameSessionTicketResponse {
  const now = options.now ?? new Date();
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TICKET_TTL_SECONDS;
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const payload: GameSessionTicketPayload = {
    version: 1,
    ticketId: randomUUID(),
    landingUserId: options.landingUser.id,
    cityUserId: options.cityUser.id,
    gameUsername: gameUsernameForCityUser(options.landingUser, options.cityUser),
    csrfHash: hashCsrfToken(options.csrfToken),
    nonce: randomUUID(),
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const encodedPayload = encodeJson(payload);
  const signature = signTicketPayload(encodedPayload, options.secret);

  return {
    ticket: `${TICKET_PREFIX}.${encodedPayload}.${signature}`,
    landingUserId: payload.landingUserId,
    gameUsername: payload.gameUsername,
    expiresAt: payload.expiresAt,
    nonce: payload.nonce,
  };
}

export function verifyGameSessionTicket(
  ticket: string,
  options: VerifyGameSessionTicketOptions,
): GameSessionTicketVerification {
  const parts = ticket.split('.');
  if (parts.length !== 4 || `${parts[0]}.${parts[1]}` !== TICKET_PREFIX) {
    return { ok: false, reason: 'malformed' };
  }

  const encodedPayload = parts[2];
  const signature = parts[3];
  if (!encodedPayload || !signature) {
    return { ok: false, reason: 'malformed' };
  }

  if (!safeEqual(signature, signTicketPayload(encodedPayload, options.secret))) {
    return { ok: false, reason: 'bad_signature' };
  }

  const payload = decodeJson(encodedPayload);
  if (!isGameSessionTicketPayload(payload)) {
    return { ok: false, reason: 'malformed' };
  }

  const now = options.now ?? new Date();
  if (Date.parse(payload.expiresAt) <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }

  if (options.csrfToken !== undefined && payload.csrfHash !== hashCsrfToken(options.csrfToken)) {
    return { ok: false, reason: 'csrf_mismatch' };
  }

  if (
    (options.expectedLandingUserId !== undefined && payload.landingUserId !== options.expectedLandingUserId) ||
    (options.expectedCityUserId !== undefined && payload.cityUserId !== options.expectedCityUserId)
  ) {
    return { ok: false, reason: 'identity_mismatch' };
  }

  return { ok: true, payload };
}

export function gameSessionTicketSecretFromEnv(env: Record<string, string | undefined> = process.env): string {
  return clean(env.CITY_GAME_TICKET_SECRET) || clean(env.GAME_TICKET_SECRET) || DEFAULT_DEV_SECRET;
}

export function gameSessionTicketTtlSecondsFromEnv(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.CITY_GAME_TICKET_TTL_SECONDS ?? env.GAME_TICKET_TTL_SECONDS);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_TICKET_TTL_SECONDS;
}

export function gameUsernameForCityUser(landingUser: LandingSessionUser, cityUser: CityUser): string {
  const base = sanitizeGameUsername(
    landingUser.handle ||
    landingUser.name ||
    landingUser.email.split('@')[0] ||
    cityUser.id,
  );
  const suffix = createHash('sha256').update(landingUser.id).digest('hex').slice(0, 4);
  const prefix = (base || 'citizen').slice(0, 7).replace(/_+$/g, '') || 'citizen';
  return `${prefix}_${suffix}`.slice(0, 12);
}

export function validGameCsrfToken(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length >= 8 && value.length <= 2048;
}

function hashCsrfToken(csrfToken: string): string {
  return createHash('sha256').update(csrfToken).digest('base64url');
}

function signTicketPayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeJson(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isGameSessionTicketPayload(value: unknown): value is GameSessionTicketPayload {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.version === 1 &&
    typeof payload.ticketId === 'string' &&
    typeof payload.landingUserId === 'string' &&
    typeof payload.cityUserId === 'string' &&
    typeof payload.gameUsername === 'string' &&
    typeof payload.csrfHash === 'string' &&
    typeof payload.nonce === 'string' &&
    typeof payload.issuedAt === 'string' &&
    typeof payload.expiresAt === 'string'
  );
}

function sanitizeGameUsername(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
