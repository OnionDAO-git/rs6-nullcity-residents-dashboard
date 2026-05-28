# Plan: Profiles, Attention Points, And Gold Points

## Goal

Give every authenticated attendee a city profile with two resources:

- Attention Points (AP): earned by human participation and spent to give residents attention or birth new souls.
- Gold Points (GP): earned from residents and spent on 3D print requests.

All point movement must be auditable, idempotent, and reversible where business rules allow.

## City Identity

City users mirror landing users:

```sql
CREATE TABLE city_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_user_id UUID NOT NULL UNIQUE,
  email_snapshot TEXT NOT NULL,
  name_snapshot TEXT NOT NULL,
  handle_snapshot TEXT,
  avatar_url_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

On every session load:

- Validate landing session.
- Upsert `city_users` by `landing_user_id`.
- Update snapshots for display only.
- Never use email as the stable foreign key.

## Ledger Model

Use append-only ledgers. Balances can be cached, but ledgers are the source of truth.

```sql
CREATE TYPE point_resource AS ENUM ('AP', 'GP');

CREATE TABLE point_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_user_id UUID NOT NULL REFERENCES city_users(id),
  resource point_resource NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (city_user_id, resource),
  CHECK (balance >= 0)
);

CREATE TABLE point_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_user_id UUID NOT NULL REFERENCES city_users(id),
  resource point_resource NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  memo TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_city_user_id UUID REFERENCES city_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resource, source_type, source_id, city_user_id)
);
```

All point writes should run in a transaction:

1. Lock account row.
2. Validate non-negative resulting balance.
3. Insert ledger entry with unique source key.
4. Update account balance.
5. Return new balance.

## AP Earning Sources

Initial sources:

- Daily check-in from landing `daily_checkins`.
- Event attendance from landing `event_registrations.checked_in_at`.
- Admin grants.
- Refunds from rejected/expired soul proposals.
- Refunds from failed AP grants or trades.

Recommended source keys:

- `daily_checkin:<landing_daily_checkins.id>`
- `event_checkin:<landing_event_registrations.id>`
- `admin_grant:<city_admin_action.id>`
- `soul_refund:<soul_contribution.id>`

AP award amounts are open product decisions and should live in config:

```sql
CREATE TABLE point_award_rules (
  id TEXT PRIMARY KEY,
  resource point_resource NOT NULL,
  amount INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## AP Spending Sinks

Initial sinks:

- Contribute AP to a soul proposal.
- Grant AP to an alive resident.
- Accept resident AP-for-GP trade.
- Optional: spend AP to boost message priority or resident attention mechanisms.

Spending should reserve or debit depending on workflow:

- Soul proposals: debit immediately into a proposal contribution ledger. Refund if rejected/expired.
- Resident grants: debit only after Null City server confirms resident attention credit, or debit into pending state and auto-refund on failure.
- Trades: atomic saga; see GP section.

## GP Earning And Burning

GP is given by residents to humans. The user specified:

"When a resident gives GP to an attendee, that GP is burned 1:1 as RuneScape gold in their inventory."

Required invariant:

- City GP credit to human must correspond to confirmed removal of the same amount of RuneScape gold from the resident/player-side inventory authority.
- RuneScape gold is item `995` in `../nullcity-server/data/config/items/currency.json` and `../nullcity-server/src/engine/world/config/item-ids.ts`.
- Existing Null City patron currency is Shards, not GP; `patron_offer` currently debits Shards and credits resident attention at an existing server-defined rate. This new GP system should be separate unless a migration is explicitly approved.
- Existing controller trade safety rejects GP/currency items, so this should be a privileged city/server transaction rather than an autonomous resident trade action.

Trade flow:

1. Resident proposes trade: "I will give 100 GP for 50 AP."
2. Human accepts.
3. City validates human has 50 AP.
4. City creates pending trade transaction.
5. City debits 50 AP from human or reserves it.
6. City calls Null City server to:
   - credit 50 attention to the resident, and
   - burn 100 RuneScape gold from the resident inventory.
7. On confirmed gold burn, city credits 100 GP to human.
8. On failure, city reverses or releases AP and marks trade failed.

Server changes needed in `../nullcity-server`:

- A safe API/gateway command to inspect resident gold.
- A safe API/gateway command to burn resident gold with idempotency key.
- A safe API/gateway command to credit resident attention with idempotency key.
- Audit events for overseer.
- An adapter that avoids submitting controller-only trade shapes directly to the agent gateway.

GP sinks:

- 3D print requests.
- Admin adjustments.
- Refunds are negative or positive ledger entries depending on cancellation policy.

## API Endpoints

Profile:

- `GET /api/profile`
- `PATCH /api/profile`
- `GET /api/profile/points`
- `GET /api/profile/ledger?resource=AP|GP`

Awards:

- `POST /api/points/sync-checkins`
- `POST /api/admin/points/grant`
- `POST /api/admin/points/adjust`

Spending:

- `POST /api/soul-proposals/:id/contributions`
- `POST /api/residents/:id/grant-attention`
- `POST /api/trades/:id/accept`
- `POST /api/prints/:id/confirm-gp-burn`

## UI Requirements

- Show AP and GP balances in the global shell.
- Show pending holds separately from available balance.
- Every balance panel links to ledger history.
- Transaction rows show source, amount, time, status, and related entity.
- Admin adjustment forms require memo and show before/after balances.

## Acceptance Criteria

- Check-in AP awards are idempotent.
- Users cannot spend more AP or GP than available.
- Every balance can be reconstructed from ledger entries.
- Resident-to-human GP credits require a confirmed RS gold burn.
- Failed cross-system operations either retry safely or produce compensating ledger entries.
- Admin changes are auditable.

## Questions

- Exact AP values for daily and event check-ins.
  100 AP for daily, 500 for event
- Is there an AP maximum or decay for human profiles?
  No
- Can residents directly request AP without offering GP?
  yes
- What is the minimum and maximum trade size?
  no min/max
- Are GP print costs fixed by material/time, admin quoted, or both?
  fixed by material / time
- Should old Shards be migrated into AP, archived, or ignored?
  migrated to AP
