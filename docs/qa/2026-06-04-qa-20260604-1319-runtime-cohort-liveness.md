# QA Packet `qa-20260604-1319-runtime-cohort-liveness`

- Time: 2026-06-04 13:19 CDT
- Classification: READ-ONLY
- Scope: Shared runtime recovery truth via controller-visible active cohort state
- Repo: `rs6-nullcity-residents-dashboard`
- Dashboard SHA: `4542463`

## Why This Packet

The immediately prior packet in this repo, `qa-20260604-1318-runtime-availability-truth`, recorded the shared stack as unavailable from this sandbox. This follow-up rechecks the smallest safe slice available now: whether controller-visible truth shows the runtime recovered and whether the active cohort is stable enough to trust.

## Commands And Probes

- `date '+%Y%m%d-%H%M %Z'`
- `git -C /Users/james/Code/OnionDAO/rs6-nullcity-server status -sb`
- `git -C /Users/james/Code/OnionDAO/rs6-nullcity-residents-dashboard status -sb`
- `tail -n 150 /Users/james/Code/OnionDAO/rs6-nullcity-server/docs/agent-status.md`
- `ls -la /tmp/nullcity-runtime`
- `stat -f '%Sm %N' -t '%Y-%m-%d %H:%M:%S %Z' /tmp/nullcity-runtime/{controller-supervised.log,game-supervised.log,infra.log,dashboard-server.log,dashboard-web.log,storyteller-scheduler.log}`
- `cd /Users/james/Code/OnionDAO/rs6-nullcity-server && npm run controller:status --silent`
- `cd /Users/james/Code/OnionDAO/rs6-nullcity-server && npm run controller:status --silent` again after `sleep 5`

## Observed Truth

### Runtime Recovery Signals

- Fresh runtime artifacts exist for all expected shared services:
  - `/tmp/nullcity-runtime/controller-supervised.log` mtime `2026-06-04 13:20:17 CDT`
  - `/tmp/nullcity-runtime/game-supervised.log` mtime `2026-06-04 13:20:17 CDT`
  - `/tmp/nullcity-runtime/infra.log` mtime `2026-06-04 13:18:35 CDT`
  - `/tmp/nullcity-runtime/dashboard-server.log` mtime `2026-06-04 13:18:40 CDT`
  - `/tmp/nullcity-runtime/dashboard-web.log` mtime `2026-06-04 13:18:40 CDT`
  - `/tmp/nullcity-runtime/storyteller-scheduler.log` mtime `2026-06-04 13:20:05 CDT`
- Compared with the earlier `13:18 CDT` outage packet, the strongest available evidence now points to a recovered shared stack rather than a still-dead one.

### Controller Truth

- First probe: `HEALTH: ok — probe ok (3182ms) [default/qwopus3.5-27b-v3@q4_k_s]`
- Second probe five seconds later: `HEALTH: ok — probe ok (3952ms) [default/qwopus3.5-27b-v3@q4_k_s]`
- Both probes reported `residents=25 erroring=0`
- Both probes still imply the expected 10-resident live cohort:
  - Stable `ALIVE_ACTING`: `res:qa-scout`, `res:qa-woodcutter`
  - Recovered between probes from `STUCK` to `ALIVE_ACTING`: `res:agent`, `res:qa-banker`, `res:qa-trader`
  - Stayed `STUCK` in both probes: `res:hans`, `res:qa-cook`, `res:qa-guardian`, `res:qa-social`, `res:qa-survivor`
- Offline residents remained the same in both probes: `res:duke-horacio`, `res:father-aereck`, `res:mother-anvil`, `res:pip`, `res:qa-angler`, `res:qa-forager`, `res:qa-guide`, `res:qa-priest`, `res:restart-test`, `res:severn-vesta`, `res:the-hush`, `res:thrand`, `res:wf-verify-born`, `res:wise-old-man`, `res:wren-calix`

### Sandbox Limits

- `screen -ls`, `ps`, `lsof`, and raw localhost `curl` remain unusable or misleading in this sandbox, so screen presence and HTTP route reachability could not be directly re-verified here.
- Because of that limit, this packet only upgrades truth about controller-visible liveness and runtime artifact freshness. It does not close any dashboard, wall, inbox, or City API read-path concerns by itself.

## Interpretation

The shared runtime appears recovered relative to the `13:18 CDT` outage packet, but the live cohort is not healthy enough to call stable:

1. Controller health is green twice in a row and the runtime log mtimes are current.
2. The controller still only shows five residents clearly acting in the second sample.
3. Half of the intended 10-resident live cohort remained stuck across both samples.
4. `res:hans` is still stuck with `no active goal`, which aligns with the prior proposed runtime-liveness concern rather than disproving it.

## QA Result

- Result: partial recovery confirmed
- Safe target completed: controller-visible runtime liveness and cohort volatility
- Mutations performed: none
- Runtime restart requested/performed: none
- Code fix attempted: none

## Recommended Next Narrow Target

`qa-20260604-<time>-dashboard-route-readtruth` if in-app browser verification is available again, with priority on one human-visible surface only:

- `/debug` hydration truth if the goal is to follow up proposed `QA-20260603-091`
- or `/wall` stale death-broadcast truth if the goal is to follow up proposed `QA-20260603-089`

If browser verification is not available, the next safest read-only target is a 30-60 second `controller:smoke` plus another controller-status recheck focused only on the five persistently stuck cohort residents.
