# rs6-dashboard - Resident Operations Specification

> A local Null City operations dashboard for spawning, controlling, and observing residents in `rs6-nullcity-server`, with a spectator client forked from `rs6-nullcity-client-ts` that can watch online residents or players without logging in as a player.

---

## 1. Source Material

This spec is derived from:

- `rs6-nullcity-server/feat/residents.md`
- `rs6-nullcity-server/feat/controller.md`
- `rs6-nullcity-server/src/server/agent/protocol/messages.ts`
- `rs6-nullcity-server/src/server/agent/gateway.ts`
- `rs6-nullcity-server/src/server/agent/config.ts`
- `rs6-nullcity-server/src/controller/resident-runtime.ts`
- `rs6-nullcity-server/src/controller/thinking/thinking-module.ts`
- `rs6-nullcity-server/src/controller/nervous-system/nervous-system.ts`
- `rs6-nullcity-server/src/controller/nervous-system/rules.ts`
- `rs6-nullcity-server/src/controller/nervous-system/rules-md.ts`
- `rs6-nullcity-server/src/controller/body/body.ts`
- `rs6-nullcity-server/src/controller/memory/runtime-state.ts`
- `rs6-nullcity-server/src/controller/llm/completion-parser.ts`
- `rs6-nullcity-server/src/engine/world/actor/resident/perception/perception-types.ts`
- `rs6-nullcity-server/src/engine/world/actor/resident/perception/perception-builder.ts`
- `rs6-nullcity-server/src/engine/world/actor/resident/action/agent-action.ts`
- `rs6-nullcity-client-ts/`
- `rs6-nullcity-residents-dashbaord/NullCity Design.md`

Use `NullCity Design.md` only for visual language, typography, palette, and interaction tone. Ignore its narrative/game-lore content when designing this operator tool.

---

## 2. Product Goals

1. **Spawn residents** from the dashboard: create `res:<name>` identities, choose a soul, choose spawn settings, and connect them into the world.
2. **Control residents** through the public `AgentAction` protocol rather than engine internals.
3. **Observe residents** live through tick perceptions, events, action results, autonomy runtime state, memory, logs, and a visual spectator.
4. **Observe online players** without using player credentials, through a read-only spectator path that mirrors a selected player.
5. **Operate the controller**: see each resident's Thinking, Nervous System, and Body state, including Spark mode, active plan, attention, hooks, reflex rules, budget, inference state, action IO, and recovery status.
6. **Preserve the Null City look** while remaining an efficient operations surface.

Out of scope for v1:

- Editing the game engine directly from the dashboard.
- Free-form code execution against residents.
- Multi-user dashboard roles beyond a local operator/admin boundary.
- Public internet hosting.
- Replacing the autonomy runtime; the dashboard observes it and commands residents through gateway actions.

---

## 3. Architecture

```
rs6-dashboard
|-- packages/web                  # Vite app, Null City UI
|-- packages/server               # local BFF: filesystem + gateway proxy + logs
|-- packages/observer             # fork/adaptation of rs6-nullcity-client-ts
`-- SPEC.md

rs6-nullcity-server
|-- AgentGateway                  # WS + SSE + MCP resident gateway, default port 43595
|-- ResidentRegistry              # data/residents/<name>.json
|-- ResidentSession               # live perceptions/action results/events
`-- activeWorld                   # players, residents, npcs, objects

nullcity-controller
|-- ControllerHost                # desired residents + gateway connection
|-- ResidentRuntime[]             # composes Thinking + Nervous System + Body
|   |-- ThinkingModule            # Spark, plans, hooks, LLM, budget, attention
|   |-- NervousSystem             # deterministic reflex rules before thinking
|   `-- ResidentBody              # gateway submit/observe + action log
`-- data/memory + data/logs
```

The dashboard has its own local server because the browser cannot safely read `data/souls`, `data/memory`, `data/logs`, or local controller config files. The dashboard server is a thin backend-for-frontend:

- Hosts the web app and observer bundle.
- Connects to `AgentGateway` over WS.
- Exposes typed HTTP/WS APIs to the web app.
- Reads local soul, memory, runtime-state, action-log, and inference-log files.
- Never imports game engine internals.

