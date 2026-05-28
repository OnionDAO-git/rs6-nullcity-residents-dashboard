import { describe, expect, test } from 'bun:test';
import { cityConfigFromEnv } from './config';
import {
  issueGameSessionTicket,
  verifyGameSessionTicket,
} from './game-session';
import { createLandingSessionAuthenticator } from './landing-session';
import { InMemoryCityStore } from './memory-store';
import { routeCityApi, type CityApiContext } from './routes';
import type { CityUser, LandingSessionUser } from './types';

const secret = 'test-game-ticket-secret';
const csrfToken = 'csrf-token-123';
const now = new Date('2026-05-27T12:00:00.000Z');

const landingUser: LandingSessionUser = {
  id: 'landing-user-1',
  email: 'alice@example.com',
  name: 'Alice Example',
  handle: 'alice',
  avatarUrl: null,
  isAdmin: false,
  profileClaimed: true,
};

const cityUser: CityUser = {
  id: 'city-user-1',
  landingUserId: landingUser.id,
  emailSnapshot: landingUser.email,
  nameSnapshot: landingUser.name,
  handleSnapshot: landingUser.handle,
  avatarUrlSnapshot: landingUser.avatarUrl,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};

describe('game session tickets', () => {
  test('issues the public ticket shape and validates the signed payload', () => {
    const ticket = issueGameSessionTicket({
      landingUser,
      cityUser,
      csrfToken,
      secret,
      now,
      ttlSeconds: 90,
    });

    expect(ticket).toMatchObject({
      landingUserId: 'landing-user-1',
      gameUsername: expect.stringMatching(/^alice_[a-f0-9]{4}$/),
      expiresAt: '2026-05-27T12:01:30.000Z',
      nonce: expect.any(String),
    });
    expect(ticket.ticket.startsWith('ncgt.v1.')).toBe(true);

    const verification = verifyGameSessionTicket(ticket.ticket, {
      secret,
      csrfToken,
      expectedLandingUserId: landingUser.id,
      expectedCityUserId: cityUser.id,
      now,
    });

    expect(verification).toMatchObject({
      ok: true,
      payload: {
        landingUserId: 'landing-user-1',
        cityUserId: 'city-user-1',
        expiresAt: '2026-05-27T12:01:30.000Z',
      },
    });
  });

  test('rejects expired, tampered, and csrf-mismatched tickets', () => {
    const ticket = issueGameSessionTicket({
      landingUser,
      cityUser,
      csrfToken,
      secret,
      now,
      ttlSeconds: 1,
    });
    const tampered = `${ticket.ticket.slice(0, -1)}x`;

    expect(verifyGameSessionTicket(ticket.ticket, {
      secret,
      csrfToken,
      now: new Date('2026-05-27T12:00:02.000Z'),
    })).toEqual({ ok: false, reason: 'expired' });
    expect(verifyGameSessionTicket(tampered, { secret, csrfToken, now })).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyGameSessionTicket(ticket.ticket, { secret, csrfToken: 'different-token', now })).toEqual({
      ok: false,
      reason: 'csrf_mismatch',
    });
  });
});

describe('routeCityApi game session endpoints', () => {
  test('issues and accepts logout for an authenticated city user ticket', async () => {
    const services = testServices();
    const session = await route(new Request('http://city.test/api/game/session', {
      method: 'POST',
      headers: authHeaders(csrfToken),
    }), services);
    const payload = await session.json() as { ticket: string; landingUserId: string; gameUsername: string };

    expect(session.status).toBe(201);
    expect(payload).toMatchObject({
      landingUserId: landingUser.id,
      gameUsername: expect.stringMatching(/^alice_[a-f0-9]{4}$/),
    });
    expect(verifyGameSessionTicket(payload.ticket, {
      secret,
      csrfToken,
      expectedLandingUserId: landingUser.id,
      now,
    }).ok).toBe(true);

    const logout = await route(new Request('http://city.test/api/game/logout', {
      method: 'POST',
      headers: {
        ...authHeaders(csrfToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ticket: payload.ticket }),
    }), services);

    expect(logout.status).toBe(200);
    expect(await logout.json()).toEqual({ ok: true, invalidated: false, reason: 'stateless_ticket' });
  });

  test('requires csrf on ticket issuance and logout', async () => {
    const services = testServices();
    const session = await route(new Request('http://city.test/api/game/session', {
      method: 'POST',
      headers: { cookie: 'session=test-token' },
    }), services);

    expect(session.status).toBe(403);
    expect(await session.json()).toEqual({ error: 'csrf_required' });
  });
});

function testServices(): CityApiContext {
  const config = cityConfigFromEnv({
    LANDING_AUTH_BASE_URL: 'https://oniondao.dev',
    LANDING_DATABASE_URL: 'postgres://readonly@example.test/landing',
  });
  return {
    config,
    auth: createLandingSessionAuthenticator(config, {
      async findUserBySessionToken() {
        return landingUser;
      },
    }),
    store: new InMemoryCityStore({ now: () => now.toISOString() }),
    gameTicketSecret: secret,
    gameTicketTtlSeconds: 90,
  };
}

function authHeaders(csrf: string): Record<string, string> {
  return {
    cookie: `session=test-token; city_csrf=${csrf}`,
    'x-csrf-token': csrf,
  };
}

async function route(request: Request, services: CityApiContext): Promise<Response> {
  const response = await routeCityApi(request, new URL(request.url), services);
  if (!response) throw new Error(`No route for ${request.url}`);
  return response;
}
