# Upstream Client Notes

- Source path considered: `../nullcity-client-ts`
- Copy status: copied to `src/runtime/upstream`
- Copy date: 2026-05-27
- Inspection date: 2026-05-27
- Observed package name: `client2`
- Upstream git commit: `9d8ae29c437cf117b21112efa055eaaa1a0b8a80`
- Upstream worktree at copy time had local modifications in:
  - `docs/resizable-rendering.md`
  - `public/index.html`
  - `src/client/ClientConfig.ts`
  - `src/client/GameShell.ts`
  - `src/dash3d/Model.ts`
  - `src/dash3d/World.ts`
- Copied source size: 143 files, including upstream `src`, `LICENSE`,
  `package.upstream.json`, and `tsconfig.upstream.json`
- Excluded artifacts: `.git`, `node_modules`, `out`, `public`

The upstream client is a Bun/TypeScript canvas runtime with aliases for `#/*` and
`#3rdparty/*`. The dashboard package keeps the vendored source under
`src/runtime/upstream` but excludes it from the package typecheck until the import
and lifecycle assumptions are refactored.

## Runtime Boundary

`src/runtime/index.ts` exposes `createForkedRuntimeLifecycleAdapter`. It injects the
controller-provided canvas by assigning an id before runtime load and sets the
upstream globals used for the `/rs` host and secure flag. The default loader throws
with the current blockers; callers can pass `loadModule` once the app bundler maps
aliases and build-time defines.

Current blockers:

- `src/runtime/upstream/src/graphics/Canvas.ts` reads
  `document.getElementById('canvas')` at import time.
- Upstream imports use `#/*` and `#3rdparty/*`; this package does not expose those
  import maps from its root package.json because they would affect the facade.
- `process.env.RUNEJS_SERVER_PROT`, `process.env.RUNEJS_CUSTOM_COL`,
  `process.env.LOGIN_RSAE`, and `process.env.LOGIN_RSAN` are intended to be replaced
  by the upstream Bun bundling script.
- Upstream runtime has static singleton lifecycle state in `GameShell`, so robust
  repeated start/destroy still needs direct runtime patching beyond the facade.

Diff command for future updates:

```sh
diff -ru ../nullcity-client-ts/src packages/game-client/src/runtime/upstream/src
```
