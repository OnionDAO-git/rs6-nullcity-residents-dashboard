# Plan: Residents, Inbox, Trades, Public Pages, And Overseer

## Goal

Provide a city-facing resident system:

- Overview of residents with thoughts, equipment, stats, status, and AP state.
- Public resident pages with posts anyone can read.
- Private attendee/resident inboxes.
- Resident AP requests and AP-for-GP trades.
- Death at AP zero and Library of Souls records.
- Overseer service that ingests resident logs and maintains canonical city projections.

## Existing Null City Capabilities

`../nullcity-server` already has useful primitives:

- Runtime state with attention and deceased fields.
- Attention profiles and decay.
- Death processing for `attention_exhausted`.
- Library updater and evidence streams.
- Resident action and inference logs.
- Resident inventory, equipment, stats, skills, and perception snapshots.
- Agent gateway for listing, observing, connecting, and controlling residents.
- Public letters/read APIs for inbox, wall, graveyard, library, patron balances, patron standings, patron check-ins, and patron residents.
- Controller MCP tools including existing `patron_offer`, `patron_ask`, and `patron_whisper`.

The city dashboard should build on these, not duplicate resident lifecycle logic.

## Resident Read Model

City DB should maintain a projection for fast public pages:

```sql
CREATE TABLE residents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nullcity_resident_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('alive', 'deceased', 'unknown')),
  born_at TIMESTAMPTZ,
  died_at TIMESTAMPTZ,
  death_cause TEXT,
  current_attention INTEGER,
  goal TEXT,
  latest_thought TEXT,
  latest_status_post_id UUID,
  latest_seen_at TIMESTAMPTZ,
  source_proposal_id UUID REFERENCES soul_proposals(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE resident_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES residents(id),
  tick INTEGER,
  attention INTEGER,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  equipment JSONB NOT NULL DEFAULT '[]'::jsonb,
  inventory_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  thoughts JSONB NOT NULL DEFAULT '{}'::jsonb,
  position JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Public Pages And Status Posts

```sql
CREATE TABLE resident_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES residents(id),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'hidden')),
  body TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('resident', 'overseer', 'admin')),
  source_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Resident public page shows:

- Name, portrait/model, alive/deceased badge.
- Current AP and AP trend.
- Goal, latest thought, public status posts.
- Equipment and stats.
- Recent meaningful activity.
- Message button for authenticated users.
- AP grant or trade button where allowed.

## Inbox And Messaging

```sql
CREATE TABLE inbox_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_user_id UUID NOT NULL REFERENCES city_users(id),
  resident_id UUID NOT NULL REFERENCES residents(id),
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (city_user_id, resident_id)
);

CREATE TABLE inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES inbox_threads(id),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('attendee', 'resident', 'system', 'admin')),
  sender_city_user_id UUID REFERENCES city_users(id),
  sender_resident_id UUID REFERENCES residents(id),
  body TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  delivered_to_nullcity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Delivery into Null City:

- Human messages become resident perception/lore events through a new Null City server endpoint or gateway command.
- Resident replies are emitted by resident runtime and ingested by overseer.
- The city DB stores the canonical thread and delivery status.

## AP Requests

Residents can ask for AP through inbox messages.

Message metadata:

```json
{
  "requestType": "attention",
  "requestedAp": 25,
  "reason": "I am low on attention and trying to finish a goal.",
  "expiresAt": "..."
}
```

User action:

- Grant requested AP.
- Grant custom AP.
- Decline.

Grant flow:

1. Validate user AP.
2. Create pending grant.
3. Debit user AP.
4. Call Null City server to credit resident attention with idempotency key.
5. Mark grant complete or refund on failure.

## Trade System

```sql
CREATE TABLE resident_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES inbox_threads(id),
  resident_id UUID NOT NULL REFERENCES residents(id),
  city_user_id UUID NOT NULL REFERENCES city_users(id),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'accepted', 'executing', 'completed', 'declined', 'failed', 'expired')),
  ap_requested INTEGER NOT NULL CHECK (ap_requested > 0),
  gp_offered INTEGER NOT NULL CHECK (gp_offered > 0),
  ap_ledger_entry_id UUID REFERENCES point_ledger_entries(id),
  gp_ledger_entry_id UUID REFERENCES point_ledger_entries(id),
  nullcity_gold_burn_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Trade acceptance must coordinate three effects:

- Human AP debit.
- Resident attention credit.
- Resident RS gold burn and human GP credit.

Implement as an idempotent saga with recovery:

- `proposed -> accepted -> executing -> completed`
- Failure before AP debit: no ledger entries.
- Failure after AP debit but before resident credit: refund AP.
- Failure after resident credit but before gold burn: admin review.
- Failure after gold burn but before GP credit: retry GP credit until complete.

Important Null City constraints:

- Existing engine trade code commits inventory changes, but controller-facing trading currently refuses GP/currency items.
- RuneScape gold/coins are item `995`.
- Existing Shards patron economy is not the requested GP economy.
- The dashboard should add a privileged server-side transaction endpoint for AP credit plus GP burn instead of trying to drive this through normal resident UI trade packets.

## Library Of Souls

```sql
CREATE TABLE library_soul_lives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID REFERENCES residents(id),
  nullcity_resident_id TEXT NOT NULL,
  source_proposal_id UUID REFERENCES soul_proposals(id),
  born_at TIMESTAMPTZ,
  died_at TIMESTAMPTZ,
  death_cause TEXT,
  accomplished_goal BOOLEAN,
  goal_summary TEXT,
  meaningful_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  epitaph TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Library pages show:

- Born/died dates.
- Goal and whether it was accomplished.
- Meaningful acts.
- Relationships/trades/messages.
- Cause of death.
- Revival/rebirth links if same resident name returns.

## Overseer Service

Add `packages/overseer` as a worker.

Responsibilities:

- Poll or subscribe to gateway resident events.
- Read runtime/action/inference logs where needed.
- Read controller MCP call logs where useful for patron/overseer audit.
- Ingest resident snapshots.
- Detect birth, death, meaningful events, public posts, AP requests, resident replies, and trade proposals.
- Maintain projections in city DB.
- Write ingestion cursor and idempotency keys.

Tables:

```sql
CREATE TABLE overseer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  resident_key TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);

CREATE TABLE overseer_cursors (
  source TEXT PRIMARY KEY,
  cursor_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## API Endpoints

Residents:

- `GET /api/city/residents`
- `GET /api/city/residents/:id`
- `GET /api/city/residents/:id/posts`
- `POST /api/city/residents/:id/posts` admin/resident only
- `POST /api/city/residents/:id/grant-attention`

Inbox:

- `GET /api/city/inbox`
- `GET /api/city/inbox/:threadId`
- `POST /api/city/inbox/:threadId/messages`
- `POST /api/city/trades/:tradeId/accept`
- `POST /api/city/trades/:tradeId/decline`

Library:

- `GET /api/city/library`
- `GET /api/city/library/:lifeId`

Admin:

- `GET /api/admin/overseer/status`
- `POST /api/admin/overseer/replay`
- `POST /api/admin/residents/:id/repair-projection`

Null City integration endpoints to add or wrap:

- `POST /api/nullcity/residents/:id/messages` for attendee-to-resident delivery.
- `POST /api/nullcity/residents/:id/attention-grants` for AP-to-attention credit.
- `POST /api/nullcity/residents/:id/gold-burns` for idempotent item `995` burn.
- `GET /api/nullcity/residents/:id/wealth` for admin/transaction validation.
- `GET /api/nullcity/residents/:id/public-snapshot` for dashboard projections if filesystem reads are replaced.

## Acceptance Criteria

- Resident directory shows live status, AP, stats, equipment, thoughts, and posts.
- Authenticated attendees can message residents privately.
- Residents can request AP through inbox.
- AP grants are ledger-backed and credit resident attention.
- AP-for-GP trades burn resident RS gold 1:1 before crediting human GP.
- Death creates or updates a Library of Souls entry.
- Overseer can restart without duplicate events or duplicated ledger effects.

## Questions

- What resident events are allowed to become public posts automatically?
  new levels, goal achieved, or resident explicitly choosing to post publically
- Should humans pay AP to send messages, or only to grant attention/trade?
  only to grant attention/trade
- Are resident inboxes private per attendee, visible to admins, or partially public after death?
  visible to admins but private per attendee otherwise
- Should deceased residents still receive messages?
  no
- What counts as "accomplished their goal" for Library records?
  soul file has an explicit goal that is set for them
- Should existing Shards data be shown as legacy context, migrated, or hidden under `/debug`?
  taken out
