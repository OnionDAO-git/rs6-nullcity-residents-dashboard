# QA Packet `qa-20260603-1524-dashboard-runtime-truth`

- Time: 2026-06-03 15:24 CDT
- Marshal mode: READ-ONLY
- Dashboard repo SHA: `9eb100e`
- Server repo SHA: `53b7761d`
- Runtime class: shared/stewarded, no restart authority

## Scope

Verify whether the human-facing dashboard surfaces truthfully reflect the live Null City runtime.

## Orientation Summary

- Dashboard repo worktree: clean on `codex/storyteller-overview-bff`.
- Server repo worktree: dirty on `agents/wip`; `docs/agent-status.md` and `docs/issue-register.md` already modified by another thread, so this packet avoids that tree.
- Expected shared screens present: `nullcity-infra`, `nullcity-game`, `nullcity-controller`, `nullcity-dashboard-server`, `nullcity-dashboard-web`.
- Expected shared ports listening: `43591`, `43592`, `43594`, `43595`, `43596`, `43610`, `43611`, `8787`, `5174`.
- `qmd` unavailable in PATH.

## Active Resident Cohort

Per the current runtime stewardship note, the intended live cohort is:

- `res:agent`
- `res:hans`
- `res:qa-woodcutter`
- `res:qa-cook`
- `res:qa-survivor`
- `res:qa-guardian`
- `res:qa-trader`
- `res:qa-banker`
- `res:qa-social`
- `res:qa-scout`

## Read-Only Checks

### 1. BFF health responds

- Route: `http://127.0.0.1:8787/api/health`
- Result: `{"ok":true,"service":"nullcity-residents-dashboard","store":"memory",...}`
- Classification: live, read-only

### 2. Public attendee dashboard renders an empty city

- Route: `http://127.0.0.1:5174/`
- Observed visible text:
  - `Loading city state`
  - `0 / 0 online`
  - `No resident roster loaded yet.`
  - `No Storyteller run is loaded yet`
  - `gateway quiet`
  - `0 residents online`
- Classification: live, read-only, human-visible

### 3. Operations dashboard also renders empty runtime state

- Route: `http://127.0.0.1:5174/debug`
- Observed visible text:
  - `Gateway offline`
  - `Controller quiet`
  - `Online 0`
  - `Runtime 0`
  - `No residents match the current filters`
- Classification: live, read-only, human-visible

### 4. Other dashboard-backed public surfaces still answer

- Route: `http://127.0.0.1:5174/debug/wall`
- Observed visible text:
  - page renders
  - shows `Loading…` placeholders rather than connection failure

- Route: `http://127.0.0.1:5174/debug/inbox?human=demo@onion`
- Observed visible text:
  - historic `CIVIC MILESTONE` and `STANDING TIER CROSSED` letters for `demo@onion`

### 5. Shared runtime is alive underneath the empty dashboard

- Evidence source: `/tmp/nullcity-runtime/controller-supervised.log`
- Observed startup line:
  - `residents=10 soulDiscovery=disabled`
  - letters server listening at `43596`
  - city integration listening at `43611`
- Observed current live behavior in the same log:
  - recent `knowledge_suggestion` events for `res:qa-woodcutter`, `res:qa-survivor`, `res:qa-cook`, `res:qa-guardian`, `res:agent`
  - timestamps continue through the current run window, showing active decision/action flow rather than a dead controller

## Supporting Log Evidence

### Dashboard web log

File: `/tmp/nullcity-runtime/dashboard-web.log`

The log shows repeated historical proxy failures such as:

- `http proxy error: /api/overview`
- `http proxy error: /api/residents?filter=all`
- `http proxy error: /api/nullcity/economy/live?...`
- `Error: connect ECONNREFUSED 127.0.0.1:8787`

Those lines are useful context, but they do not fully explain the current state because:

- the BFF is listening now,
- `/api/health` responds now,
- and the current human-visible surfaces still show an empty city.

## Finding

The dashboard currently presents a false-empty city:

- human-visible surfaces report `0` residents / offline / quiet,
- while the shared runtime has all expected screens and ports up,
- and controller logs show active resident behavior in the current session.

This is demo-breaking because the attendee and operator surfaces imply the city is dead when it is not.

## Safe Handoff

- Recommended canonical issue lane: dashboard/BFF read-model truth
- Recommended next check:
  - verify current `GET /api/overview`, `GET /api/residents`, and gateway-status read paths from the dashboard server process itself
  - compare the BFF overview payload against live controller/gateway state
  - determine whether the bug is in BFF aggregation, gateway-status ingestion, or frontend fallback handling

## Constraints / Why No Canonical Issue Update This Cycle

The server repo's canonical QA ledger files are already dirty in another thread:

- `docs/agent-status.md`
- `docs/issue-register.md`

To avoid stomping that work, this packet records evidence here and stops at handoff rather than editing the shared server ledger.
