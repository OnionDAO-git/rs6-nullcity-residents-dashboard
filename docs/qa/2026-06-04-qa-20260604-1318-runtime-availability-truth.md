# QA Packet `qa-20260604-1318-runtime-availability-truth`

- Time: 2026-06-04 13:18 CDT
- Classification: READ-ONLY
- Scope: Shared Null City runtime availability and human-facing route reachability truth
- Repo: `rs6-nullcity-residents-dashboard`

## Why This Packet

Orientation showed the shared stack appears down rather than merely hidden by sandbox networking. This packet records that state without restarting or mutating anything.

## Commands And Probes

- `git status -sb` in dashboard repo
- `git -C /Users/james/Code/OnionDAO/rs6-nullcity-server status -sb`
- `git branch -vv` in both repos
- `tail -n 150 /Users/james/Code/OnionDAO/rs6-nullcity-server/docs/agent-status.md`
- `screen -ls`
- `lsof -iTCP -sTCP:LISTEN -nP | rg ':(43591|43592|43594|43595|43596|43610|43611|5174|8787)\\b'`
- `command -v qmd`
- `cd /Users/james/Code/OnionDAO/rs6-nullcity-server && npm run controller:status --silent`
- Node localhost fetch probes to:
  - `http://127.0.0.1:8787/api/health`
  - `http://127.0.0.1:8787/api/overview`
  - `http://127.0.0.1:43596/v1/health`
  - `http://127.0.0.1:43596/v1/wall/snapshot`
  - `http://127.0.0.1:43596/v1/inbox?human=demo@onion`
  - `http://127.0.0.1:43611/api/nullcity/economy/heartbeat`

## Observed Truth

### Git / Coordination

- Dashboard repo branch: `codex/storyteller-overview-bff`
- Dashboard upstream: `origin/codex/storyteller-overview-bff`
- Dashboard worktree state: untracked `docs/qa/`
- Server repo branch: `agents/wip`
- Server upstream: `origin/agents/wip`
- Server worktree state: behind upstream by `35`; dirty `docs/agent-status.md`, dirty `docs/issue-register.md`, plus many untracked QA/evidence artifacts
- Collision note: shared server docs are already dirty, so this cycle avoids editing them

### Runtime

- `screen -ls`: `No Sockets found`
- Expected shared screens absent:
  - `nullcity-infra`
  - `nullcity-game`
  - `nullcity-controller`
  - `nullcity-dashboard-server`
  - `nullcity-dashboard-web`
- Expected listening ports absent:
  - `43591`
  - `43592`
  - `43594`
  - `43595`
  - `43596`
  - `43610`
  - `43611`
  - `5174`
  - `8787`

### Resident Status

- `npm run controller:status --silent` returned `HEALTH: UNKNOWN — no inference-health probe has run yet`
- Resident summary: `residents=25 erroring=0`
- All 25 residents reported `OFFLINE`
- Current active residents observed this cycle: none

### Tooling

- `qmd` availability: not installed / not found

### Human-Facing/API Reachability

- Dashboard BFF probe: no response
- Dashboard web probe: no response
- Controller letters/wall/inbox API probe: no response
- City API probe: no response
- Node fetch to all localhost targets failed with `TypeError: fetch failed`

## Interpretation

This is a real shared-runtime availability outage, not a narrow dashboard rendering bug:

1. No named `screen` sessions exist.
2. No expected Null City ports are listening.
3. Controller status can only read persisted resident state, and every resident is offline.
4. Both shell-level and Node-level localhost reachability probes fail.

## QA Result

- Result: regression confirmed
- Safe target completed: runtime availability truth only
- Mutations performed: none
- Runtime restart requested/performed: none
- Code fix attempted: none

## Recommended Next Narrow Target

`qa-20260604-<time>-runtime-recovery-truth` after the runtime steward or James restores the shared stack. Verify screens, ports, controller status, dashboard `/`, dashboard `/debug`, wall, inbox, and City API before testing any higher-level behavior.