Controller observability must follow the refactor boundary:

- **Thinking** is the slow strategic layer. It wraps Spark, evaluates thinking hooks, performs LLM calls, installs plans, spends attention, mutates memory, and writes inference logs.
- **Nervous System** is the fast reflex layer. It runs before Thinking on every perception, evaluates deterministic rules from soul frontmatter and `nervous-rules.md`, and can submit an immediate action without LLM inference.
- **Body** is the IO boundary. It records the latest perception and recent events, submits `AgentAction` through the gateway, and appends action-log entries tagged with the source module.

The web app never talks directly to arbitrary filesystem paths. All file reads go through dashboard-server routes that enforce configured roots.

---

## 4. Gateway Contract

The live server gateway uses the protocol in `rs6-nullcity-server/src/server/agent/protocol/messages.ts`.

### 4.1 Frame

```jsonc
{
  "v": 1,
  "id": "request-id",
  "kind": "list_residents",
  "payload": {}
}
```

The dashboard protocol client must centralize framing in one module, because older controller helper code uses a different `type/request_id` envelope. The dashboard must target the server gateway's `v/kind/payload/id` frame unless the server protocol is changed.

### 4.2 Client to server

- `auth { token? }`
- `controller_hello { controllerId, version, capabilities? }`
- `list_residents { filter?: "online" | "offline" | "all" }`
- `list_observable_subjects { includeResidents?, includePlayers? }`
- `observe_subject { subject, mode? }`
- `unobserve_subject { sessionId }`
- `create_resident { name, spawnPosition?, initialInventory?, initialEquipment? }`
- `connect_resident { name, observe?, control?, onDisconnect?: "logout" | "idle" }`
- `attach { name, observe?, control? }`
- `submit_action { name, action }`
- `detach { name }`
- `disconnect_resident { name, cause? }`
- `delete_resident { name }`

### 4.3 Server to client

- `resident_list { residents }`
- `observable_subject_list { subjects }`
- `resident_created { resident }`
- `resident_connected { resident, perception }`
- `resident_disconnected { name, cause? }`
- `spectator_connected { sessionId, subject, initialState }`
- `spectator_rebuild { sessionId, payload }`
- `spectator_packet { sessionId, opcode, payload }`
- `spectator_perception { sessionId, perception }`
- `spectator_disconnected { sessionId, cause? }`
- `perception { resident_id, perception }`
- `action_result { resident_id, request_id?, result, cause? }`
- `event { resident_id, event }`
- `ok { ok: true }`
- `error { request_id?, code, message, cause? }`

### 4.4 SSE

`GET /agent/sse/:resident_id` is read-only and emits:

- `event: perception`
- `event: event`

Use SSE for existing resident-only passive panels. Use WS for lifecycle commands, control, and all observable-subject spectator sessions. There is no HTTP/SSE spectator endpoint for players in the current server code.

---

## 5. Dashboard Server API

The dashboard server wraps the gateway and local files into stable UI endpoints.

### 5.1 Gateway endpoints

- `GET /api/gateway/status`
- `GET /api/residents?filter=all|online|offline`
- `POST /api/residents`
- `POST /api/residents/:name/connect`
- `POST /api/residents/:name/attach`
- `POST /api/residents/:name/detach`
- `POST /api/residents/:name/disconnect`
- `DELETE /api/residents/:name`
- `POST /api/residents/:name/actions`
- `GET /api/residents/:name/stream` for browser WS/SSE fanout

### 5.2 Autonomy/runtime endpoints

- `GET /api/controller/status`
- `GET /api/controller/config`
- `GET /api/runtime/:resident`
- `GET /api/runtime/:resident/thinking`
- `GET /api/runtime/:resident/nervous-system`
- `GET /api/runtime/:resident/body`
- `GET /api/runtime/:resident/history`
- `GET /api/runtime/:resident/inference`
- `GET /api/runtime/:resident/memory/index`
- `GET /api/runtime/:resident/memory/files`
- `GET /api/runtime/:resident/memory/file?path=...`
- `GET /api/benchmarks?limit=...`
- `GET /api/benchmarks/leaderboard?limit=...`
- `GET /api/benchmarks/:runId`

Runtime data comes from controller-owned files when available:

