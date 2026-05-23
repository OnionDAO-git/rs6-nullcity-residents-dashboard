# NullCity Resident Dashboard

Bun, Svelte 5, and TypeScript implementation of the resident operations dashboard described in `SPEC.md`.

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
```

The gateway URL should point at the server `AgentGateway`. The gateway currently accepts any WebSocket path, so `ws://127.0.0.1:43595` is enough for the default local setup. The default local token matches `rs6-nullcity-server/config/server-config.json`; override `AGENT_GATEWAY_TOKEN` if the server config uses a different `agentGateway.authToken`.

`NULLCITY_RS_HOST` is the raw RuneScape game gateway. The browser spectator does not connect to it directly; it connects to the dashboard server's `/rs` WebSocket proxy, which forwards TCP traffic to this host.
