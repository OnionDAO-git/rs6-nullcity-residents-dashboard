# Storyteller Projector Overview Spec

**Goal:** Build a public-safe `/overview` route for the OnionDAO projector that makes Null City legible at a glance: Storyteller narration, live resident/city actions, and a useful coordinate-grounded atlas.

**Approved Direction:** Use a real-data atlas, not abstract map art. The first version uses live resident positions from `/api/overview`, joins Storyteller events to current resident coordinates when possible, and shows off-map residents as regional context.

## V1 Requirements

- `/overview` is a known, public, read-only city route.
- It auto-refreshes through the existing dashboard refresh loop.
- It does not show login prompts, admin controls, inbox controls, or operator readiness queues.
- It uses existing public-ish data already available to the dashboard:
  - `api.overview()`
  - `api.storytellerDigests()`
- The atlas shows:
  - current viewport bounds and coordinate labels
  - named Lumbridge landmarks for v1
  - resident pins using `position`, `feed.position`, or `body.position`
  - event/freshness labels from `feed.latestEventKind`, `lastEvent`, and Storyteller top events
  - off-map region cards for residents outside the active viewport
- Storyteller copy prefers dispatch `publicTitle`/`publicBody` when available, but the UI must label review/dry-run material instead of pretending it is canon.
- Resident names and important rows link to existing read-only/detail pages.

## V1 Non-Goals

- No new write actions.
- No real RuneScape terrain tiles yet.
- No spectator iframe dependency for the projector route.
- No server-side public API shaping in the first slice; only display public-safe fields. A shaped public endpoint is a follow-up.

## Map Principle

The map should answer three questions in one glance:

1. Where is the main event?
2. Who is nearby?
3. Which important residents are outside the current viewport?

