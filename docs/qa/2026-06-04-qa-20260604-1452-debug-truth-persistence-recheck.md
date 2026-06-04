# QA Packet `qa-20260604-1452-debug-truth-persistence-recheck`

- Time: 2026-06-04 14:52 CDT
- Classification: READ-ONLY with docs-only evidence capture
- Scope: recheck the operator `/debug` false-red state against same-run live runtime truth
- Dashboard repo SHA: `be24165b`
- Server repo SHA: `53b7761d`
- Runtime authority: shared/stewarded, no restart authority

## Why This Packet

Earlier same-day packets already showed that the attendee shell `/` can recover to a live fallback while the operator shell `/debug` stays stuck on `offline / quiet / 0 / 0`.

This packet stays narrow on one question only: does that split still reproduce on the current shared runtime after the earlier 14:21 persistence check?

## Orientation Summary

- Dashboard repo branch: `codex/storyteller-overview-bff` tracking `origin/codex/storyteller-overview-bff`
- Dashboard repo dirty state before packet: untracked `docs/qa/`
- Server repo branch: `agents/wip` tracking `origin/agents/wip`, behind upstream, dirty in `docs/agent-status.md`, `docs/issue-register.md`, and prior QA artifacts
- Shared runtime screens present: `nullcity-infra`, `nullcity-game`, `nullcity-controller`, `nullcity-dashboard-server`, `nullcity-dashboard-web`, `nullcity-storyteller`
- Listening ports present: `43591`, `43592`, `43594`, `43595`, `43596`, `43610`, `43611`, `8787`, `5174`
- `qmd` unavailable in `PATH`
- Shell loopback HTTP remained blocked from this sandbox, so browser-visible route truth was correlated against local process and controller-status evidence

## Commands And Probes

- `git -C /Users/james/Code/OnionDAO/rs6-nullcity-residents-dashboard status --short --branch`
- `git -C /Users/james/Code/OnionDAO/rs6-nullcity-server status --short --branch`
- `screen -ls`
- `lsof -nP -iTCP -sTCP:LISTEN | rg ':(43591|43592|43594|43595|43596|43610|43611|5174|8787)\b'`
- `command -v qmd || which qmd`
- `cd /Users/james/Code/OnionDAO/rs6-nullcity-server && npm run controller:status -- --json`
- In-app browser, read-only loads of:
  - `http://127.0.0.1:5174/`
  - `http://127.0.0.1:5174/debug`
  - `http://127.0.0.1:5174/library`

## Runtime Truth For Correlation

### 1. Shared runtime was up on all expected screens and listeners

Observed during this packet:

- `screen -ls` showed all expected shared sessions present
- `lsof` showed listeners on:
  - `43591`
  - `43592`
  - `43594`
  - `43595`
  - `43596`
  - `43610`
  - `43611`
  - `8787`
  - `5174`

This rules out a fully dark stack as the explanation for the browser state below.

### 2. Controller status showed a live city, not an empty one

Command:

```bash
cd /Users/james/Code/OnionDAO/rs6-nullcity-server && npm run controller:status -- --json
```

Observed at `2026-06-04T19:48:55.743Z`:

- `HEALTH: ok — probe ok (3843ms) [default/qwopus3.5-27b-v3@q4_k_s]`
- `residents=25 erroring=0`
- `ALIVE_ACTING` rows included:
  - `res:agent`
  - `res:qa-banker`
  - `res:qa-cook`
  - `res:qa-scout`
  - `res:qa-social`
  - `res:qa-survivor`
  - `res:qa-woodcutter`
- `STUCK` rows included:
  - `res:hans`
  - `res:qa-guardian`
  - `res:qa-trader`

That same-run status is incompatible with a truthful operator shell reading `GATEWAY offline`, `CONTROLLER quiet`, `ONLINE 0`, and `RUNTIME 0`.

## Browser Evidence

### 1. Attendee `/` recovered to live fallback truth after a short settle

Route:

```text
http://127.0.0.1:5174/
```

Method:

- fresh read-only browser load
- waited 5 seconds after `load`

Observed:

- top message: `City overview unavailable; showing live resident fallback.`
- `CITY ALIVE 10 / 23 active`
- `Open live city`
- resident-backed sections appeared instead of remaining at a permanent zero state

Interpretation:

- the attendee shell did not have full city-overview data, but it recovered enough live controller-backed truth to avoid a false-empty city claim

### 2. Operator `/debug` stayed false-red in the same packet

Route:

```text
http://127.0.0.1:5174/debug
```

Method:

- fresh read-only browser load
- waited 15 seconds after `load`

Observed:

- `Loading dashboard state`
- `GATEWAY offline`
- `CONTROLLER quiet`
- `ONLINE 0`
- `RUNTIME 0`
- `No readiness checks reported`
- `No residents match the current filters`
- `No recent events`
- `No recent patron letters`

This state did not self-correct during the 15-second wait window.

### 3. Public `/library` no longer looks fully empty, but its live-state split remains visible

Route:

```text
http://127.0.0.1:5174/library
```

Method:

- fresh read-only browser load
- waited 5 seconds after `load`

Observed:

- top message still says `City overview unavailable; showing live resident fallback.`
- `LIVES` section still says `No projected soul lives`
- `SOUL FILES` section does populate with resident soul cards such as `The Steward`, `Duke Horacio`, `Father Aereck`, and `Hans`

Interpretation:

- the library route is not fully empty anymore, but it still shows a split between unavailable projected-life data and available soul-file data
- that remains separate from this packet's primary `/debug` target

## Expected Versus Observed

- Expected: once the shared runtime is up and the attendee shell has already recovered to live fallback truth, `/debug` should also present live or explicitly degraded truth rather than a false empty-city state
- Observed: `/` recovered to `10 / 23 active`, while `/debug` remained stuck on `offline / quiet / 0 / 0` after 15 seconds

## Assessment

Status: `Reproduced`

The split remains live on the current shared runtime. This packet increases confidence that the `/debug` issue is persistent on the current branch/runtime combination, not just a brief first-paint glitch.

## Issue Handling

- Canonical issue target remains previously proposed `QA-20260603-091`
- I did not edit `/Users/james/Code/OnionDAO/rs6-nullcity-server/docs/issue-register.md`
- Reason 1: the file is already dirty in another shared thread
- Reason 2: this sandbox cannot write to the server repo
- This packet is therefore dashboard-side evidence only

## QA Result

- Result: persistent truth split reproduced
- Runtime mutations: none
- Resident mutations: none
- Restarts requested/performed: none
- Code fix attempted: none

## Recommended Next Narrow Target

Keep the next cycle on `/debug` only:

1. compare the operator route's data path with the attendee fallback path in the same browser session
2. isolate whether `/debug` is failing hydration, failing its overview request, or pinning stale client state after recovery
3. avoid broadening into wall, inbox, or Storyteller until the operator overview truth path is isolated