- `data/memory/<resident>/runtime-state.json`
- `data/memory/<resident>/INDEX.md`
- `data/memory/<resident>/hooks.md`
- `data/memory/<resident>/nervous-rules.md`
- `data/logs/<resident>/actions/<date>.jsonl`
- `data/logs/<resident>/inference/<date>.jsonl`

If the ControllerHost is not running or files are missing, the dashboard still shows server resident state and marks autonomy sections as unavailable.

The module endpoints are read models assembled by the dashboard server:

- `thinking`: Spark mode, active/previous intent, thinking hooks, plan state when logged, inference requests, budgets, attention, variables, legacy, and `hooks.md`.
- `nervous-system`: soul `nervousSystem` rules, memory-learned `nervous-rules.md`, retired rule ids, cooldowns from `runtime-state.json`, last reaction from action logs, and whether it suppressed or interrupted thinking.
- `body`: control holder, latest perception age, recent events, last submitted action/result, action source, and gateway/action-log health.
- `benchmarks`: artifact list/detail read models from `data/benchmarks` or `NULLCITY_BENCHMARK_ROOT`; malformed artifacts are skipped.
- `benchmarks/leaderboard`: module comparison by pass rate, progress, efficiency, safety, reliability, and inference-count cost signals.

### 5.3 Observer endpoints

- `GET /api/observe/subjects`
- `POST /api/observe/session`
- `DELETE /api/observe/session/:id`
- `GET /api/observe/session/:id/stream`

Subjects include:

```ts
interface ObservableSubjectSummary {
  subject:
    | { kind: 'resident'; name: string }
    | { kind: 'player'; username: string };
  online: boolean;
  position?: { x: number; y: number; level: number };
}
```

Resident and player subjects are listed through `list_observable_subjects`. The dashboard server should still expose this as `/api/observe/subjects` so the web app does not depend on raw gateway framing.

`POST /api/observe/session` maps to gateway `observe_subject`; `DELETE /api/observe/session/:id` maps to `unobserve_subject`; `GET /api/observe/session/:id/stream` is the dashboard server's fanout for `spectator_connected`, `spectator_rebuild`, `spectator_packet`, `spectator_perception`, and `spectator_disconnected`.

---

## 6. Core Data

### 6.1 Resident summary

```ts
interface ResidentSummary {
  name: string;             // res:<lowercase_name>
  online: boolean;
  controllerId?: string;
  controlHeld?: boolean;
}
```

Dashboard enriches this with latest perception and runtime data:

```ts
interface ResidentDashboardRow {
  name: string;
  online: boolean;
  controllerId?: string;
  position?: { x: number; y: number; level: number };
  hp?: { current: number; max: number };
  inCombat?: boolean;
  busy?: boolean;
  attention?: number;
  legacy?: { kind: string; progress: Record<string, unknown>; complete?: boolean };
  budgets?: {
    requestsThisMinute?: number;
    requestsToday?: number;
    noInferenceUntil?: string;
  };
  variables?: Record<string, number>;
  thinking?: {
    mode?: 'idle' | 'executing' | 'deciding' | 'offline' | 'unknown';
    activePlan?: string;
    previousIntent?: unknown;
    inFlightRequest?: string;
    lastInferenceCause?: string;
  };
  nervous?: {
    activeRules?: number;
    lastReaction?: string;
    lastRuleId?: string;
    lastSuppressedThinking?: boolean;
    lastInterruptedThinking?: boolean;
  };
  body?: {
    controlHeld: boolean;
    controllerId?: string;
    perceptionAgeMs?: number;
    lastAction?: ResidentActionSummary;
    lastActionSource?: 'thinking' | 'nervous-system' | 'body' | 'manual';
  };
  lastEvent?: ResidentEventSummary;
  activeTrade?: unknown;
  errors?: string[];
}
```

### 6.2 Perception

The dashboard treats `Perception` as the live observable snapshot:

- tick
- resident id, position, HP, skills, combat target, busy state
- inventory and equipment
- active trade
- nearby players, residents, NPCs, world items, objects
- events since previous perception
- available actions

The UI should render unknown fields defensively. Server-side perception will evolve.

### 6.3 Events

Known event kinds:

