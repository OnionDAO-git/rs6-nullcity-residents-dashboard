# QA Packet `qa-20260604-1326-debug-erroring-cohort-truth`

- Time: 2026-06-04 13:23-13:28 CDT
- Classification: READ-ONLY
- Scope: `/debug` operator truth while the live controller cohort is active but `ERRORING (inference)`
- Dashboard repo SHA: `4542463`
- Server repo SHA: `53b7761d`
- Runtime authority: shared/stewarded, no restart authority

## Why This Packet

Earlier same-day packets proved a false-empty `/debug` state when the runtime was healthy. This cycle rechecked one narrower question only: when the controller cohort is present but fully degraded into inference errors, does `/debug` surface that truth, or does it still claim the city is simply offline and empty?

## Orientation Summary

- Dashboard repo branch: `codex/storyteller-overview-bff` tracking `origin/codex/storyteller-overview-bff`
- Dashboard repo dirty state before packet:
  - modified `packages/server/src/projector-overview.ts`
  - modified `packages/server/src/projector-overview.test.ts`
  - untracked `docs/qa/`
- Server repo branch: `agents/wip` tracking `origin/agents/wip`
- Server repo dirty state before packet:
  - modified `docs/agent-status.md`
  - modified `docs/issue-register.md`
  - multiple untracked QA/evidence artifacts
- Shared runtime screens present:
  - `nullcity-infra`
  - `nullcity-game`
  - `nullcity-controller`
  - `nullcity-dashboard-server`
  - `nullcity-dashboard-web`
  - extra detached `nullcity-storyteller`
- Listening ports present:
  - `43591`, `43592`, `43594`, `43595`, `43596`, `43610`, `43611`, `8787`, `5174`
- `qmd` unavailable in `PATH`
- Shell loopback probes to localhost ports fail in this sandbox even while the in-app browser can render `5174` routes, so browser-visible truth is the authoritative HTTP check for this packet

## Commands And Probes

- `git -C /Users/james/Code/OnionDAO/rs6-nullcity-residents-dashboard status -sb`
- `git -C /Users/james/Code/OnionDAO/rs6-nullcity-server status -sb`
- `git -C /Users/james/Code/OnionDAO/rs6-nullcity-residents-dashboard rev-parse --abbrev-ref HEAD`
- `git -C /Users/james/Code/OnionDAO/rs6-nullcity-server rev-parse --abbrev-ref HEAD`
- `screen -ls`
- `lsof -iTCP -sTCP:LISTEN -nP | rg ':(43591|43592|43594|43595|43596|43610|43611|5174|8787)\\b'`
- `command -v qmd || which qmd`
- `cd /Users/james/Code/OnionDAO/rs6-nullcity-server && npm run controller:status --silent`
- In-app browser, fresh loads of:
  - `http://127.0.0.1:5174/`
  - `http://127.0.0.1:5174/debug`
  - `http://127.0.0.1:5174/inbox?human=demo@onion`

## Runtime Truth For Correlation

### Controller status shows a present but degraded active cohort

Command:

```bash
cd /Users/james/Code/OnionDAO/rs6-nullcity-server && npm run controller:status --silent
```

Observed at `2026-06-04T18:23:42.681Z`:

- `HEALTH: ERROR — fetch failed [default/qwopus3.5-27b-v3]`
- `residents=25 erroring=10`
- All 10 active cohort residents were present as `ERRORING (inference)` rather than offline:
  - `res:agent`
  - `res:hans`
  - `res:qa-banker`
  - `res:qa-cook`
  - `res:qa-guardian`
  - `res:qa-scout`
  - `res:qa-social`
  - `res:qa-survivor`
  - `res:qa-trader`
  - `res:qa-woodcutter`

This is not an empty city. It is a live runtime in a materially degraded state.

## Browser Evidence

### 1. Attendee root still paints a false zero-state

- Route: `http://127.0.0.1:5174/`
- Method: in-app browser, fresh load, wait `+3s`, read-only

Observed:

- `Loading city state`
- `AP 0`
- `GP 0`
- `Guest mode`
- `CITY ALIVE 0 / 0 online`

The route remained on a zero/guest fallback instead of showing any live resident count.

### 2. `/debug` stays false-empty instead of showing a degraded controller

- Route: `http://127.0.0.1:5174/debug`
- Method: in-app browser, fresh load, wait `+4s`, read-only

Observed:

- `Loading dashboard state`
- `GATEWAY offline`
- `CONTROLLER quiet`
- `ONLINE 0`
- `RUNTIME 0`
- `No readiness checks reported`
- `RESIDENT HEALTH 0 / 0`

Console logs only showed repeated Vite reconnect noise:

- `[vite] connecting...`
- `[vite] connected.`

There were no visible app-level console errors explaining the false-empty state.

### 3. Public inbox route responds, but only in guest-login mode

- Route: `http://127.0.0.1:5174/inbox?human=demo@onion`
- Method: in-app browser, fresh load, read-only

Observed:

- `INBOX`
- `Login to view inbox`
- `Use the Onion DAO login to load AP, GP, inbox, Embassy actions, and print workflows.`

This proves the attendee shell is serving routes, but it does not provide inbox truth without authentication.

## Expected Versus Observed

- Expected: `/debug` should at minimum distinguish a degraded controller from an offline/empty city, especially when `controller:status` shows 25 residents with 10 active-cohort inference failures
- Observed: `/debug` continued to present `offline / quiet / 0 / 0`, which misdescribes the live failure mode and hides the active-but-erroring cohort entirely

## Assessment

Status: `Reproduced`

This is still a human-visible truth bug, and the current degraded runtime makes the wording more misleading. The live city is not absent; it is present and failing inference. `/debug` currently collapses that into a dead-city display.

## Issue Handling

- Canonical issue target remains the previously proposed `QA-20260603-091`
- This packet adds a stronger variant of that issue: false-empty operator UI during active inference degradation, not just a short first-paint mismatch
- I did not edit `/Users/james/Code/OnionDAO/rs6-nullcity-server/docs/issue-register.md`
- Reason 1: it is already dirty in another shared thread
- Reason 2: this run is constrained to safe, low-risk QA evidence work

## QA Result

- Result: regression reproduced under worse live conditions
- Mutations performed: none
- Runtime restart requested/performed: none
- Code fix attempted: none

## Recommended Next Narrow Target

Keep the next cycle read-only and implementation-facing:

1. correlate `/debug` fallback state with whatever request path should source `gateway/controller/online/runtime`
2. isolate whether the false-empty display is caused by frontend boot defaults, a failed BFF fetch path, or cached stale client state
3. do not broaden into economy, Storyteller, or public-shell work until `/debug` truth is isolated
