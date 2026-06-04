# QA Packet `qa-20260604-1421-debug-truth-persistence`

- Time: 2026-06-04 14:21-14:24 CDT
- Classification: READ-ONLY with docs-only evidence capture
- Scope: persistent operator `/debug` false-red state after attendee `/` has already recovered to live fallback truth
- Dashboard repo SHA: `7963442`
- Server repo SHA: `53b7761d`
- Runtime authority: shared/stewarded, no restart authority

## Why This Packet

Earlier same-day dashboard packets already established two facts:

1. the attendee `/` shell can sometimes recover to a truthful live fallback
2. the operator `/debug` shell can stay stuck on `offline / quiet / 0 / 0`

This cycle stayed narrow on one question only: does that split still persist on the current shared runtime, or was it transient?

## Orientation Summary

- Dashboard repo branch: `codex/storyteller-overview-bff` tracking `origin/codex/storyteller-overview-bff`
- Dashboard repo dirty state before packet: untracked `docs/qa/`
- Server repo branch: `agents/wip` tracking `origin/agents/wip`, behind upstream, dirty in `docs/agent-status.md`, `docs/issue-register.md`, and existing QA artifacts
- Shared runtime screens present: `nullcity-infra`, `nullcity-game`, `nullcity-controller`, `nullcity-dashboard-server`, `nullcity-dashboard-web`, `nullcity-storyteller`
- Listening ports present: `43591`, `43592`, `43594`, `43595`, `43596`, `43610`, `43611`, `8787`, `5174`
- `qmd` unavailable in `PATH`
- Shell `curl` to loopback failed from this sandbox even while listeners were present, so browser-visible HTTP truth was verified through the in-app browser and correlated against local process evidence

## Commands And Probes

- `git status -sb` in both repos
- `screen -ls`
- `lsof -nP -iTCP -sTCP:LISTEN | rg ':(43591|43592|43594|43595|43596|43610|43611|5174|8787)\\b'`
- `cd /Users/james/Code/OnionDAO/rs6-nullcity-server && npm run controller:status`
- In-app browser, read-only loads of:
  - `http://127.0.0.1:5174/`
  - `http://127.0.0.1:5174/debug`

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
cd /Users/james/Code/OnionDAO/rs6-nullcity-server && npm run controller:status
```

Observed at `2026-06-04T19:18:46.564Z`:

- `HEALTH: ok — probe ok (3080ms) [default/qwopus3.5-27b-v3@q4_k_s]`
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
- waited 5 seconds after `domcontentloaded`

Observed:

- top message: `City overview unavailable; showing live resident fallback.`
- `CITY ALIVE 10 / 23 active`
- `READ GROUNDED STORY` populated with `Two residents unstick; one eyes the embassy, one waits for Bob`
- resident triage populated instead of staying empty

Interpretation:

- the attendee shell did not have full city-overview data, but it recovered enough live controller-backed truth to avoid a false-empty city claim

### 2. Operator `/debug` stayed false-red in the same packet

Route:

```text
http://127.0.0.1:5174/debug
```

Method:

- fresh read-only browser load
- waited 5 seconds after `domcontentloaded`

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

This state did not self-correct during the wait window.

## Expected Versus Observed

- Expected: once the shared runtime is up and the attendee shell has already recovered to a truthful fallback, `/debug` should also present live or explicitly degraded truth rather than a false empty-city state
- Observed: `/` recovered to `10 / 23 active`, while `/debug` remained stuck on `offline / quiet / 0 / 0`

## Assessment

Status: `Reproduced`

The split remains live on the current shared runtime. This is no longer just a first-paint glitch and not just a transient outage artifact. The operator-facing `/debug` surface is still less truthful than the attendee shell after recovery.

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
