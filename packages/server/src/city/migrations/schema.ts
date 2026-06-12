export interface CityMigration {
  id: string;
  sql: string;
}

export const cityMigrations: CityMigration[] = [
  {
    id: '001_city_core',
    sql: `
CREATE TABLE IF NOT EXISTS city_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS city_users (
  id TEXT PRIMARY KEY,
  landing_user_id TEXT NOT NULL UNIQUE,
  email_snapshot TEXT NOT NULL,
  name_snapshot TEXT NOT NULL,
  handle_snapshot TEXT,
  avatar_url_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS city_profiles (
  city_user_id TEXT PRIMARY KEY REFERENCES city_users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  handle TEXT,
  avatar_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS point_accounts (
  city_user_id TEXT NOT NULL REFERENCES city_users(id) ON DELETE CASCADE,
  resource TEXT NOT NULL CHECK (resource IN ('AP', 'GP')),
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (city_user_id, resource)
);

CREATE TABLE IF NOT EXISTS point_ledger_entries (
  id TEXT PRIMARY KEY,
  city_user_id TEXT NOT NULL REFERENCES city_users(id) ON DELETE CASCADE,
  resource TEXT NOT NULL CHECK (resource IN ('AP', 'GP')),
  delta INTEGER NOT NULL CHECK (delta <> 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  memo TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_city_user_id TEXT REFERENCES city_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (city_user_id, resource, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS checkin_award_sources (
  id TEXT PRIMARY KEY,
  landing_source_type TEXT NOT NULL CHECK (landing_source_type IN ('daily_checkin', 'event_checkin')),
  landing_source_id TEXT NOT NULL,
  landing_user_id TEXT NOT NULL,
  city_user_id TEXT NOT NULL REFERENCES city_users(id) ON DELETE CASCADE,
  ap_amount INTEGER NOT NULL CHECK (ap_amount > 0),
  ledger_entry_id TEXT NOT NULL REFERENCES point_ledger_entries(id) ON DELETE RESTRICT,
  occurred_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (landing_source_type, landing_source_id)
);

CREATE TABLE IF NOT EXISTS soul_proposals (
  id TEXT PRIMARY KEY,
  proposer_city_user_id TEXT NOT NULL REFERENCES city_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'funding',
  resident_name TEXT,
  display_name TEXT NOT NULL,
  goal TEXT NOT NULL,
  personality TEXT NOT NULL,
  vices TEXT NOT NULL DEFAULT '',
  virtues TEXT NOT NULL DEFAULT '',
  fears TEXT NOT NULL DEFAULT '',
  voice TEXT NOT NULL DEFAULT '',
  first_memory TEXT NOT NULL DEFAULT '',
  secret TEXT NOT NULL DEFAULT '',
  appearance JSONB NOT NULL DEFAULT '{}'::jsonb,
  starting_levels JSONB NOT NULL DEFAULT '{}'::jsonb,
  starting_equipment JSONB NOT NULL DEFAULT '[]'::jsonb,
  starting_inventory JSONB NOT NULL DEFAULT '[]'::jsonb,
  attention_threshold INTEGER NOT NULL CHECK (attention_threshold > 0),
  contributed_attention INTEGER NOT NULL DEFAULT 0 CHECK (contributed_attention >= 0),
  quote JSONB NOT NULL,
  born_resident_id TEXT,
  moderation_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  born_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS soul_contributions (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES soul_proposals(id) ON DELETE CASCADE,
  city_user_id TEXT NOT NULL REFERENCES city_users(id) ON DELETE CASCADE,
  ap_amount INTEGER NOT NULL CHECK (ap_amount > 0),
  ledger_entry_id TEXT NOT NULL REFERENCES point_ledger_entries(id) ON DELETE RESTRICT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, city_user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS residents (
  id TEXT PRIMARY KEY,
  nullcity_resident_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  born_at TIMESTAMPTZ,
  died_at TIMESTAMPTZ,
  death_cause TEXT,
  current_attention INTEGER,
  goal TEXT,
  latest_thought TEXT,
  latest_status_post_id TEXT,
  latest_seen_at TIMESTAMPTZ,
  source_proposal_id TEXT REFERENCES soul_proposals(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resident_posts (
  id TEXT PRIMARY KEY,
  resident_id TEXT NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'public',
  body TEXT NOT NULL,
  source TEXT NOT NULL,
  source_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inbox_threads (
  id TEXT PRIMARY KEY,
  city_user_id TEXT NOT NULL REFERENCES city_users(id) ON DELETE CASCADE,
  resident_id TEXT NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inbox_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES inbox_threads(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL,
  sender_city_user_id TEXT REFERENCES city_users(id) ON DELETE SET NULL,
  sender_resident_id TEXT REFERENCES residents(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  delivered_to_nullcity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resident_trades (
  id TEXT PRIMARY KEY,
  city_user_id TEXT NOT NULL REFERENCES city_users(id) ON DELETE CASCADE,
  resident_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_nullcity',
  offered_resource TEXT NOT NULL CHECK (offered_resource IN ('AP', 'GP')),
  offered_amount INTEGER NOT NULL CHECK (offered_amount > 0),
  requested_item TEXT,
  idempotency_key TEXT,
  point_ledger_entry_id TEXT NOT NULL REFERENCES point_ledger_entries(id) ON DELETE RESTRICT,
  nullcity_trade_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (city_user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS library_soul_lives (
  id TEXT PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id) ON DELETE SET NULL,
  nullcity_resident_id TEXT NOT NULL,
  source_proposal_id TEXT REFERENCES soul_proposals(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS print_requests (
  id TEXT PRIMARY KEY,
  city_user_id TEXT NOT NULL REFERENCES city_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL,
  description TEXT,
  requested_material TEXT,
  requested_color TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  quote_gp INTEGER CHECK (quote_gp IS NULL OR quote_gp > 0),
  gp_ledger_entry_id TEXT REFERENCES point_ledger_entries(id) ON DELETE SET NULL,
  assigned_printer_id TEXT,
  admin_notes TEXT,
  user_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS printers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  adapter TEXT NOT NULL,
  bridge_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  admin_notes TEXT,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS print_queue (
  id TEXT PRIMARY KEY,
  print_request_id TEXT NOT NULL REFERENCES print_requests(id) ON DELETE CASCADE,
  printer_id TEXT REFERENCES printers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 100,
  queue_position INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS city_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT,
  source_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_ledger_city_user_created ON point_ledger_entries(city_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkin_award_sources_city_user ON checkin_award_sources(city_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_soul_proposals_created ON soul_proposals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resident_posts_resident_created ON resident_posts(resident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_city_user_updated ON inbox_threads(city_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread_created ON inbox_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_resident_trades_city_user_created ON resident_trades(city_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_requests_city_user_created ON print_requests(city_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_queue_status_priority ON print_queue(status, priority, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_city_events_aggregate ON city_events(aggregate_type, aggregate_id, created_at DESC);
`.trim(),
  },
  {
    id: '002_city_identity_aliases',
    sql: `
CREATE TABLE IF NOT EXISTS city_identity_aliases (
  person_id TEXT PRIMARY KEY,
  patron_handle TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_city_identity_aliases_handle ON city_identity_aliases(patron_handle);
`.trim(),
  },
  {
    id: '003_attention_grant_intents',
    sql: `
CREATE TABLE IF NOT EXISTS attention_grant_intents (
  id TEXT PRIMARY KEY,
  city_user_id TEXT NOT NULL REFERENCES city_users(id) ON DELETE CASCADE,
  resident_id TEXT NOT NULL,
  ap_amount INTEGER NOT NULL CHECK (ap_amount > 0),
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'created'
    CHECK (state IN ('created', 'debited', 'sent_to_city', 'settling', 'settled', 'failed')),
  standin_ledger_entry_id TEXT REFERENCES point_ledger_entries(id) ON DELETE RESTRICT,
  city_response JSONB,
  failure_reason TEXT,
  -- NON-PRODUCTION: standin_ledger_entry_id debits the BFF projection point_accounts,
  -- a labelled stand-in for Dev's real consent-spend API (not yet available).
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (city_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_attention_grant_intents_city_user_created ON attention_grant_intents(city_user_id, created_at DESC);
`.trim(),
  },
  {
    id: '004_attention_grant_real_spend',
    sql: `
ALTER TABLE attention_grant_intents
  ADD COLUMN IF NOT EXISTS onion_request_id TEXT;

ALTER TABLE attention_grant_intents DROP CONSTRAINT IF EXISTS attention_grant_intents_state_check;
ALTER TABLE attention_grant_intents
  ADD CONSTRAINT attention_grant_intents_state_check CHECK (
    state IN ('created', 'debited', 'sent_to_city', 'awaiting_approval', 'settling', 'settled', 'denied', 'failed')
  );

CREATE INDEX IF NOT EXISTS idx_attention_grant_intents_onion_request
  ON attention_grant_intents(onion_request_id);
`.trim(),
  },
  {
    id: '005_human_feedback',
    sql: `
CREATE TABLE IF NOT EXISTS feedback_entries (
  id TEXT PRIMARY KEY,
  city_user_id TEXT REFERENCES city_users(id) ON DELETE SET NULL,
  landing_user_id TEXT,
  display_name TEXT,
  handle TEXT,
  email TEXT,
  feeling TEXT NOT NULL CHECK (feeling IN ('confused', 'okay', 'excited')),
  trying_to_do TEXT,
  message TEXT NOT NULL,
  route TEXT,
  page_url TEXT,
  mode TEXT CHECK (mode IN ('simple', 'expert')),
  resident_id TEXT,
  allow_follow_up BOOLEAN NOT NULL DEFAULT false,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_entries_created ON feedback_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_entries_city_user ON feedback_entries(city_user_id, created_at DESC);
`.trim(),
  },
];
