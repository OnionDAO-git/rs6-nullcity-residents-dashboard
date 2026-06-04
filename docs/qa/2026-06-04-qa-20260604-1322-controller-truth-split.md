# QA Packet `qa-20260604-1322-controller-truth-split`

- Date: 2026-06-04
- Time window: 13:18-13:22 CDT
- Classification: READ-ONLY
- Scope: controller truth vs dashboard truth on the shared local stack
- Dashboard commit: `4542463` (`codex/storyteller-overview-bff`)
- Server commit observed via docs/branch state: `53b7761d` (`agents/wip`, dirty)

## Why this packet

Orientation found a live truth split across three read paths:

1. `npm run controller:status --silent` reported all 25 residents offline.
2. `http://127.0.0.1:5174/` and `http://127.0.0.1:5174/debug` hydrated to a live 10-resident controller cohort.
3. Direct controller HTTP reads on `43596` timed out while dashboard and City API reads still answered.

This packet stops at evidence capture. No restart, mutation, or fix attempt was safe under the runtime rules.

## Commands and routes

### Repo/runtime orientation

- Command: `git status -sb` in both repos
- Command: `git branch -vv` in both repos
- Command: `screen -ls`
- Command: `command -v qmd`
- Command: `npm run controller:status --silent`

### HTTP probes

- Command: `curl -i --max-time 5 http://127.0.0.1:5174/`
- Command: `curl -i --max-time 5 http://127.0.0.1:8787/api/health`
- Command: `curl -i --max-time 5 http://127.0.0.1:43596/v1/health`
- Command: `curl -i --max-time 5 http://127.0.0.1:43596/v1/wall/snapshot`
- Command: `curl -i --max-time 5 'http://127.0.0.1:43596/v1/inbox?human=demo@onion'`
- Command: `curl -i --max-time 5 -H 'Authorization: Bearer operator-token' http://127.0.0.1:43611/api/nullcity/economy/heartbeat`
- Command: `curl -i --max-time 15 http://127.0.0.1:8787/api/overview`

### Browser routes

- Route: `http://127.0.0.1:5174/`
- Route: `http://127.0.0.1:5174/debug`
- Route: `http://127.0.0.1:5174/debug/residents`

## Expected

- Controller CLI, controller HTTP, dashboard BFF, and dashboard UI should agree on whether the shared controller is up and which residents are active.
- If controller HTTP is unhealthy, the dashboard should not claim `CONTROLLER available` with 10 active residents.

## Observed

### Orientation state

- Server repo branch: `agents/wip`, behind upstream by 35, dirty in shared docs plus many prior untracked QA docs.
- Dashboard repo branch: `codex/storyteller-overview-bff`, clean except untracked `docs/qa/`.
- `screen -ls` returned `No Sockets found...`; expected shared screen names were not visible from this sandbox.
- `qmd` was not available.

### Controller-side read paths

- `npm run controller:status --silent` reported:
  - `HEALTH: UNKNOWN — no inference-health probe has run yet`
  - `residents=25 erroring=0`
  - all 25 listed residents `OFFLINE`
- `curl -i --max-time 5 http://127.0.0.1:43596/v1/health` timed out with `curl: (28) Operation timed out after 5001 milliseconds with 0 bytes received`.
- `curl -i --max-time 5 http://127.0.0.1:43596/v1/wall/snapshot` timed out the same way.
- `curl -i --max-time 5 'http://127.0.0.1:43596/v1/inbox?human=demo@onion'` timed out the same way.

### Dashboard/BFF/City read paths

- `curl -i --max-time 5 http://127.0.0.1:5174/` returned `HTTP/1.1 200 OK` with the Vite HTML shell.
- `curl -i --max-time 5 http://127.0.0.1:8787/api/health` returned `HTTP/1.1 200 OK` with `{\"ok\":true,...}`.
- `curl -i --max-time 15 http://127.0.0.1:8787/api/overview` returned `HTTP/1.1 200 OK` and reported:
  - `gateway.connected: true`
  - `controller.available: true`
  - `controller.residentsWithRuntime: 27`
  - `readiness resident cohort: 10 active in controller cohort; 13 paused/cohort-excluded of 23 known residents`
  - live resident examples in payload: `res:agent online`, `res:hans online`
- `curl -i --max-time 5 -H 'Authorization: Bearer operator-token' http://127.0.0.1:43611/api/nullcity/economy/heartbeat` returned `HTTP/1.1 200 OK` with:
  - `activeResidentCount: 10`
  - `residentCount: 31`
  - `lastEconomyEventTs: 2026-06-03T06:44:37.221Z`

### Browser-visible truth

- Attendee `/` initially painted `Loading city state` and `0 / 0 online`, then after about 10 seconds hydrated to `10 / 23 active`.
- Debug `/debug` showed:
  - `GATEWAY connected`
  - `CONTROLLER available`
  - `ONLINE 10`
  - `RUNTIME 27`
- Debug `/debug/residents` listed 10 online residents in the controller cohort. Visible rows included:
  - `The Steward`
  - `hans`
  - `qa-banker`
  - `qa-social`
  - `qa-trader`
  - `qa-guardian`
  - `qa-scout`
  - `qa-survivor`
  - `qa-cook`
  - `qa-woodcutter`

## Assessment

- Status: Regressed
- Confidence: High
- Evidence type: live

The stack is not telling one coherent truth. Direct controller reads and controller CLI both say the cohort is offline or unreachable, while the BFF/UI and City API claim an attached 10-resident live cohort. This is demo-risky because a human can see a healthy dashboard while the controller read API path is timing out.

## Recommended next step

Keep the next packet read-only and stay on this mismatch:

- compare how `/api/overview` infers `controller.available` and online residents
- identify whether it is reading gateway cache/runtime-state files while `43596` is degraded
- only after that, decide whether the bug belongs in dashboard truth labeling, BFF fallback rules, or controller health exposure