- `hit_taken`
- `hit_dealt`
- `chat`
- `item_received`
- `item_lost`
- `died`
- `dialogue_opened`
- `dialogue_updated`
- `dialogue_closed`
- `trade_requested`
- `trade_opened`
- `trade_offer_updated`
- `trade_completed`
- `trade_cancelled`
- `arrived`
- `level_up`

Event rows use shard colors consistently:

- success/progress: `--s-green`
- death/failure/combat danger: `--s-rose`
- achievement/level/planning milestones: `--s-gold`
- social/chat: `--s-blue`
- trade/resource movement: `--s-teal`
- uncertainty/controller warnings: `--s-mauve`

---

## 7. Resident Lifecycle Workflows

### 7.1 Spawn

1. Operator opens **Spawn Resident**.
2. Dashboard validates name against `^res:[a-z0-9_]{1,20}$`.
3. Operator selects a soul markdown file from configured `souls.dir`.
4. Operator optionally sets spawn position, initial inventory, and equipment.
5. Dashboard calls `create_resident`.
6. Dashboard records the soul association in dashboard metadata or the ControllerHost desired-resident config.
7. Resident remains offline until connected.

The spawn form should summarize key soul frontmatter that affects autonomy: `attentionProfile`, thinking hooks, variables, legacy kind, and `nervousSystem` rules.

Errors to surface:

- `EBAD_NAME`
- `ERESERVED_NAME`
- `ENAME_TAKEN`
- `ESAVE_CORRUPT`
- gateway unavailable

### 7.2 Connect

1. Dashboard calls `connect_resident { observe: true, control: true, onDisconnect }`.
2. Server loads `data/residents/<name>.json`.
3. Server registers resident into `activeWorld.playerList`.
4. Server returns a resident summary plus first perception.
5. Dashboard subscribes to perception, event, and action-result streams.

The default `onDisconnect` should be `idle` for managed residents and `logout` for manual test residents. The operator must see this policy before connecting.

### 7.3 Attach observe-only

1. Dashboard calls `attach { name, observe: true, control: false }`.
2. Multiple observers are allowed.
3. The dashboard must clearly label the session as read-only.

Observe-only sessions can view perceptions, events, action results, memory, logs, and the spectator, but cannot submit actions.

### 7.4 Request control

Only one gateway client/body owner can control a resident. The holder may be the autonomy runtime's `ResidentBody`, a dashboard manual-control session, or another admin client. If control is held:

- show `controllerId`
- disable direct controls
- allow observe-only attachment
- show `ECONTROL_HELD` as a normal state, not an app crash

If control is available, the dashboard may attach with `control: true`.

### 7.5 Disconnect

`disconnect_resident` gracefully logs out the resident:

- saves resident state
- runs player logout cleanup
- removes the actor from world/chunks/quadtree
- closes session
- keeps save file

The UI should require confirmation when the resident is in combat, trading, or mid-plan.

### 7.6 Delete

`delete_resident` is disabled server-side unless `allowDelete` is true. The dashboard must:

- hide delete by default
- show a destructive confirmation when enabled
- require typing the resident name
- explain that the save file is removed

---

## 8. Control Surface

The dashboard submits only `AgentAction` values. It must not call engine methods or mutate saves directly.

### 8.1 Action palette

Supported action families:

- Movement: `move_to`, `face`
- Interaction: `interact`, `use_item_on`
- Combat: `attack`, `cast_spell`
- Inventory/equipment: `equip`, `unequip`, `drop`, `eat`
- Communication: `say`, `whisper`
- Dialogue: `dialogue_continue`, `dialogue_choice`
- Trading: `trade_request`, `trade_offer_item`, `trade_remove_item`, `trade_accept_stage_1`, `trade_accept_stage_2`, `trade_decline`
- Lifecycle: `logout`
- Utility: `noop`

### 8.2 Contextual controls

Controls should be generated primarily from `perception.availableActions`.

Examples:

- Nearby NPC with `options: ["talk-to", "attack"]` renders Talk and Attack buttons.
- Inventory slots render Equip, Drop, Eat, or Offer based on advertised shapes.
- Open dialogue renders Continue and choice buttons.
- Active trade renders offer/remove/accept/decline controls.

