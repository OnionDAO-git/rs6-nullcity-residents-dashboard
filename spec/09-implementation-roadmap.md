# Implementation Roadmap

## Phase 0: Prep And Route Safety

Deliverables:

- Add `spec/` plans.
- Add route helper tests.
- Move existing operations SPA to `/debug`.
- Decide static Embassy page treatment.

Verification:

- `bun run typecheck`
- `bun test` or package-specific tests
- Browser smoke for `/debug`, `/debug/residents`, `/debug/observe`, `/debug/benchmarks`.

Exit criteria:

- `/` no longer depends on old operations UI.
- `/debug/*` preserves current operations behavior.

## Phase 1: City Auth And Database

Deliverables:

- New city Postgres migrations.
- Landing session validator.
- `GET /api/session`.
- City user upsert.
- Admin role checks.
- Check-in AP sync skeleton.
- CSRF protection for state-changing routes.

Verification:

- Unit tests for cookie parsing and auth query behavior.
- Integration test with mocked landing DB.
- Manual Railway env review.

Exit criteria:

- Logged-in landing user is recognized by city.
- Logged-out user is redirected.
- City writes only to city DB.

## Phase 2: New City Shell And Profile

Deliverables:

- New city app shell at `/`.
- Profile page.
- AP/GP balance widgets.
- Ledger history.
- Admin/debug nav separation.

Verification:

- Desktop and mobile Playwright screenshots.
- Long-name and zero-balance visual cases.
- Authenticated and unauthenticated route checks.

Exit criteria:

- First screen is useful for an attendee.
- Current debug dashboard remains accessible to admins.

## Phase 3: AP Economy

Deliverables:

- Point account and ledger write path.
- Daily/event check-in AP awards.
- Admin grants/adjustments.
- AP spend/reserve helpers.

Verification:

- Idempotency tests for duplicated check-in sync.
- Transaction tests for insufficient balance.
- Ledger reconstruction test.

Exit criteria:

- AP can be earned, viewed, granted by admin, and spent by service code.

## Phase 4: Embassy And Birth

Deliverables:

- Soul proposal tables and APIs.
- Composer UI.
- Attention quote function.
- Contribution flow.
- Admin moderation.
- Birth worker or endpoint.

Verification:

- Proposal lifecycle tests.
- AP contribution ledger tests.
- Birth failure/retry test.
- Null City server smoke for created resident.

Exit criteria:

- A funded proposal can become a resident and remain traceable to contributors.

## Phase 5: Resident Social Layer And Overseer

Deliverables:

- Overseer worker package.
- Resident projection tables.
- Resident public pages.
- Inbox threads/messages.
- AP request/grant flow.
- Library of Souls projection.

Verification:

- Overseer idempotency tests.
- Message delivery tests with mocked Null City endpoint.
- Death/library ingestion replay.

Exit criteria:

- Attendees can read resident public pages, message residents, and grant AP.
- Resident death is visible in Library of Souls.

## Phase 6: GP And Trades

Deliverables:

- Trade proposal tables and APIs.
- Null City server gold burn and attention credit commands.
- GP ledger credit after confirmed burn.
- Inbox trade UI.

Verification:

- Saga tests for each failure point.
- Idempotent gold burn tests in Null City server.
- Admin repair path.

Exit criteria:

- Resident AP-for-GP trades complete without violating point or gold invariants.

## Phase 7: Game Client Fork

Deliverables:

- Copy `nullcity-client-ts` into `packages/game-client`.
- Preserve spectator mode.
- Refactor canvas injection and lifecycle.
- Add game ticket API.
- Add Null City server ticket login.
- Add `/world` route.

Verification:

- Client builds from in-repo package.
- Browser canvas smoke tests.
- Login ticket tests.
- WSS/proxy smoke in production-like config.

Exit criteria:

- Authenticated attendee can enter the game from `/world`.

## Phase 8: 3D Queue

Deliverables:

- Print request tables and file storage.
- GP quote/confirm/debit flow.
- Admin printer and queue UI.
- LAN print bridge.
- First printer adapter.
- Slicing profile runner.

Verification:

- File upload tests.
- GP burn/refund tests.
- Bridge heartbeat/job tests.
- Dry-run adapter tests before real printer use.

Exit criteria:

- User can request a print using GP and admin can move it through queue states.

## Phase 9: Production Hardening

Deliverables:

- Railway deploy config.
- Domain and health checks.
- Backups and migration runbook.
- Audit dashboards.
- Rate limits.
- Structured logs.
- Error reporting.

Verification:

- Production smoke checklist.
- Restore test for city DB.
- Auth/session expiry tests.
- Admin permission tests.

Exit criteria:

- City dashboard can run at `city.oniondao.dev` with clear recovery paths.

## Cross-Cutting Test Strategy

- Unit tests for route helpers, ledger math, quote math, idempotency keys, and auth parsing.
- Integration tests for city DB transactions.
- Contract tests for Null City server commands.
- Browser tests for critical attendee/admin workflows.
- Worker replay tests for overseer and print bridge.
- Manual real-printer tests only after dry-run adapters are stable.

## Initial Work Order

1. Implement `/debug` migration.
2. Add city DB migrations and auth.
3. Build the new shell/profile/ledger.
4. Implement AP earning and spending primitives.
5. Build Embassy proposal and contribution flow.
6. Add overseer projections and resident pages.
7. Add inbox and AP grants.
8. Add trades and GP.
9. Fork and authenticate the game client.
10. Add print queue and bridge.
