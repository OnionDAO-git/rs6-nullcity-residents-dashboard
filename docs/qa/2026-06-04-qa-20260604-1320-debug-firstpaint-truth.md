# QA Packet `qa-20260604-1320-debug-firstpaint-truth`

- Time: 2026-06-04 13:20 CDT
- Classification: READ-ONLY
- Target: debug dashboard first-paint truth at `http://127.0.0.1:5174/debug`
- Dashboard repo SHA: `4542463`
- Server repo branch context: `agents/wip`

## Why This Packet

The shared runtime recovered after the earlier availability outage, but the highest-value narrow follow-up was still the human-visible `/debug` truth path previously flagged as unstable. This packet checks only whether the current `/debug` page reflects live runtime state or still paints a false offline city.

## Orientation Summary

- Dashboard repo: branch `codex/storyteller-overview-bff`, upstream `origin/codex/storyteller-overview-bff`, dirty `?? docs/qa/`
- Server repo: branch `agents/wip`, upstream `origin/agents/wip`, behind upstream, dirty `docs/agent-status.md`, dirty `docs/issue-register.md`, plus untracked QA/evidence files
- Shared screens present during this run:
  - `nullcity-infra`
  - `nullcity-game`
  - `nullcity-controller`
  - `nullcity-dashboard-server`
  - `nullcity-dashboard-web`
  - extra `nullcity-storyteller`
- Expected ports were listening during orientation:
  - `43591`, `43592`, `43594`, `43595`, `43596`, `43610`, `43611`, `8787`, `5174`
- `qmd` availability: missing

## Commands And Probes

- `git -C /Users/james/Code/OnionDAO/rs6-nullcity-server status -sb`
- `git -C /Users/james/Code/OnionDAO/rs6-nullcity-residents-dashboard status -sb`
- `screen -ls`
- `lsof -iTCP -sTCP:LISTEN -nP | grep -E ':(43591|43592|43594|43595|43596|43610|43611|5174|8787)\\b'`
- `npm run controller:status --silent` in `/Users/james/Code/OnionDAO/rs6-nullcity-server`
- In-app browser route check for `http://127.0.0.1:5174/debug`
- In-app browser console log read for the same tab

## Current Live Truth

### Controller-side reality

`npm run controller:status --silent` at `2026-06-04T18:21:47.725Z` reported:

- `HEALTH: ok — probe ok (8675ms) [default/qwopus3.5-27b-v3@q4_k_s]`
- `residents=25 erroring=0`
- `ALIVE_ACTING`: `res:hans`, `res:qa-banker`, `res:qa-cook`, `res:qa-guardian`, `res:qa-scout`, `res:qa-survivor`, `res:qa-trader`, `res:qa-woodcutter`
- `STUCK`: `res:agent`, `res:qa-social`
- This means the live runtime was not empty and had `8` acting residents plus `2` stuck cohort residents at the time of the page check.

### `/debug` page reality

The browser reached `http://127.0.0.1:5174/debug` and rendered the page title `Null City Resident Operations`, but both the initial DOM snapshot and the snapshot taken about 12 seconds later still showed the same false-red state:

- `Gateway offline`
- `Controller quiet`
- `Online 0`
- `Runtime 0`
- `Event Readiness needs attention`
- `No readiness checks reported`
- `Resident Health 0 / 0`
- `No residents match the current filters`
- `No recent events`
- `No recent patron letters`
- `Loading dashboard state`

This was still present after a 12-second wait, so the current failure is worse than the earlier short first-paint flicker and matches the longer-lived `/debug` false-red behavior previously observed on 2026-06-03.

### Browser console

The page console only showed Vite client connect messages:

- `[vite] connecting...`
- `[vite] connected.`

No visible console error surfaced in the captured browser log sample.

## Artifacts

- Initial screenshot: `/private/tmp/qa-20260604-1320-debug-firstpaint-initial.png`
- Delayed screenshot: `/private/tmp/qa-20260604-1320-debug-firstpaint-hydrated.png`

## Result

Regression confirmed. The shared runtime is alive, but `/debug` still presents a dead city after load instead of reflecting current controller truth.

## Issue / Handoff

- Reuse proposed `QA-20260603-091` rather than opening a fresh duplicate.
- `docs/issue-register.md` was already dirty in the server repo, so this cycle did not mutate it.

## Recommended Next Narrow Target

`qa-20260604-<time>-debug-bff-contract-truth`

Check one layer deeper, still read-only:

- compare `/debug` browser state against the dashboard BFF overview payload as seen from a browser-accessible route
- determine whether the failure is frontend hydration/state wiring, Vite proxying, or BFF reachability from the web app
