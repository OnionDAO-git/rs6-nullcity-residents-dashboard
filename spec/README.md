# City Dashboard Plan Set

This directory breaks the city dashboard work into implementation plans. The current dashboard remains valuable as an operations/debug surface, but the public product should become a city-facing dashboard at `city.oniondao.dev` with shared Onion DAO authentication, a new city database, resident social systems, AP/GP economy, the Null City game client, and an admin 3D print queue.

Autonomous dashboard agents should start with `../AGENTS.md`, then claim one `D*` packet or one phase from `09-implementation-roadmap.md`. Server API needs should be recorded in `../../rs6-nullcity-server/docs/city-dashboard-integration.md` or implemented through a separately claimed server `S11` packet.

## Source Context

- Current app: `residents-dashboard`, Bun workspace with `packages/web`, `packages/server`, `packages/shared`, and `packages/observer`.
- Current UI: single Svelte 5 app in `packages/web/src/App.svelte`, hand-rolled pathname routing.
- Current server: Bun BFF in `packages/server/src/index.ts`, with `/api/*`, `/v1/*`, `/rs`, public static event pages, and SPA fallback.
- Landing auth: `/Users/spacemandev/Projects/oniondao-git/landing-2026` uses a Postgres-backed `session` cookie set on `.oniondao.dev` when configured.
- Game client: `/Users/spacemandev/Projects/oniondao-git/RS_NullCity/nullcity-client-ts` is a monolithic translated RuneScape client, already used by this dashboard in spectator mode.
- Null City server: `/Users/spacemandev/Projects/oniondao-git/RS_NullCity/nullcity-server` already has residents, attention decay, death processing, library evidence, logs, inventory, equipment, and the agent gateway.
- FDM Monster local checkout: `/Users/spacemandev/Projects/oniondao-git/fdm-monster` currently only contains a Docker Compose wrapper for `fdmmonster/fdm-monster:2`, so implementation must either pull upstream source/docs or integrate via its runtime API.

## Plan Files

- [01-debug-route-migration.md](01-debug-route-migration.md): move the existing operational dashboard under `/debug`.
- [02-auth-railway-data.md](02-auth-railway-data.md): shared login cookie, Railway deployment, new city database, and landing check-in reads.
- [03-new-dashboard-redesign.md](03-new-dashboard-redesign.md): information architecture and visual/product redesign.
- [04-nullcity-client-integration.md](04-nullcity-client-integration.md): copied/forked game client and authenticated game login.
- [05-profile-economy-ap-gp.md](05-profile-economy-ap-gp.md): attendee profiles, AP/GP ledgers, and point accounting.
- [06-embassy-soul-birth.md](06-embassy-soul-birth.md): soul proposals, AP funding, and resident birth.
- [07-residents-social-overseer.md](07-residents-social-overseer.md): resident overview, public pages, inbox, trade, death, Library of Souls, and overseer service.
- [08-3d-queue-system.md](08-3d-queue-system.md): admin printer management, slicing, printer bridge, and GP-backed print requests.
- [09-implementation-roadmap.md](09-implementation-roadmap.md): phased delivery order and verification gates.

## Core Decisions

1. Keep the existing operations dashboard intact, but route it at `/debug` before introducing the new public dashboard.
2. Treat `landing-2026.users.id` as the stable human identity for city data.
3. Keep city data in a new city Postgres database deployed by this project; read landing data only for auth and check-in award inputs.
4. Use append-only ledgers for AP and GP. Do not store mutable balances without an audit trail.
5. Do not expose the raw game `/rs` proxy or printer credentials to unauthenticated browsers.
6. Use a LAN print bridge for physical printers unless all target printers are reachable from Railway through a deliberate secure tunnel.
7. Keep the Null City server as the game/resident authority. The dashboard should coordinate, not fork resident lifecycle logic into a second source of truth.

## Questions To Resolve

- Exact AP award values for daily check-ins, event check-ins, admin grants, and any bonus streaks.
- Whether old Shards/patron ledgers are migrated, hidden under `/debug`, or mapped into AP.
- Whether static public Embassy pages (`/wall`, `/inbox`, `/patron`, `/graveyard`, `/library`) should move under `/debug` or be replaced at root by the new city product.
- Which login method the forked game client should use: a new RS server SSO ticket, a generated per-user game password, or a separate city game account table.
- Whether Bambu P2S printers are truly supported by the chosen adapter stack on the deployed firmware, and whether Snapmaker U1 should be controlled through Moonraker, FDM Monster, or a custom adapter.
- GP pricing policy for print requests, refunds, cancellations, failed prints, and material/admin overrides.
