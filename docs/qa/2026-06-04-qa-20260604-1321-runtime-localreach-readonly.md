# QA Packet `qa-20260604-1321-runtime-localreach-readonly`

- Date: 2026-06-04 13:21 CDT
- Classification: READ-ONLY
- Dashboard SHA: `4542463`
- Server SHA observed: `53b7761d`
- Automation scope: one narrow runtime-availability verification cycle

## Target

Verify whether the shared Null City dashboard/controller stack is actually down, or whether this QA automation context is isolated from localhost while the stewarded runtime continues to run.

## Orientation Summary

### Git state

- Server repo branch: `agents/wip` tracking `origin/agents/wip`, behind upstream by `57`, dirty in `docs/agent-status.md`, `docs/issue-register.md`, plus many untracked `docs/qa/*` and one untracked `data/controller/storyteller/latest-frame.json`.
- Dashboard repo branch: `codex/storyteller-overview-bff` tracking `origin/codex/storyteller-overview-bff`, ahead/behind `0/0`, with untracked `docs/qa/`.

### Shared runtime ownership and process surface

- Runtime stewardship names Codex in James's active desktop thread as restart owner.
- Expected screens are present: `nullcity-infra`, `nullcity-game`, `nullcity-controller`, `nullcity-dashboard-server`, `nullcity-dashboard-web`.
- Additional screen present: `nullcity-storyteller`.
- Listening ports observed from `lsof`: `43591`, `43592`, `43594`, `43595`, `43596`, `43610`, `43611`, `8787`, `5174`.

### Current active cohort from read-only disk/log evidence

- Controller boot log reports `residents=10 soulDiscovery=disabled`.
- The 10 freshest runtime-state files at `2026-06-04 13:22:27-28 CDT` are:
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
- Controller log tail during this packet also shows fresh live action evidence for `res:qa-woodcutter`, `res:qa-guardian`, `res:qa-survivor`, and `res:qa-cook`.

### Tooling

- `qmd` is not available in this environment.
- Controller boot log also reports: `qmd unavailable; memory retrieval is limited to markdown files.`

## Evidence

### Runtime appears up from screens, listeners, and logs

Commands used:

```bash
screen -ls
lsof -nP -iTCP -sTCP:LISTEN | rg ':(43591|43592|43594|43595|43596|43610|43611|5174|8787)\b'
tail -n 80 /tmp/nullcity-runtime/controller-supervised.log
tail -n 80 /tmp/nullcity-runtime/dashboard-server.log
tail -n 80 /tmp/nullcity-runtime/dashboard-web.log
find /Users/james/Code/OnionDAO/rs6-nullcity-server/data/controller/memory -path '*/runtime-state.json' -maxdepth 2 -type f -exec stat -f '%m %Sm %N' -t '%Y-%m-%d %H:%M:%S' {} + | sort -nr | head -n 20
```

Observed result:

- Dashboard server log: `NullCity dashboard server listening on http://127.0.0.1:8787`
- Dashboard web log: Vite ready at `http://127.0.0.1:5174/`
- Controller log: letters on `43596`, MCP on `43610`, City API on `43611`
- Runtime-state files for the active 10-resident cohort are updating this minute

### Localhost reachability is blocked from this automation context

Commands used:

```bash
curl -fsS http://127.0.0.1:8787/api/health
curl -fsS http://127.0.0.1:43596/v1/health
curl -fsS http://127.0.0.1:43611/api/nullcity/health
for port in 8787 5174 43596 43611; do (exec 3<>/dev/tcp/127.0.0.1/$port) >/dev/null 2>&1 && echo open || echo closed; done
```

Node cross-check:

```js
for (const port of [8787, 5174, 43596, 43611]) {
  await fetch(`http://127.0.0.1:${port}/`)
}
```

Observed result:

- All `curl` probes failed with connection errors.
- All `/dev/tcp` probes reported `closed`.
- Node `fetch` failed on the same four ports with `TypeError: fetch failed`.

## Interpretation

- This packet did **not** prove that attendee/operator surfaces are down.
- It **did** prove that this automation context cannot reach the stewarded localhost HTTP services even while screen sessions, listener sockets, logs, and fresh runtime-state writes indicate the stack is running.
- Because both shell and Node localhost probes fail the same way, the blocker is at the verifier boundary for this automation run, not just a single `curl` failure.

## Current service-response status for this packet

- Dashboard BFF responds: **Not verifiable from this automation context**
- Dashboard web responds: **Not verifiable from this automation context**
- Controller health responds: **Not verifiable from this automation context**
- Wall responds: **Not verifiable from this automation context**
- Inbox responds: **Not verifiable from this automation context**
- City API responds: **Not verifiable from this automation context**

## Outcome

- Safe target executed: yes
- Mutation performed: no
- Fixes made: none
- Issue-register update: not attempted from this repo/worktree

## Recommended next narrow QA target

Use a verifier surface that can actually reach local HTTP routes, ideally the in-app browser or the runtime steward's shell, to confirm whether `/`, `/debug`, `/v1/wall/snapshot`, `/v1/inbox`, and `/api/nullcity/health` still match the running 10-resident cohort.
