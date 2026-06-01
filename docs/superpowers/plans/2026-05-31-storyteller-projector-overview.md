# Storyteller Projector Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real `/overview` projector page for Storyteller narration and a coordinate-grounded resident atlas.

**Architecture:** Keep v1 client-side and read-only. Add pure mapping/model helpers in `packages/web/src/lib/story-overview.ts`, route recognition in `packages/web/src/lib/routes.ts`, and a dedicated projector snippet/style set in `packages/web/src/App.svelte` and `packages/web/src/app.css`.

**Tech Stack:** Svelte 5, Bun tests, existing dashboard BFF APIs.

---

### Task 1: Route Contract

**Files:**
- Modify: `packages/web/src/lib/routes.ts`
- Modify: `packages/web/src/lib/routes.test.ts`

- [ ] Write a failing test that `/overview` is known, public, loads the city snapshot, and loads Storyteller digests.
- [ ] Run `bun test packages/web/src/lib/routes.test.ts` and confirm the new test fails.
- [ ] Add `/overview` to `cityRouteNeedsSnapshot`, `cityRouteNeedsStoryDigests`, and `isKnownCityRoute`.
- [ ] Re-run `bun test packages/web/src/lib/routes.test.ts` and confirm the test passes.

### Task 2: Projector View Model

**Files:**
- Create: `packages/web/src/lib/story-overview.ts`
- Create: `packages/web/src/lib/story-overview.test.ts`

- [ ] Write failing tests for atlas viewport selection, resident pin projection, off-map region grouping, lead dispatch fallback, and top resident action selection.
- [ ] Run `bun test packages/web/src/lib/story-overview.test.ts` and confirm the tests fail because the helper does not exist yet.
- [ ] Implement the minimal pure helper functions and exported model types.
- [ ] Re-run `bun test packages/web/src/lib/story-overview.test.ts` and confirm the tests pass.

### Task 3: Projector UI

**Files:**
- Modify: `packages/web/src/App.svelte`
- Modify: `packages/web/src/app.css`

- [ ] Import the view-model helper.
- [ ] Add a derived `cityProjectorOverview` model from `cityResidents`, `cityStoryDigests`, `overview`, and `citySession`.
- [ ] Add `/overview` render handling outside the operator side-rail shell.
- [ ] Add snippets for the dispatch, atlas, action rails, and off-map list.
- [ ] Add projector CSS with responsive constraints and no horizontal overflow.

### Task 4: Verification

**Files:**
- No production files unless fixes are needed.

- [ ] Run focused tests:
  - `bun test packages/web/src/lib/routes.test.ts packages/web/src/lib/story-overview.test.ts`
- [ ] Run web typecheck:
  - `bun run --filter '@nullcity-dashboard/web' check`
- [ ] Open `http://127.0.0.1:5174/overview` in the in-app browser.
- [ ] Verify the atlas renders, uses real live data, has no horizontal overflow, and remains legible on desktop and mobile viewport widths.
- [ ] Request subagent review and fix important issues.