The dashboard may expose an advanced JSON action editor, but it must validate against the action schema before submit.

### 8.3 Results

Each submitted action is tracked with:

- local request id
- sent timestamp
- target resident
- action payload
- action source: `thinking`, `nervous-system`, `body`, or `manual`
- nervous-system `ruleId`, when present
- gateway acknowledgement
- eventual `ActionResult`
- tick observed
- attention spend when known

Rejected action reasons are first-class UI copy:

- `target_out_of_range`
- `inventory_full`
- `no_active_dialogue`
- `session_closed`
- `action_result_timeout`
- unknown reason fallback

---

## 9. Resident Autonomy Surface

The dashboard must expose resident autonomy state without requiring users to read JSONL files manually. The UI should organize this around the runtime's three modules: Thinking, Nervous System, and Body.

### 9.1 Runtime header

For each resident show:

- Thinking: Spark mode (`idle`, `executing`, `deciding`), active hook id and priority, active plan intent, current plan step, in-flight LLM request status, last inference cause, and parse/budget status.
- Nervous System: last matched rule, rule priority, source (`soul` or `memory`), whether it suppressed thinking, whether it interrupted thinking, and active cooldowns.
- Body: control holder, latest perception age, recent event count, last submitted action/result, and gateway health.
- Shared state: attention remaining and pressure, legacy kind and progress, variables, current budget windows, and `noInferenceUntil`, if set.

### 9.2 Thinking plans, hooks, and nervous rules

Thinking plan view:

- intent
- triggering hook
- priority
- steps
- current step status
- `abandonIf`
- max ticks remaining
- last action result

Thinking hook view:

- system hooks
- soul hooks
- memory hooks
- cooldown state
- last fired tick
- last shadowed reason

Nervous rule view:

- rule id
- source: `soul` or `memory`
- condition kind and value
- submitted action
- priority
- cooldown state
- `interruptThinking`
- `suppressThinking`
- `contextHint`
- retired rule ids from `nervous-rules.md`
- last reaction action/result when visible in the action log

Editing thinking hooks or nervous rules is out of scope for v1 unless the controller exposes a safe API. Read-only inspection is required.

### 9.3 Memory

Memory view:

- `INDEX.md`
- recent event notes
- actor/place/item memory files
- `hooks.md` for Thinking/Spark hooks and variables proposed by the LLM
- `nervous-rules.md` for pre-thinking reflex rules proposed by the LLM
- `runtime-state.json`

The dashboard can render markdown but must avoid writing to memory in v1. Controller-owned memory remains controller-owned.

### 9.4 Logs

Action log:

- tick
- event/action/result
- source: `thinking`, `nervous-system`, or `body`
- `ruleId` for nervous-system reactions
- compact perception metadata
- full perception link if logged

Thinking inference log:

- request id
- resident
- triggering hook
- model/provider
- prompt token estimate
- result status
- parse failure
- abort/cancel reason
- latency
- installed plan summary

Inference logs belong to Thinking/Spark only. Nervous-system and body-originated actions must still be visible in action logs even when no inference occurred.

---

## 10. Observation and Spectator Client

Observation has two layers:

1. **Operational observation**: structured resident/player state in dashboard panels.
2. **Visual spectating**: a fork of `rs6-nullcity-client-ts` that renders a game-like view without player login.

### 10.1 Package

Create `packages/observer` as a fork/adaptation of `rs6-nullcity-client-ts`.

The fork should keep:

- JS5/cache loading
- map/model/NPC/player rendering code
- camera and scene rendering
- audio optional and disabled by default

The fork should replace:

- title/login screen
- username/password flow
- RSA login handshake
- gameplay input packet submission
- reconnect-as-player behavior

### 10.2 Spectator modes

```ts
type SpectatorSubject =
  | { kind: 'resident'; name: string }
  | { kind: 'player'; username: string };

type SpectatorMode =
  | 'follow'       // camera follows target as local anchor
  | 'free-camera'  // operator can pan/orbit near target
  | 'picture-in-picture';
```

The operator can switch subjects at runtime. Switching subject should not reload cache assets unless the server requires a region rebuild.

### 10.3 Observable subject discovery

The server now exposes residents and real players through `list_observable_subjects`:

