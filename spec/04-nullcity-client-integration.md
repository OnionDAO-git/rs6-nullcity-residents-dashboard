# Plan: Fork And Integrate `nullcity-client-ts`

## Goal

Copy `../nullcity-client-ts` into this project, heavily modify it for city use, and let authenticated attendees log into the Null City world from `city.oniondao.dev`.

## Current Client Facts

The client is not a normal SPA. It is a custom Bun/TypeScript canvas game client.

- Standalone boot: `nullcity-client-ts/public/index.html`.
- Main class: `nullcity-client-ts/src/client/Client.ts`.
- Shell: `nullcity-client-ts/src/client/GameShell.ts`.
- Canvas dependency: `nullcity-client-ts/src/graphics/Canvas.ts` resolves `#canvas` at import time.
- Login path: legacy RuneScape 435 binary login protocol using username/password, JS5 CRCs, RSA constants, ISAAC seeds, and an open binary stream.
- Existing dashboard usage: spectator-only through `packages/web/src/spectator.ts`, `packages/web/src/client2.d.ts`, Vite alias to `../../../nullcity-client-ts`, and server `/rs` proxy.

## Target Package Shape

Create an in-repo fork:

```text
packages/game-client/
  package.json
  src/
    client/
    dash3d/
    graphics/
    io/
    ...
  public/
  README.md
  UPSTREAM.md
```

`UPSTREAM.md` should record:

- Source path copied from.
- Copy date.
- Commit SHA of `nullcity-client-ts` if available.
- Known local patches.
- Instructions for future upstream diffs.

Update `packages/web/package.json`:

- Replace `client2: file:../../../nullcity-client-ts` with workspace dependency on `@nullcity-dashboard/game-client`.

Update `packages/web/vite.config.ts`:

- Remove cross-repo aliases.
- Point `client2` or new import aliases at `packages/game-client/src`.

## Integration Strategy

### Phase 1: Preserve Spectator

- Copy client without behavior changes.
- Make the current spectator route compile and render from the in-repo package.
- Keep `/api/controller/config` returning `rsClientHost` and secure flag.
- Keep `/rs` as the only browser-facing binary endpoint.

### Phase 2: Isolate Lifecycle

Refactor before changing product behavior:

- Replace import-time `#canvas` lookup with injected canvas or container.
- Add `destroy()` to detach listeners, audio, timers, and streams.
- Make `GameShell.shell` lifecycle explicit so the app can unmount/remount.
- Move network config into a small adapter.
- Move title/login state behind an adapter.

### Phase 3: Authenticated Game Login

Do not reuse Onion DAO credentials as the legacy password field. Add a proper SSO path.

Recommended flow:

1. Browser opens `/world`.
2. City BFF validates landing `session` cookie.
3. Browser requests `POST /api/game/session`.
4. City creates a short-lived game ticket:
   - `ticket`
   - `landingUserId`
   - `gameUsername`
   - `expiresAt`
   - `nonce`
5. Game client connects to `/rs`.
6. Login adapter sends game username and ticket through a new protocol path.
7. Null City server validates ticket, either by:
   - shared signing key, or
   - callback to city internal endpoint, or
   - shared city DB read.
8. Server logs the player in and maps them to `landingUserId`.

Server changes needed in `../nullcity-server`:

- Add a ticket login branch to the login handler.
- Store player profile mapping to landing user ID.
- Enforce ticket TTL and single use.
- Preserve the existing legacy login path for dev/debug if desired.

Fallback option:

- Generate a per-user game account/password in city DB and fill the legacy login fields automatically. This is easier but less correct because it preserves password semantics and makes rotation/account recovery awkward.

### Phase 4: City UI Modifications

- Remove or bypass the old title screen for authenticated users.
- Start directly in login/loading state with city profile identity.
- Add a lightweight overlay for AP/GP, inbox unread, and resident interactions.
- Preserve full-window canvas behavior for `/world`.
- Keep debug/spectator mode separate from player mode.

## Server/API Work

City BFF:

- `GET /api/game/config`: returns `/rs`, secure flag, client feature flags.
- `POST /api/game/session`: returns a short-lived ticket for logged-in users.
- `POST /api/game/logout`: invalidates city-side ticket/session state if needed.
- `/rs`: authenticate WebSocket upgrade before proxying, or require first packet ticket validation server-side.

Null City server:

- Add ticket login validation.
- Add stable player identity mapping.
- Expose player inventory/gold operations needed by GP burns and trades.
- Audit login and logout events for overseer.

## Risks

- Client has global singleton state and import-time DOM assumptions.
- `Client.ts` is large and protocol-coupled; heavy changes without adapters will be risky.
- JS5 CRCs, protocol flags, RSA constants, packet IDs, and server version must match.
- Production must use WSS; the game stream itself is not a secure auth layer.
- `/rs` must not become an unauthenticated public raw TCP proxy.

## Acceptance Criteria

- Current spectator functionality works from the in-repo copied client.
- `/world` mounts and unmounts without leaking duplicate listeners or loops.
- Logged-in Onion DAO user can enter the game without typing a separate password.
- Logged-out users cannot use `/rs` or create game tickets.
- Game server receives a stable identity linked to `landing.users.id`.
- Existing debug/spectator operation still works under `/debug`.

## Questions

- Should game usernames be derived from landing handle, email, or a new city handle?
  - new city handle
- Should attendees be full players, spectator-only users, or a separate actor type?
  - full players for now
- Can the Null City server accept a new ticket login protocol soon, or do we need the generated-password fallback first?
  - generated password fallback
- Should `/rs` authenticate at WebSocket upgrade time, first game packet time, or both?
  - both
