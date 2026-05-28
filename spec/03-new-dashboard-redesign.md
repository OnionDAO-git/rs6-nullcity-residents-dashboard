# Plan: Redesigned City Dashboard

## Goal

Replace the current operations-first dashboard at `/` with a city-facing product that helps attendees see their profile, spend and earn AP/GP, play or watch Null City, propose and fund souls, communicate with residents, and request 3D prints. The current operational dashboard moves to `/debug`.

## Brand Direction

Use the existing Null City dashboard brand system from `SPEC.md` and `packages/web/src/app.css`, plus the Onion DAO light-mode identity from `landing-2026/reference/brand`.

Design principles:

- Null City surfaces are dark, dense, and operational.
- Human/Onion DAO profile surfaces can use the light plaster/ink palette when the user is acting as an attendee.
- Signal shard colors are shared across both modes: blue, green, gold, rose, teal, amber, mauve, bone.
- Keep information dense and scannable. This is a working city console, not a marketing page.
- Use actual resident/game/print data as the first-viewport signal.
- Do not create a generic landing page. `/` should be a usable dashboard immediately.

## New Route Map

Public or session-aware:

- `/`: city overview.
- `/login`: redirect helper to landing login.
- `/residents`: resident directory.
- `/residents/:residentId`: resident public profile.
- `/library`: Library of Souls.

Authenticated attendee:

- `/profile`: profile, AP/GP balances, award history.
- `/world`: embedded/forked Null City client.
- `/embassy`: soul proposals needing attention.
- `/embassy/new`: soul proposal composer.
- `/embassy/:proposalId`: proposal detail, contribution panel, comments/history.
- `/inbox`: attendee inbox across residents.
- `/inbox/:threadId`: 1:1 resident conversation and trades.
- `/prints`: attendee print request dashboard.
- `/prints/new`: submit model and request quote/approval.
- `/prints/:requestId`: print request status.

Admin:

- `/admin`: admin overview.
- `/admin/printers`: Bambu/Snapmaker printer registration and health.
- `/admin/print-queue`: queue board and job controls.
- `/admin/souls`: soul moderation and birth controls.
- `/admin/economy`: AP/GP grants, adjustments, audit trail.
- `/admin/overseer`: ingestion health, resident logs, Library projections.

Debug:

- `/debug/*`: the existing resident operations dashboard.

## First Screen

The authenticated `/` screen should show:

- User identity and AP/GP balances.
- One prominent "Enter City" game client action.
- Embassy proposals close to birth and user's past contributions.
- Resident activity highlights: alive, low AP, recently posted, recently born, recently died.
- Inbox unread counts and resident AP requests.
- Print queue status for the user's requests.
- Admin alert strip if user is admin.

No cards inside cards. Use full-width bands and compact panels with clear scan hierarchy.

## Navigation

Use a persistent shell:

- Desktop: left rail or top/side hybrid with icon+text items.
- Mobile: bottom nav for primary user flows, overflow menu for admin/debug.
- Primary items: Overview, World, Embassy, Residents, Inbox, Prints, Profile.
- Admin and Debug are visually separated.

Use icons where available:

- World: map/monitor icon.
- Embassy: landmark or file-plus icon.
- Residents: users icon.
- Inbox: inbox/message icon.
- Prints: printer icon.
- Profile: user/circle icon.
- Debug: terminal/bug icon.

## Core Views

### Profile

- Profile snapshot from landing: name, handle, avatar, email.
- AP and GP balances.
- Earning history from daily/event check-ins.
- Spend history: soul contributions, resident grants, print requests.
- Pending trades and pending print burns.

### World

- Full-bleed game client area, not trapped in a decorative card.
- Side rail for online residents, location, chat/inbox shortcuts, AP/GP compact status.
- If the game client is unavailable, show an actionable error with server/proxy status.

### Embassy

- Proposal list sorted by funding progress, time, and user contribution.
- Filters: needs AP, ready to birth, born, mine.
- Proposal detail shows soul text, starting levels/equipment, attention threshold, contribution history, moderation status.
- New proposal composer is structured, not a blank textarea only.

### Residents

- Directory with alive/deceased/filter states.
- Resident public pages show portrait/model, stats, equipment, current thoughts, public posts, goal, AP state, and message/trade actions.
- Keep raw logs behind admin/debug.

### Inbox

- Thread list grouped by resident.
- Resident AP requests are first-class message types.
- Trade proposal messages include accept/decline controls.
- 1:1 messages are private to the attendee and that resident, except admin audit.

### Prints

- Upload/request flow.
- Quote state before GP burn.
- GP burn confirmation.
- Queue position, printer assignment, slicing status, print status, completion/failure.
- Admin status messages visible to attendee.

### Admin

- Dense operational pages.
- Printer queue board.
- Soul moderation queue.
- Economy audit tools.
- Overseer ingestion health.
- `/debug` entry point.

## Frontend Implementation Plan

1. Add a route abstraction before adding new routes.
   - Keep current debug app behind a `DebugDashboard` component.
   - Add new `CityAppShell` and route modules.

2. Split `App.svelte`.
   - `App.svelte`: session bootstrap and route shell selection.
   - `routes/debug/DebugDashboard.svelte`: old dashboard.
   - `routes/city/*`: new dashboard pages.
   - `lib/components/*`: shared panel, table, ledger, resident card, point meter, upload controls.

3. Add session bootstrap.
   - `GET /api/session`.
   - Client state: loading, logged out, logged in, admin.

4. Add typed API clients.
   - Keep old `api` for debug operations.
   - Add `cityApi` for auth/profile/economy/embassy/prints/inbox.

5. Build data-empty states.
   - New user with no AP yet.
   - No proposals.
   - No resident messages.
   - No printers online.

6. Verify visually.
   - Desktop and mobile Playwright checks.
   - Ensure game canvas renders.
   - Ensure long names, long resident messages, and large ledger numbers do not overlap.

## Acceptance Criteria

- `/` is a usable authenticated city dashboard, not the old operations dashboard.
- `/debug` still exposes the old operations dashboard.
- The UI uses the existing Null City/Onion DAO tokens and does not introduce an unrelated visual system.
- User can reach all core functions from the first screen in one or two clicks.
- Admin and debug affordances are not shown to normal attendees except where safe.
- Mobile layouts preserve readable controls and do not overlap.

## Questions

- Should the city dashboard default to Null City dark mode, Onion DAO light mode, or mixed by surface?
  - null city dark
- Are resident public pages visible without login, or only to authenticated attendees?
  - visible without login
- Should the old static Embassy pages be replaced by new city routes or kept under `/debug` for event fallback?
  - kept under /debug
- Should attendees see all residents, or only residents that are public/alive?
  - public/alive
