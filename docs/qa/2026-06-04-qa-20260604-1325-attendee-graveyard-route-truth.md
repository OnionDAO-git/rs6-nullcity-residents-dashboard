# QA Packet `qa-20260604-1325-attendee-graveyard-route-truth`

- Time: 2026-06-04 13:25-13:32 CDT
- Classification: READ-ONLY
- Scope: attendee/public graveyard route truth
- Repo state:
  - Dashboard repo on `codex/storyteller-overview-bff` with untracked `docs/qa/`
  - Server repo on `agents/wip`, dirty in `docs/agent-status.md` and `docs/issue-register.md`

## Goal

Verify whether the human-facing attendee graveyard route is actually available and truthful on the shared local stack, and correlate that behavior with the current dashboard route map.

## Runtime context

- Shared screens present: `nullcity-infra`, `nullcity-game`, `nullcity-controller`, `nullcity-dashboard-server`, `nullcity-dashboard-web`, `nullcity-storyteller`
- Listening ports present: `43591`, `43592`, `43594`, `43595`, `43596`, `43610`, `43611`, `8787`, `5174`
- `npm run controller:status --silent` at 2026-06-04T18:20:28Z reported `HEALTH: ok`, `25` known residents, `5` `ALIVE_ACTING`, `5` `STUCK`

## Evidence

### Browser-visible route results

Verified in the in-app browser against `http://127.0.0.1:5174`:

1. `GET /graveyard`
   - Expected: public graveyard surface loads, consistent with repo README
   - Observed: attendee shell renders `NOT FOUND` and `404 No city route matches /graveyard`
2. `GET /graveyard/`
   - Expected: same public graveyard surface or canonical redirect
   - Observed: same `404 No city route matches /graveyard`
3. `GET /debug/graveyard`
   - Expected: legacy/debug graveyard remains reachable under `/debug`
   - Observed: loads `Null City — Graveyard` with subtitle `Those who walked here, and are gone`
4. `GET /debug/graveyard/`
   - Expected: same as `/debug/graveyard`
   - Observed: same legacy/debug graveyard surface loads

### Route/code correlation

- [`/Users/james/Code/OnionDAO/rs6-nullcity-residents-dashboard/README.md`](/Users/james/Code/OnionDAO/rs6-nullcity-residents-dashboard/README.md) states the graveyard should be available at `http://127.0.0.1:5174/graveyard`.
- [`/Users/james/Code/OnionDAO/rs6-nullcity-residents-dashboard/packages/web/src/lib/routes.ts`](/Users/james/Code/OnionDAO/rs6-nullcity-residents-dashboard/packages/web/src/lib/routes.ts) does not include `/graveyard` in `isKnownCityRoute(...)`, so the attendee shell treats it as unknown and renders the 404 page.
- [`/Users/james/Code/OnionDAO/rs6-nullcity-residents-dashboard/packages/server/src/static.ts`](/Users/james/Code/OnionDAO/rs6-nullcity-residents-dashboard/packages/server/src/static.ts) still serves `/debug/graveyard` and explicitly classifies `/graveyard` and `/graveyard/` as retired operations routes.

## Assessment

- Status this cycle: Regressed
- Confidence: High
- Truth statement: the attendee/public graveyard route is not available on the shared local stack even though project docs still present `/graveyard` as a public URL. Only the legacy/debug graveyard currently works.

## Follow-up

- Do not mark the public graveyard as demo-ready.
- When the server issue register is not in a collision state, open or update a dashboard-facing issue for the route/doc split:
  - either restore a public `/graveyard` attendee route
  - or correct the docs and navigation to stop promising it