```jsonc
{
  "v": 1,
  "id": "subjects-1",
  "kind": "list_observable_subjects",
  "payload": {
    "includeResidents": true,
    "includePlayers": true
  }
}
```

Response:

```ts
interface ObservableSubjectSummary {
  subject:
    | { kind: 'resident'; name: string }
    | { kind: 'player'; username: string };
  online: boolean;
  position?: { x: number; y: number; level: number };
}
```

If a flag is omitted, the server includes that subject class by default. The gateway lists online resident saves from `ResidentRegistry` and active players from `activeWorld.playerList`. Residents are deduplicated between the registry and active world.

### 10.4 Spectator sessions

The observer opens a read-only session with:

```jsonc
{
  "v": 1,
  "id": "observe-1",
  "kind": "observe_subject",
  "payload": {
    "subject": { "kind": "player", "username": "alice" },
    "mode": "follow"
  }
}
```

Valid subjects:

- `{ kind: "resident", name }`
- `{ kind: "player", username }`

Valid modes:

- `follow`
- `free-camera`
- `picture-in-picture`

Server events:

- `spectator_connected { sessionId, subject, initialState }`
- `spectator_rebuild { sessionId, payload }`
- `spectator_packet { sessionId, opcode, payload }`
- `spectator_perception { sessionId, perception }`
- `spectator_disconnected { sessionId, cause? }`

`spectator_connected.initialState` currently includes:

```ts
interface SpectatorInitialState {
  mode: SpectatorMode;
  regionId?: number;
  position: { x: number; y: number; level: number };
  perception: Perception;
}
```

`spectator_rebuild.payload` currently includes the same fields plus `subject`. The gateway emits it when the subject's region id changes. The observer must treat it as a cue to rebuild or refresh the visible scene around the subject.

`spectator_perception` is emitted on each `activeWorld.tickComplete` for the session's subject. For real players, `PerceptionBuilder.buildForPlayer()` uses the same perception shape as residents but sets `events: []` and `availableActions: []`, keeping the session read-only. For residents observed through this path, the perception is also read-only and does not drain resident events.

`spectator_packet` is part of the protocol contract for opcode/payload render packets. The dashboard observer must handle it when present, but the current gateway path also works from `spectator_connected`, `spectator_rebuild`, and `spectator_perception` frames.

Close a session with:

```jsonc
{
  "v": 1,
  "id": "unobserve-1",
  "kind": "unobserve_subject",
  "payload": { "sessionId": "spectator:..." }
}
```

The gateway also closes spectator sessions when the owning WS client disconnects, when the gateway stops, or when the subject becomes unavailable. Expected errors/causes:

- `ENO_SUCH_SUBJECT`
- `ENO_SUCH_SESSION`
- `client_unobserve`
- `client_disconnect`
- `gateway_stop`
- `subject_unavailable`

### 10.5 No player login guarantee

The observer fork must not:

- send username/password
- perform the classic login handshake as a real account
- hold a normal controllable `Player` session
- emit gameplay `ClientProt` packets
- mutate the world

It may:

- authenticate to the agent/spectator gateway with an admin token
- receive cache validation data
- receive initial region/map rebuild data
- receive `spectator_packet` opcode/payload frames or decoded perception frames
- send subject observe/unobserve requests
- keep camera preferences locally

### 10.6 Local anchor model

`rs6-nullcity-client-ts` assumes a `localPlayer` for camera, minimap, relative player updates, menus, and many UI scripts. The observer fork should introduce a `SpectatorAnchor` abstraction:

```ts
interface SpectatorAnchor {
  subject: SpectatorSubject;
  position: { x: number; y: number; level: number };
  displayName: string;
  combatLevel?: number;
}
```

The renderer can map this anchor into the existing `localPlayer` dependency while disabling gameplay input and private UI affordances. This keeps the renderer usable without pretending the spectator is logged in.

The anchor position should update from `spectator_connected.initialState.position`, `spectator_rebuild.payload.position`, and each `spectator_perception.perception.resident.position`.

---

## 11. Screens and Routes

### 11.1 `/`

Status overview:

- gateway connected/disconnected
- ControllerHost connected/disconnected
- online residents
- offline residents
- residents in danger
- active thinking/inferences
- recent events ticker

