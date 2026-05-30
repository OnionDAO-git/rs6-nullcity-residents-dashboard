# Dashboard Agent Guide

This repo owns the human-facing Null City UI. If a task affects what attendees, admins, or operators see in the browser, do it here instead of adding UI to `../rs6-nullcity-server`.

## Start Here

Before changing dashboard behavior, read:

1. `SPEC.md` for the original operations-dashboard architecture.
2. `spec/README.md` for the current city-dashboard plan set.
3. `spec/09-implementation-roadmap.md` for phase order and verification gates.
4. `../rs6-nullcity-server/AGENTS.md` for cross-repo rules and server boundaries.
5. `../rs6-nullcity-server/docs/2026-05-29-weekend-sprint-plan.md` for the active weekend product direction.
6. `../rs6-nullcity-server/docs/city-dashboard-integration.md` for server JSON contracts.

## Mission

Build the dashboard, Embassy, resident pages, spectator/world view, AP/GP profile surfaces, Soul proposal/funding flows, Storyteller feed, and 3D print queue. The server repo remains the authority for game state, residents, controller runtime, logs, benchmarks, and JSON/control APIs.

## Active Dashboard Packets

Use these `D*` packets alongside `spec/09-implementation-roadmap.md`:

| Packet | Goal |
|---|---|
| `D0` | Keep existing operations UI safe under `/debug`; preserve spectator/admin flows. |
| `D1` | City shell/profile with AP and GP summary. |
| `D2` | Soul proposal and AP funding flow. |
| `D3` | Resident public/detail pages showing goal, AP, GP, model, endpoint, SPARK module, recent evidence, and Library strategy. |
| `D4` | Inbox/AP grants and AP-for-GP trade flow. |
| `D5` | Storyteller feed and operator review panel. |
| `D6` | NCRI and print queue views. |
| `D7` | Authenticated world/spectator route. |
| `D8` | Dashboard release QA: browser screenshots, mobile checks, and demo script updates. |

## Coordination

- Work on `main` unless James asks for a feature branch.
- Check `git status --short` before editing.
- If a dashboard task needs new server data, update `../rs6-nullcity-server/docs/city-dashboard-integration.md` or claim an `S11` server contract packet. Do not make ad hoc server UI.
- Keep server commits and dashboard commits separate unless James explicitly asks for a cross-repo landing.
- Do not commit secrets, API keys, cookies, printer credentials, or private human handles.

Paste-ready kickoff prompt:

```text
You are an autonomous dashboard agent in /Users/james/Code/OnionDAO/rs6-nullcity-residents-dashboard on branch main. Read AGENTS.md, SPEC.md, spec/README.md, spec/09-implementation-roadmap.md, and ../rs6-nullcity-server/docs/2026-05-29-weekend-sprint-plan.md. Claim one D* packet or one phase from spec/09, implement UI/BFF changes in this repo, request/record any server API needs through ../rs6-nullcity-server/docs/city-dashboard-integration.md or S11, run bun run typecheck && bun run check && bun run build, commit and push main.
```

## Verification

Run focused package checks while iterating, then before completion run:

```bash
bun run typecheck
bun run check
bun run build
```

For visible UI changes, also do a browser smoke at the relevant route and capture screenshots when practical.

## Boundaries

- Dashboard BFF routes, Svelte/TypeScript UI, observer/game client integration, print bridge UI, and public Embassy surfaces belong here.
- Game/resident state mutation belongs in `../rs6-nullcity-server` through typed JSON/control APIs.
- Do not duplicate resident lifecycle, AP/GP ledger authority, or controller runtime logic in this repo.
