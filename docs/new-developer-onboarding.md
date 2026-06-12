# New Developer Onboarding

Welcome to the Null City resident dashboard repo. This repo owns the
human-facing browser experience: attendee dashboard, resident pages, Embassy
surfaces, Storyteller feed, wall, inbox, Library, Graveyard, print queue UI, and
dashboard BFF routes.

The server/controller repo is `../rs6-nullcity-server`.

## First 10 Minutes

Run these before editing:

```bash
git checkout wip/spec
git pull --ff-only
git status --short --branch
bun install
bun run typecheck
```

If the checkout has dirty files you did not create, read them before choosing
work. Do not revert or overwrite another developer or agent's changes.

## Read These In Order

1. `AGENTS.md` for dashboard-specific operating rules.
2. `README.md` for local run, environment, Railway, and auth setup.
3. `SPEC.md` for the original dashboard architecture.
4. `../rs6-nullcity-server/AGENTS.md` for cross-repo boundaries.
5. `../rs6-nullcity-server/docs/agent-status.md` tail for active locks.
6. `../rs6-nullcity-server/docs/issue-register.md` for dashboard P0/P1 bugs.
7. `../landing-2026/docs/nullcity-dev-accounts.md` when login or auth matters.

## Pick One Safe First Task

Dashboard developers should prefer:

1. An unclaimed `Open` P0/P1 issue in the server issue register that names
   dashboard files, dashboard routes, or BFF endpoints.
2. A dashboard launch-blocker row assigned to this repo.
3. A small `D*` dashboard packet from `AGENTS.md` or the current spec roadmap.
4. A copy, first-paint, truth-parity, or browser-smoke bug with a narrow route.

Coordinate claims in the server repo's `docs/agent-status.md`. Include the
issue or packet id, exact files, evidence plan, and whether you need a runtime
restart.

## Repo Boundaries

Do dashboard work here:

- Svelte/TypeScript UI
- dashboard BFF routes
- attendee and operator browser flows
- local auth UX
- browser-visible truth, copy, loading, and error states
- print queue UI and dashboard-facing API clients

Do not duplicate server authority here. Resident lifecycle, AP/GP ledgers,
controller runtime logic, typed game actions, and source-of-truth data mutation
belong in `../rs6-nullcity-server` behind JSON/control APIs.

## Local Run

```bash
bun run dev
```

Open `http://127.0.0.1:5174/` for the web app. For login tests, prefer
`http://localhost:5174/login` so local cookies behave correctly.

The usual local services are:

- web dev server: `127.0.0.1:5174`
- dashboard BFF: `127.0.0.1:8787`
- server AgentGateway: `127.0.0.1:43595`
- RuneScape game gateway: `127.0.0.1:43594`

If you need the shared dashboard restarted, request it through
`../rs6-nullcity-server/docs/agent-status.md` rather than taking over shared
screen sessions.

## Verification Before Handoff

For dashboard changes, run:

```bash
bun run typecheck
bun run check
bun run build
```

For visible UI changes, also open the changed route in a browser and verify the
human-visible state. Include the route, screenshot path if captured, and any API
evidence in your handoff.

## Commit And Handoff

Stage explicit files only:

```bash
git add path/to/file path/to/test
git commit -m "area: concrete behavior summary"
git push origin wip/spec
```

Then add or update the relevant server coordination note with commit SHA, tests,
browser evidence, blockers, and the next recommended task.

## Good First Packets

- Fix one dashboard issue-register row with a focused regression.
- Make one route's loading/error truth less misleading.
- Add browser-visible parity between `/`, `/overview`, `/debug`, and BFF truth.
- Improve a BFF API client fallback without touching server authority.

Avoid broad rewrites, auth changes, or shared runtime restarts until you have
landed one small packet cleanly.