### 11.2 `/residents`

Dense roster table with filters:

- all/online/offline/deceased
- controlled/uncontrolled
- in combat
- low attention
- active trade
- errored

Rows show live status, last event, thinking mode, attention, position, body/control state, and quick actions.

### 11.3 `/residents/new`

Spawn form:

- name
- soul
- spawn position
- initial inventory/equipment JSON or presets
- connect after create toggle
- disconnect policy

### 11.4 `/residents/:name`

Resident detail:

- header with status and control state
- spectator pane
- perception snapshot
- action controls
- events
- inventory/equipment
- nearby actors/items/objects
- thinking plan/hooks, nervous rules/reactions, body status, attention/budget state
- memory and logs

### 11.5 Resident spectator

The standalone `/observe` and `/observe/:subject` dashboard routes are removed. Resident spectating is embedded in `/residents/:name` so the operator can see live feed status, body state, logs, and the spectator in one place.

### 11.6 `/souls`

Read-only soul browser:

- starter souls
- validation status
- resident associations
- attention profile
- thinking hooks and variables
- `nervousSystem` rules

### 11.7 `/logs`

Cross-resident log explorer:

- actions
- perceptions
- events
- thinking inference
- filters for `source=thinking`, `source=nervous-system`, `source=body`, and manual dashboard submissions
- gateway errors

---

## 12. Visual Design

The dashboard is an operations tool, but it should still feel like Null City.

### 12.1 Theme

Default to Null City dark:

```css
--ground-0: #0E0C0A;
--ground-1: #161310;
--ground-2: #1E1A16;
--ground-3: #28231E;
--ground-4: #342D26;
--ground-5: #443B30;
--ground-6: #5C5040;

--text-0: #EDE8E0;
--text-1: #D4CDB8;
--text-2: #B0A690;
--text-3: #8A7E6A;
```

Shard colors:

- `--s-blue: #3D94C4`
- `--s-green: #4EAE6E`
- `--s-gold: #E4B840`
- `--s-rose: #D4707A`
- `--s-teal: #58C0B4`
- `--s-amber: #F0B84C`
- `--s-mauve: #B080A0`
- `--s-bone: #3A342C`

Never use pure black or pure white. Prefer warm dark surfaces and chalk text.

### 12.2 Typography

- Outfit: page titles, resident names, major headings.
- DM Sans: body, tables, labels, forms.
- Space Mono: ticks, positions, IDs, attention counts, request IDs, log metadata.

Use tabular numbers for ticks, positions, HP, attention, budget, and latency.

### 12.3 Layout

This is not a marketing page. Use dense but calm operational layouts:

- fixed top nav, 46px
- shard line as section divider
- dark table surfaces
- left-bordered cards for repeated resident summaries
- resizable split panes for spectator + data
- compact forms for actions
- large type only for page-level titles

Avoid generic SaaS gradients, pill-heavy decoration, and nested cards.

### 12.4 Motion

Motion is slow and low-energy:

- hover transition: 0.2s
- panel arrival: subtle fade/translate
- optional background stained-glass shimmer
- event ticker scroll for wall/spectator surfaces

No bounce, spring, or flashy status animations.

### 12.5 Copy

Use short operational labels:

- Resident
- Attention
- Plan
- Hook
- Perception
- Event
- Control held
- Observe only
- Gateway quiet

Avoid marketing copy. Avoid narrative exposition.

---

## 13. Security and Safety

- Dashboard binds to localhost by default.
- Gateway auth token is supported and should be required when not localhost.
- Dangerous actions require confirmation:
  - delete resident
  - disconnect during combat
  - trade accept stage 2
  - drop valuable item
  - logout due to attention exhaustion override, if added later
- Dashboard must never display secrets from controller/autonomy config.
- File APIs are rooted and path-normalized.
- Observer sessions are read-only.
- `hooks.md` and `nervous-rules.md` are read-only in v1 unless a safe controller API exists.
- The advanced JSON action editor is hidden behind an explicit advanced mode.

---

## 14. Error Handling

Show these as normal recoverable states:

