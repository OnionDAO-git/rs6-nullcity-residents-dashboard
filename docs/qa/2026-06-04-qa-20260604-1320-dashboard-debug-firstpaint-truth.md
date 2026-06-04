# QA Packet `qa-20260604-1320-dashboard-debug-firstpaint-truth`

- Time: 2026-06-04 13:23 CDT
- Classification: READ-ONLY
- Scope: Debug dashboard first-paint truth on the live shared stack
- Dashboard repo SHA: `4542463`
- Server repo SHA: `53b7761d`
- Runtime authority: shared/stewarded, no restart authority

## Why This Packet

Prior QA packets proposed `QA-20260603-091`: the `/debug` dashboard can present a false-empty city on first paint even when the live runtime is healthy. This packet rechecks that single human-visible claim with same-run evidence from both the browser UI and the overview JSON.

## Orientation Summary

- Dashboard repo branch: `codex/storyteller-overview-bff`
- Dashboard repo dirty state before this packet: untracked `docs/qa/` only
- Server repo branch: `agents/wip`, behind upstream, dirty in `docs/agent-status.md`, `docs/issue-register.md`, and other QA artifacts
- Shared runtime screens present: `nullcity-infra`, `nullcity-game`, `nullcity-controller`, `nullcity-dashboard-server`, `nullcity-dashboard-web`
- Shell-localhost `curl` remains blocked in this sandbox even while browser access to the same routes works, so browser verification is the trustworthy route for HTTP truth in this packet
- `qmd` unavailable in PATH

## Commands And Probes

- `git -C /Users/james/Code/OnionDAO/rs6-nullcity-server status -sb`
- `git -C /Users/james/Code/OnionDAO/rs6-nullcity-residents-dashboard status -sb`
- `screen -ls`
- `lsof -nP -iTCP -sTCP:LISTEN | rg '(:8787|:5174)'`
- `cd /Users/james/Code/OnionDAO/rs6-nullcity-server && npm run controller:status`
- `cd /Users/james/Code/OnionDAO/rs6-nullcity-server && npm run controller:smoke -- --observe-seconds 15 --allow-recent-visible`
- In-app browser, route `http://127.0.0.1:5174/debug`
- In-app browser, route `http://127.0.0.1:8787/api/overview`

## Runtime Truth For Correlation

- `controller:status` reported `HEALTH: ok — probe ok (3182ms)` with `residents=25 erroring=0`
- `controller:smoke` returned `4 OK / 6 WARN`
- Same-run controller-visible active or recently acting residents included `res:hans`, `res:qa-banker`, `res:qa-scout`, and `res:qa-woodcutter`
- The 10-resident cohort was not empty; the remaining cohort members were visible as `STUCK` or `WARN`, not offline city-wide failure

## Browser Evidence

### 1. Fresh `/debug` load paints a false-dead city

- Route: `http://127.0.0.1:5174/debug`
- Method: in-app browser, fresh tab, read-only
- Screenshot artifact: `/private/tmp/qa-20260604-1320-debug-firstpaint-false.png`

Observed on the first paint and still present at `+500ms` and `+1500ms`:

- `Gateway offline`
- `Controller quiet`
- `Online 0`
- `Runtime 0`
- `Event Readiness needs attention`
- `No readiness checks reported`

Structured DOM snapshots from the same tab showed the same false-red values:

- `0ms`: `Gateway offline`, `Controller quiet`, `Online 0`, `Runtime 0`
- `500ms`: unchanged
- `1500ms`: unchanged

### 2. The same `/debug` tab self-corrects by about three seconds

- Route: `http://127.0.0.1:5174/debug`
- Method: same tab, no interaction besides waiting
- Screenshot artifact: `/private/tmp/qa-20260604-1320-debug-firstpaint-hydrated.png`

At `+3000ms`, the route flipped to live truth:

- `Gateway connected`
- `Controller available`
- `Online 10`
- `Runtime 27`
- `Event Readiness ready`

The hydrated route also displayed the live cohort summary:

- `10 active in controller cohort; 13 paused/cohort-excluded of 23 known residents`

### 3. Same-run overview JSON was already live while `/debug` was painting false red

- Route: `http://127.0.0.1:8787/api/overview`
- Method: separate in-app browser tab, read-only

Observed JSON excerpt from the same packet:

- `"gateway":{"connected":true`
- `"controller":{"available":true`
- `"residentsWithRuntime":27`
- `res:agent` payload showed live feed state with fresh tick data

This rules out a genuinely dead runtime during the false `/debug` paint.

## Assessment

Status: `Reproduced`

The `/debug` dashboard is still not truthful on first paint. For roughly the first 1.5 seconds of a fresh load, it presents a dead/empty city even though the same-run overview API and controller tooling show a live runtime with 27 resident runtimes and 10 online cohort residents. The route eventually hydrates to correct values, but the initial false-red state remains human-visible and demo-risky.

## Issue Handling

- Canonical issue target remains the previously proposed `QA-20260603-091`
- I did not edit `/Users/james/Code/OnionDAO/rs6-nullcity-server/docs/issue-register.md` because that shared file is already dirty in another thread and is an explicit collision zone for this run
- This packet is therefore an evidence update only

## QA Result

- Result: regression reproduced
- Mutations performed: none
- Runtime restart requested/performed: none
- Code fix attempted: none

## Recommended Next Narrow Target

Follow up the same issue from the implementation side only when a clean worktree is available:

1. compare the `/debug` first-paint fallback state against the already-live `/api/overview` payload
2. isolate whether the false state is coming from frontend initial defaults, hydration timing, or BFF route bootstrapping
3. keep the check scoped to `/debug` rather than broadening into unrelated dashboard surfaces
