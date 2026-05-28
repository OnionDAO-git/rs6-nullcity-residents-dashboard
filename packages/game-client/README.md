# Null City Game Client Package

This package is the in-repo integration point for the Null City browser game client.
It vendors `../nullcity-client-ts` under `src/runtime/upstream` and keeps a typed
adapter boundary that the dashboard can import without forcing the existing game
runtime into current builds.

## API Shape

- `canvas`: creates, mounts, and unmounts the browser canvas without the game runtime
  resolving `#canvas` at import time.
- `session-ticket`: requests short-lived city game tickets from the dashboard BFF.
- `lifecycle`: wraps the eventual forked game runtime behind explicit `start` and
  `destroy` calls.
- `runtime`: compile-safe boundary for the vendored upstream client. The default
  loader documents the current blockers and throws until a bundler-specific loader
  is supplied.
- root export: `createGameClient` composes the adapters into a single controller.

## Intended Usage

```ts
import {
  createDomCanvasAdapter,
  createForkedRuntimeLifecycleAdapter,
  createGameClient,
  createHttpSessionTicketAdapter,
} from '@nullcity-dashboard/game-client';

const client = createGameClient({
  canvas: createDomCanvasAdapter({ container }),
  session: createHttpSessionTicketAdapter(),
  lifecycle: createForkedRuntimeLifecycleAdapter({
    async loadModule(context) {
      return loadBundledNullCityRuntime(context);
    },
  }),
  config: {
    endpoint: '/rs',
    secure: true,
    mode: 'player',
  },
});

await client.start();
await client.destroy();
```

## Next Integration Step

Replace the upstream import-time canvas lookup with an explicit canvas provider,
then move the upstream aliases and Bun define-time environment replacement into a
package-local build path. After that, the default runtime loader can import the
fork directly and repeated `start`/`destroy` can be hardened against `GameShell`
singleton state.
