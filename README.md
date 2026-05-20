# NullCity Resident Dashboard

Bun, Svelte 5, and TypeScript implementation of the resident operations dashboard described in `SPEC.md`.

## Run

```sh
bun install
bun run dev
```

The web app runs on `http://127.0.0.1:5174/` and proxies API calls to the dashboard server at `http://127.0.0.1:8787/`.

## Environment

```sh
DASHBOARD_HOST=127.0.0.1
DASHBOARD_PORT=8787
AGENT_GATEWAY_URL=ws://127.0.0.1:43595
AGENT_GATEWAY_TOKEN=
NULLCITY_RS_HOST=127.0.0.1:43594
NULLCITY_SERVER_ROOT=../rs6-nullcity-server
NULLCITY_MEMORY_ROOT=../rs6-nullcity-server/data/memory
NULLCITY_LOGS_ROOT=../rs6-nullcity-server/data/logs
NULLCITY_SOULS_ROOT=../rs6-nullcity-server/data/souls
```

The gateway URL should point at the server `AgentGateway`. The gateway currently accepts any WebSocket path, so `ws://127.0.0.1:43595` is enough for the default local setup.

`NULLCITY_RS_HOST` is the raw RuneScape game gateway. The browser spectator does not connect to it directly; it connects to the dashboard server's `/rs` WebSocket proxy, which forwards TCP traffic to this host.
