# QA Packet `qa-20260604-1327-dashboard-shell-truth`

- Date: 2026-06-04 13:27 CDT
- Classification: READ-ONLY
- Target: attendee shell and debug shell live-truth rendering
- Repo heads: server `53b7761d`, dashboard `5efc491`

## Scope

Validate whether the human-facing dashboard surfaces still reflect the live shared runtime truth without mutating residents, restarting services, or editing shared runtime docs.

## Orientation Summary

- Shared screens present: `nullcity-infra`, `nullcity-game`, `nullcity-controller`, `nullcity-dashboard-server`, `nullcity-dashboard-web`, `nullcity-storyteller`
- Expected ports listening: `43591`, `43592`, `43594`, `43595`, `43596`, `43610`, `43611`, `5174`, `8787`
- `qmd` CLI: unavailable on PATH
- Server worktree dirty: `docs/agent-status.md`, `docs/issue-register.md`, many prior untracked QA docs/artifacts
- Dashboard worktree dirty: `packages/server/src/projector-overview.ts`, `packages/server/src/projector-overview.test.ts`, existing untracked `docs/qa/`
- Because the server issue register is already dirty, this packet records evidence only and does not edit issue rows

## Read-Only Checks

### Runtime / controller truth

Command:

```bash
cd /Users/james/Code/OnionDAO/rs6-nullcity-server && npm run controller:status --silent
```

Observed:

- Health `ok` against `default/qwopus3.5-27b-v3@q4_k_s`
- `25` known residents
- `7` acting now: `res:agent`, `res:qa-banker`, `res:qa-cook`, `res:qa-scout`, `res:qa-survivor`, `res:qa-trader`, `res:qa-woodcutter`
- `3` currently marked `STUCK`: `res:hans`, `res:qa-guardian`, `res:qa-social`

Command:

```bash
cd /Users/james/Code/OnionDAO/rs6-nullcity-server && npm run controller:smoke -- --observe-seconds 10 --allow-recent-visible
```

Observed:

- `8 OK / 2 WARN`
- `res:qa-guardian` warned on `effect_timeouts:2`
- `res:qa-banker` warned on `effect_timeouts:1`
- `res:hans` was `OK` in smoke despite `STUCK` in `controller:status`

### Browser-visible route truth

Shell `curl` from this sandbox could not connect to loopback even while `lsof` showed listeners, so browser verification used the in-app browser on `http://127.0.0.1:5174`.

#### `GET /`

Expected:

- attendee shell should reflect live overview/controller read-model truth or at minimum hydrate away from a zeroed placeholder state

Observed after 8s settle:

- route responds with `200` and renders the attendee shell
- page still shows:
  - `AP 0`
  - `GP 0`
  - `CITY ALIVE 0 / 0 online`
  - `No resident roster loaded yet`
  - `No Storyteller run is loaded yet`
  - `Blocked for live demo`
- This contradicts same-cycle runtime truth (`25` known residents, `7` acting, `10` active cohort in smoke)

#### `GET /debug`

Expected:

- debug shell should reflect live runtime/controller/dashboard truth

Observed after 8s settle:

- route responds with `200`
- page title: `Null City Resident Operations`
- page still shows:
  - `GATEWAY offline`
  - `CONTROLLER quiet`
  - `ONLINE 0`
  - `RUNTIME 0`
  - `No residents match the current filters`
- This contradicts same-cycle screen/port/controller evidence

#### `GET /debug/wall`

Expected:

- legacy debug wall should not surface stale/deleted residents or duplicate death broadcasts once newer truth fixes have landed elsewhere

Observed:

- route responds and renders content
- stale residents still present in roster, including paused/offline residents and `res:wf-verify-born`
- `res:loop-check` death broadcast appears 8 times
- footer still says `0 deaths today`

#### `GET /wall`

Observed:

- attendee route returns `404`
- page text: `No city route matches /wall`

## Assessment

- Dashboard web server is reachable, but the attendee shell and `/debug` shell are still presenting false zero-state truth on this run.
- This is a human-visible, demo-breaking truth gap because runtime/controller evidence shows a live cohort while the shell claims the city is empty/offline.
- `/debug/wall` continues to show stale legacy content and duplicate `res:loop-check` death broadcasts; that appears separate from the root shell zero-state issue.

## Suggested Issue Mapping

- Root attendee/debug shell false zero-state: existing proposed `QA-20260603-091` / first-paint-debug-truth lane
- Legacy wall stale/duplicate death content: existing proposed `QA-20260603-089`

## Recommended Next Narrow Target

Read-only BFF/read-model truth isolation:

1. verify whether `/api/overview` itself is stale/empty or whether the Svelte shells fail to hydrate from correct data
2. keep scope to attendee/debug overview only; do not mix in wall or Storyteller fixes
