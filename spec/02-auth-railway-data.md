# Plan: Auth, Railway, And City Data Boundary

## Goal

Host the redesigned dashboard at `city.oniondao.dev`, authenticate users with the Onion DAO `session` cookie from `landing-2026`, keep city data in a new database owned by this project, and read landing check-in data without polluting the landing database.

## Landing Auth Facts

The landing app is `/Users/spacemandev/Projects/oniondao-git/landing-2026`.

- Cookie name: `session`.
- Cookie value: random hex token stored in `sessions.token`.
- Cookie options: `httpOnly`, `sameSite: 'lax'`, `secure` in production, `path: '/'`, and `domain: process.env.AUTH_COOKIE_DOMAIN`.
- Production requirement: `AUTH_COOKIE_DOMAIN=.oniondao.dev`, so the cookie is sent to `city.oniondao.dev`.
- Session TTL: 30 days.
- Stable identity: `users.id`.
- Admin flag: `users.is_admin`.

Server-side validation query:

```sql
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
WHERE s.token = $1
  AND s.expires_at > now()
LIMIT 1;
```

The browser must not read the cookie. The city BFF reads it from the request headers and returns a sanitized session model to the client.

## Deployment Shape

Railway project:

- Service: `city-dashboard` from this repository.
- Database: new Postgres service for city data.
- Optional service: `city-overseer` worker from the same repository.
- Optional service: `print-bridge-relay` if the LAN bridge uses a hosted relay.
- Domain: `city.oniondao.dev`.
- Landing DB access: read-only connection string or internal auth/check-in API token.

Environment variables:

```sh
CITY_DATABASE_URL=postgres://...
LANDING_DATABASE_URL=postgres://...          # read-only user preferred
LANDING_AUTH_BASE_URL=https://oniondao.dev   # redirect target
AUTH_COOKIE_NAME=session
AUTH_COOKIE_DOMAIN=.oniondao.dev
SESSION_COOKIE_SECURE=true
CITY_PUBLIC_BASE_URL=https://city.oniondao.dev
NULLCITY_GATEWAY_URL=...
NULLCITY_RS_HOST=...
```

Use Railway reference variables for the new city Postgres. Do not point `CITY_DATABASE_URL` at the landing database.

## Auth Architecture

1. Add `packages/server/src/auth/landing-session.ts`.
   - Parse `Cookie` header.
   - Read `session`.
   - Validate against landing DB or landing internal API.
   - Return `CitySessionUser | null`.

2. Add route protection in the Bun BFF.
   - Public: `/login`, `/logged-out`, selected resident public pages if desired, static assets, health checks.
   - Authenticated: profile, AP/GP balances, game client, embassy contributions, inbox, print requests.
   - Admin: printer admin, queue admin, debug operations, grants, moderation, raw logs.

3. Add `GET /api/session`.
   - Returns `{ authenticated: false, loginUrl }` when logged out.
   - Returns user profile and roles when logged in.

4. Add login redirect behavior.
   - If unauthenticated, redirect browser page loads to `https://oniondao.dev/login?returnTo=https%3A%2F%2Fcity.oniondao.dev%2F...`.
   - If the landing login flow does not support `returnTo`, add it there or send users to `/login` with clear return behavior.

5. Add logout behavior.
   - Prefer redirect to landing `/api/auth/logout` or landing logout page so the shared cookie is destroyed once.
   - Do not create a city-only logout state that leaves the landing session active.

## Landing Check-In Reads

Landing tables:

- `daily_checkins`: one row per user per Chicago day.
- `event_registrations`: event attendance when `checked_in_at IS NOT NULL`.
- `events`: event metadata.

City must award AP idempotently using source IDs:

```sql
CREATE TABLE ap_award_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_user_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('daily_checkin', 'event_checkin')),
  source_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  ap_amount INTEGER NOT NULL,
  city_ledger_entry_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);
```

Sync jobs:

- On login: sync that user's recent unawarded daily and event check-ins.
- Scheduled worker: sync all new check-ins every few minutes.
- Admin action: resync one user or all users for a date range.

Recommended query shape:

```sql
SELECT id, user_id, checked_in_at
FROM daily_checkins
WHERE user_id = $1;

SELECT r.id, r.user_id, r.checked_in_at, e.name, e.start_at
FROM event_registrations r
JOIN events e ON e.id = r.event_id
WHERE r.user_id = $1
  AND r.checked_in_at IS NOT NULL;
```

## City Database Ownership

City DB owns:

- City user mirror/profile state.
- AP and GP ledgers.
- Soul proposals and contributions.
- Print requests, printer configs, queue events, and GP burns.
- Inbox threads and messages.
- Resident public page posts and city-level resident metadata.
- Overseer event ingestion and Library of Souls projections.

Landing DB remains read-only for:

- Auth session validation.
- User identity lookup.
- Daily and event check-in award inputs.

## Security Requirements

- The `session` cookie is only validated server-side.
- Use a read-only landing DB user if direct DB reads are used.
- If using a landing internal API instead, require a private Railway network path or signed service token.
- Do not expose landing session tokens, printer credentials, Null City gateway tokens, or database URLs to the browser.
- Add CSRF protection for state-changing browser requests because the shared cookie is `sameSite=lax`, not a bearer token.
- Use role checks from landing `is_admin`, with optional city-specific roles in city DB.

## Acceptance Criteria

- A logged-in Onion DAO user can open `https://city.oniondao.dev` without entering credentials again.
- A logged-out user is redirected to the landing login and returns to city after login.
- City creates a local user row keyed by `landing_user_id`.
- Daily and event check-ins create AP ledger entries exactly once.
- City can be deployed and migrated without writing to landing DB.
- Admin-only routes reject non-admin users server-side.

## Questions

- Confirm `AUTH_COOKIE_DOMAIN=.oniondao.dev` is set in production landing.
  - done
- Should city read landing Postgres directly, or should landing expose a private auth/check-in API?
  - read postgres directly
- Exact AP award amounts for daily check-ins and event check-ins.
  - 100 AP per day, 500 AP per event check in
- Do event registrations without `checked_in_at` award anything?
  - no
- Should city-specific admin roles exist, or is landing `is_admin` sufficient?
  - landing is_admin is good
