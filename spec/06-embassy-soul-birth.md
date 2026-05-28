# Plan: Embassy Soul Proposals And Birth

## Goal

Let attendees propose new souls, let other attendees contribute AP, and birth funded souls into Null City as residents when their attention threshold is reached.

## Concepts

- Attendee: authenticated human from landing.
- Soul proposal: structured draft of a future resident.
- Attention threshold: AP required to birth the soul.
- Contribution: AP spent by an attendee toward a proposal.
- Birth: converting a funded proposal into a resident in Null City.

## Proposal Schema

```sql
CREATE TYPE soul_proposal_status AS ENUM (
  'draft',
  'submitted',
  'funding',
  'ready_to_birth',
  'birthing',
  'born',
  'rejected',
  'expired'
);

CREATE TABLE soul_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_city_user_id UUID NOT NULL REFERENCES city_users(id),
  status soul_proposal_status NOT NULL DEFAULT 'draft',
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
  attention_threshold INTEGER NOT NULL,
  contributed_attention INTEGER NOT NULL DEFAULT 0,
  born_resident_id TEXT,
  moderation_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  born_at TIMESTAMPTZ
);

CREATE TABLE soul_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES soul_proposals(id),
  city_user_id UUID NOT NULL REFERENCES city_users(id),
  ap_amount INTEGER NOT NULL CHECK (ap_amount > 0),
  ledger_entry_id UUID NOT NULL REFERENCES point_ledger_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Add a revision table if proposal edits after submission need history:

```sql
CREATE TABLE soul_proposal_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES soul_proposals(id),
  editor_city_user_id UUID REFERENCES city_users(id),
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Attention Cost Formula

The threshold should be deterministic and explainable.

Suggested formula:

```text
threshold =
  base_birth_cost
  + level_cost_total
  + equipment_cost_total
  + inventory_cost_total
  + complexity_cost
```

Inputs:

- `base_birth_cost`: minimum attention required for any soul.
- `level_cost_total`: based on starting skill levels above 1.
- `equipment_cost_total`: based on item tier/rarity/value.
- `inventory_cost_total`: based on starting item value and utility.
- `complexity_cost`: optional multiplier for advanced constraints, rare roles, or admin-selected story weight.

Implementation:

- Build a quote function in `packages/server/src/embassy/quote.ts`.
- Use item metadata from dashboard/server item config where possible.
- Store quote breakdown in proposal metadata so contributors understand the threshold.
- Recalculate quote on edits before submission.

Open policy decisions:

- Maximum starting level.
- Allowed equipment tiers.
- Whether proposer can request rare/quest items.
- Whether admins can override the quote.

## Workflow

1. Draft
   - User creates or autosaves proposal.
   - Quote updates live.
   - No AP can be contributed.

2. Submit
   - Validate required fields and forbidden content.
   - Normalize resident name.
   - Move to `submitted`.

3. Moderation
   - Admin approves to `funding`, edits, or rejects.
   - Optional MVP shortcut: auto-approve low-risk proposals and allow admin takedown.

4. Funding
   - Any attendee can contribute AP.
   - AP is debited immediately into `soul_contributions`.
   - Proposal total updates transactionally.
   - When total reaches threshold, status becomes `ready_to_birth`.

5. Birth
   - Admin or worker starts `birthing`.
   - Generate SOUL markdown/frontmatter compatible with Null City server.
   - Write through city BFF/runtime writer or call a new Null City server birth endpoint.
   - Create resident through gateway.
   - Store `born_resident_id`.
   - Move to `born`.

6. Failure
   - If birth fails, status returns to `ready_to_birth` with error metadata.
   - Contributions remain unless admin rejects or expires.

7. Reject/Expire
   - Refund AP contributions through ledger entries.
   - Preserve proposal record.

## Null City Server Integration

Current dashboard can write a resident soul via `RuntimeRepository.writeResidentSoul` and create a resident through the gateway. For production, prefer an explicit server-side birth contract:

- `POST /api/nullcity/souls`
- `POST /api/nullcity/residents`
- or gateway command `birth_resident`.

Birth payload:

```ts
interface BirthResidentRequest {
  proposalId: string;
  residentName: string;
  soulMarkdown: string;
  appearance?: unknown;
  spawnPosition?: { x: number; y: number; level: number };
  startingInventory?: unknown[];
  initialEquipment?: unknown[];
  startingLevels?: Record<string, number>;
  fundedAttention: number;
}
```

The Null City server should emit a birth event for overseer ingestion.

## UI

Embassy list:

- Funding progress.
- Attention remaining.
- Proposed by.
- Goal.
- Starting equipment/level badges.
- Status filter.

Proposal detail:

- Soul text and structured fields.
- Quote breakdown.
- Contribution form.
- Contribution history.
- Birth/admin panel when ready.

Composer:

- Structured sections: identity, goal, personality, vices, virtues, voice, first memory, secret.
- Starting levels editor.
- Starting equipment picker.
- Live attention quote.
- Preview generated SOUL markdown.

## Acceptance Criteria

- Attendees can draft, submit, and view soul proposals.
- Approved proposals accept AP from multiple attendees.
- AP contributions are ledger-backed and idempotent.
- Proposal reaches `ready_to_birth` exactly when contributions meet or exceed threshold.
- Birth creates a resident and records the source proposal.
- Rejected/expired proposals refund AP.
- Admin can see and recover failed births.

## Questions

- Should proposals require admin approval before funding?
  no
- What base AP cost and level/equipment cost curve should be used?
  500 AP to birth, level _ 10 AP for each level of a skill, and equipment GP cost _ 1 per AP they start with. make these values configurable easily
- Should overfunding be allowed, capped, or refunded automatically?
  allowed
- Can attendees edit proposals after contributions begin?
  no
- Should contributors receive GP, recognition, or only birth credit?
  birth credit