- gateway offline
- autonomy host offline
- server restart
- WS reconnecting
- resident save missing
- resident save corrupt
- world full
- control held by another body/controller/dashboard session
- delete disabled
- observable subject missing
- spectator session missing
- spectator subject unavailable after session start
- action timeout
- thinking provider unavailable
- budget exhausted

The UI should preserve recent perceptions and logs during reconnect, marked as stale with last-seen time.

---

## 15. Implementation Plan

### Milestone 1 - Dashboard shell

- Create workspace/package structure.
- Implement Null City tokens and base layout.
- Implement dashboard server config.
- Implement gateway WS client using `v/kind/payload/id`.
- Show gateway status and resident roster.

### Milestone 2 - Resident lifecycle

- Create resident.
- Connect/attach/detach/disconnect.
- Observe live perceptions and events.
- Render resident detail page.
- Handle gateway errors.

### Milestone 3 - Control surface

- Generate contextual controls from `availableActions`.
- Add action result tracking.
- Add advanced JSON action editor.
- Add trade and dialogue controls.
- Add destructive-action confirmations.

### Milestone 4 - Autonomy observability

- Read `runtime-state.json`, memory index, `hooks.md`, `nervous-rules.md`, action logs, and inference logs.
- Add Thinking, Nervous System, Body, attention, variable, legacy, and budget panels.
- Add action source labeling for `thinking`, `nervous-system`, `body`, and manual dashboard actions.
- Add log explorer.
- Gracefully degrade when ControllerHost files are unavailable.

### Milestone 5 - Observer fork

- Fork/adapt `rs6-nullcity-client-ts` into `packages/observer`.
- Replace login/title flow with spectator connect flow.
- Add `list_observable_subjects`, `observe_subject`, and `unobserve_subject` client calls.
- Add `SpectatorAnchor`.
- Disable gameplay input packets.
- Render spectator sessions from connected/rebuild/perception frames.
- Handle `spectator_packet` frames when the gateway emits them.
- Embed observer in resident detail.

### Milestone 6 - Player spectating integration

- Support both resident and real-player subjects in the observer UI.
- Add subject switching between residents and players.
- Close/reopen WS spectator sessions cleanly on subject switch.
- Show `subject_unavailable` and stale-session states.
- Verify no player credentials or normal login sessions are used.

---

## 16. Acceptance Criteria

v1 is complete when:

1. The dashboard can list residents from a running `AgentGateway`.
2. The dashboard can create, connect, observe, detach, and disconnect a resident.
3. The dashboard can submit every supported `AgentAction` through validated UI or advanced JSON.
4. The dashboard shows live perceptions, events, action results, and stale/reconnect state.
5. The dashboard shows resident autonomy state when controller files are present, including Thinking, Nervous System, Body, attention, budgets, variables, and legacy.
6. The dashboard renders Null City dark styling with shard colors, Space Mono metadata, and dense operational layouts.
7. The observer fork can watch an online resident without player username/password.
8. The observer fork can watch an online real player through `observe_subject` without player username/password.
9. Delete is unavailable unless the server enables it.
10. Nervous-system reactions are visible in the UI with rule id, source, action, suppress/interrupt flags, and resulting action status.
11. Tests cover gateway framing, observable subject discovery, spectator session lifecycle, resident lifecycle UI state, action validation, action source labeling, nervous-system reaction visibility, and observer read-only behavior.

---

## 17. Open Questions

1. Should the dashboard own ControllerHost desired-resident config edits, or remain read-only in v1?
2. Where should soul-to-resident association live if a resident is created from the dashboard but ControllerHost config is not edited?
3. Should `spectator_packet` become an emitted render-delta stream, or remain a reserved protocol frame while the observer renders from perception/rebuild frames?
4. Should the observer fork adapt perceptions into the existing canvas renderer, or should the server produce closer-to-client render packets?
5. Should observer sessions consume any world slot, or remain purely virtual as currently implemented?
6. Should SSE remain resident-only, or should observable-subject streams get an HTTP/SSE equivalent?
7. Should action permissions differ between manual dashboard control, runtime Body control, and direct admin/gateway clients?
8. How much map state should perception expose for non-canvas observation panels?
9. Should the controller expose a read-only runtime-status endpoint for active Thinking mode/plan, Nervous System rules, and Body state instead of requiring log and file tailing?
