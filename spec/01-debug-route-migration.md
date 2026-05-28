# Plan: Move Existing Dashboard Routes Under `/debug`

## Goal

Preserve the current resident operations dashboard exactly as a debug/admin surface, but remove it from the root URL space so `/` can become the redesigned city dashboard.

## Current Routes

The Svelte app currently derives route state directly from `window.location.pathname` in `packages/web/src/App.svelte`.

Operational SPA routes:

- `/`: current operations overview.
- `/residents`: roster.
- `/residents/new`: spawn form.
- `/residents/:name`: resident detail, spectator, body, activity, action logs, inference logs.
- `/observe`: observable subject list.
- `/observe/resident/:name` and `/observe/player/:username`: spectator sessions.
- `/benchmarks`: benchmark leaderboard and run table.
- `/benchmarks/:runId`: benchmark detail.
- `/souls`: read-only soul browser.
- `/logs`: action and inference logs.

Public/static event routes currently preempt the SPA in `packages/server/src/static.ts`:

- `/index.html`
- `/wall`
- `/inbox`
- `/patron`
- `/graveyard`
- `/library`

API and protocol routes:

- `/api/*`: dashboard BFF endpoints.
- `/v1/*`: public event APIs.
- `/rs`: WebSocket TCP proxy for the game client.

## Target Routes

Operational SPA routes should become:

- `/debug`
- `/debug/residents`
- `/debug/residents/new`
- `/debug/residents/:name`
- `/debug/observe`
- `/debug/observe/resident/:name`
- `/debug/observe/player/:username`
- `/debug/benchmarks`
- `/debug/benchmarks/:runId`
- `/debug/souls`
- `/debug/logs`

Keep these unprefixed unless explicitly decided otherwise:

- `/api/*`
- `/rs`
- new city public routes

Default recommendation: move only the operational SPA to `/debug` in the first pass. Leave the old public Embassy static pages alone only if they will be immediately replaced by new city routes. If they are considered "current dashboard routes", move them too in a second pass to avoid ambiguous public content.

## Implementation Steps

1. Add route helpers in `packages/web/src/lib/routes.ts`.
   - `DEBUG_PREFIX = '/debug'`
   - `isDebugPath(pathname: string): boolean`
   - `toDebugInternalRoute(pathname: string): string`
   - `debugPath(route: string): string`
   - `cityPath(route: string): string`

2. Normalize routes in `App.svelte`.
   - Keep `browserPath = window.location.pathname`.
   - Derive `debugRoute = toDebugInternalRoute(browserPath)`.
   - Existing debug UI conditions should use `debugRoute`.
   - New city UI should render when `browserPath` does not start with `/debug`.

3. Update debug navigation.
   - Existing `nav('/residents')` calls should navigate to `debugPath('/residents')`.
   - Active state checks should compare against `debugRoute`, not `browserPath`.
   - Resident table row selection should emit debug-prefixed URLs.

4. Update route parsing.
   - `parts` should be based on `debugRoute.split('/').filter(Boolean)` for debug views.
   - `residentName`, `benchmarkRunId`, `observeKind`, and `observeId` should be derived from `debugRoute`.

5. Keep API calls unchanged.
   - `/api/*` paths in `packages/web/src/lib/api.ts` stay root-relative.
   - `EventSource` paths stay root-relative.
   - `/rs` stays root-relative.

6. Add redirects for old operational routes.
   - In the web app, if `browserPath` matches a legacy operational route and not a new city route, redirect with `history.replaceState` to `/debug/...`.
   - On the server, optionally add 308 redirects for direct browser hits to old paths once the new city routes are live.
   - Do not redirect `/api`, `/v1`, `/rs`, asset paths, or new city routes.

7. Decide public Embassy page treatment.
   - If moved: update `eventPageRoutes` in `packages/server/src/static.ts` to `/debug/wall`, `/debug/inbox`, `/debug/patron`, `/debug/graveyard`, `/debug/library`.
   - Update `packages/web/vite.config.ts` proxy list for those paths.
   - Update `embassyPages` in `App.svelte`.
   - Update absolute links inside `packages/server/public/*.html`.
   - Keep `/v1/*` stable for now, because static pages can call the same APIs after moving.

8. Add tests.
   - `packages/server/src/static.test.ts`: SPA fallback works for `/debug/residents/res-agent`.
   - If static pages move: `eventPublicPagePath('/debug/wall', ...)` maps correctly and old `/wall` behavior is documented.
   - Web route helper unit tests for root, nested debug paths, query strings, and legacy redirects.

## Acceptance Criteria

- Visiting `/debug` renders the current operations overview.
- Visiting every current operations route under `/debug` renders the same panel/data it rendered before.
- Existing API calls, runtime streams, observer streams, and `/rs` proxy still work.
- Root `/` is free for the new city dashboard.
- Old operational routes either redirect to `/debug/*` or are deliberately claimed by the new city app.
- Public/static Embassy page behavior is explicitly covered by tests and docs.

## Questions

- Does "all current dashboard routes" include the static public Embassy pages, or only the Svelte operations app?
  - includes static public embassy pages
- Should legacy operational paths redirect permanently, temporarily, or return 404 after the redesign?
  - 404
- Should `/debug` require admin auth immediately, or remain behind whatever network boundary exists until auth lands?
  - remain behind network boundry til admin auth
