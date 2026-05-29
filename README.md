# NullCity Resident Dashboard

Bun, Svelte 5, and TypeScript implementation of the resident operations dashboard described in `SPEC.md`.

This repo owns all human-facing Null City UI. `../rs6-nullcity-server` should stay focused on runtime, controller, resident intelligence, logs, data, CLI tools, and JSON/control APIs.

The attendee dashboard is served from `/`. The previous resident operations dashboard is preserved under `/debug`, including its legacy static pages under `/debug/index.html`, `/debug/wall`, `/debug/inbox`, `/debug/patron`, `/debug/graveyard`, and `/debug/library`.

## Run

```sh
bun install
bun run dev
```

The web app runs on `http://127.0.0.1:5174/` and proxies API calls to the dashboard server at `http://127.0.0.1:8787/`. During `bun run dev`, browser routes opened on the API server are redirected to Vite so source changes under `packages/web/src` are shown live instead of the last `dist` build.

## Environment

```sh
DASHBOARD_HOST=127.0.0.1
DASHBOARD_PORT=8787
AGENT_GATEWAY_URL=ws://127.0.0.1:43595
AGENT_GATEWAY_TOKEN=nullcity-local-dev
NULLCITY_RS_HOST=127.0.0.1:43594
NULLCITY_SERVER_ROOT=../rs6-nullcity-server
NULLCITY_MEMORY_ROOT=../rs6-nullcity-server/data/controller/memory
NULLCITY_LOGS_ROOT=../rs6-nullcity-server/data/controller/logs
NULLCITY_AGENT_LOGS_ROOT=../rs6-nullcity-server/data/agent-logs
NULLCITY_SOULS_ROOT=../rs6-nullcity-server/src/controller/soul/starter-souls
CITY_DATABASE_URL=postgres://...
LANDING_DATABASE_URL=postgres://...
LANDING_AUTH_BASE_URL=https://oniondao.dev
AUTH_COOKIE_NAME=session
AUTH_COOKIE_DOMAIN=.oniondao.dev
CITY_PUBLIC_BASE_URL=https://city.oniondao.dev
CITY_PRINT_BRIDGE_TOKEN=<shared bridge token>
```

The gateway URL should point at the server `AgentGateway`. The gateway currently accepts any WebSocket path, so `ws://127.0.0.1:43595` is enough for the default local setup. The default local token matches `rs6-nullcity-server/config/server-config.json`; override `AGENT_GATEWAY_TOKEN` if the server config uses a different `agentGateway.authToken`.

`NULLCITY_RS_HOST` is the raw RuneScape game gateway. The browser spectator does not connect to it directly; it connects to the dashboard server's `/rs` WebSocket proxy, which forwards TCP traffic to this host.

City auth reads the Onion DAO `session` cookie used by `../../landing-2026`. `LANDING_DATABASE_URL` should be read-only for the landing database, and `CITY_DATABASE_URL` should point at this dashboard's own database so AP, GP, proposals, print requests, resident inboxes, and soul-library data do not pollute the landing database.

## Railway

`railway.json` builds with Bun and starts the server with `bun run start`. The configured healthcheck is `/api/health`.

Required production variables:

```sh
DASHBOARD_HOST=0.0.0.0
DASHBOARD_PORT=${{ PORT }}
CITY_DATABASE_URL=${{ Postgres.DATABASE_URL }}
LANDING_DATABASE_URL=<landing-2026 database URL>
LANDING_AUTH_BASE_URL=https://oniondao.dev
AUTH_COOKIE_NAME=session
AUTH_COOKIE_DOMAIN=.oniondao.dev
CITY_PUBLIC_BASE_URL=https://city.oniondao.dev
AGENT_GATEWAY_URL=<nullcity-server agent gateway websocket URL>
AGENT_GATEWAY_TOKEN=<nullcity-server agent gateway token>
NULLCITY_RS_HOST=<nullcity-server rs tcp proxy host:port>
CITY_PRINT_BRIDGE_TOKEN=<shared bridge token>
```

The local checkout is not linked to a Railway project by default. Link or deploy it into the same Railway project/environment as `landing-2026`, add a separate Postgres service for this dashboard, and attach `city.oniondao.dev` to the dashboard service.

### Railway deploy script

`./railway-deploy.sh` can create or reuse the Railway project, ensure the production environment, create the dashboard service, provision the city Postgres service when missing, set the required dashboard variables, optionally attach a custom domain, and upload a deployment.

The landing database is not created by this repository. Pass the existing `landing-2026` database URL as `LANDING_DATABASE_URL`; a read-only database user is preferred.

```sh
ENV_FILE=.env.production ./railway-deploy.sh
```

At minimum the script needs:

```sh
LANDING_DATABASE_URL=postgres://...
AGENT_GATEWAY_URL=wss://...
AGENT_GATEWAY_TOKEN=...
NULLCITY_RS_HOST=host:43594
CITY_PRINT_BRIDGE_TOKEN=...
```

Useful options:

```sh
RAILWAY_SELECT_PROJECT=1
RAILWAY_WORKSPACE=<workspace id or name>
RAILWAY_PROJECT_ID=<existing project id>
RAILWAY_ENVIRONMENT=production
RAILWAY_APP_SERVICE=residents-dashboard
CUSTOM_DOMAIN=city.oniondao.dev
SKIP_DEPLOY=1
DRY_RUN=1
```

When run from an interactive terminal and `RAILWAY_PROJECT_ID` is not set, the script can list Railway workspaces and projects so you can choose an existing project or create a new project in the selected workspace. Set `RAILWAY_SELECT_PROJECT=0` to disable prompts in local runs.

## Print Bridge

The LAN print bridge can run separately from the Railway web service and poll the city API with `PRINT_BRIDGE_CITY_BASE_URL` and `PRINT_BRIDGE_CITY_TOKEN`.

For Bambu LAN printers:

```sh
PRINT_BRIDGE_ADAPTER=bambu-lan
PRINT_BRIDGE_PRINTER_ID=p2s-east
BAMBU_LAN_HOST=192.168.1.50
BAMBU_LAN_SERIAL=01P00A123456789
BAMBU_LAN_ACCESS_CODE=12345678
BAMBU_LAN_MQTT_PORT=8883
BAMBU_LAN_FTP_PORT=990
BAMBU_LAN_UPLOAD_DIRECTORY=cache
```

The Bambu adapter uploads print artifacts over implicit FTPS as user `bblp`, then publishes MQTT commands over TLS to `device/<serial>/request`. It supports status refresh, `.gcode` start, `.3mf` project start with optional Bambu metadata, pause, resume, and stop.
