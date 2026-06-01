# Storyteller Projector Backlog

Status: active working list for the public `/overview` projector and Storyteller integration.

Related server docs:

- `../rs6-nullcity-server/docs/superpowers/specs/2026-06-01-autonomous-storyteller-design.md`
- `../rs6-nullcity-server/docs/2026-05-28-storyteller-design.md`
- `../rs6-nullcity-server/docs/city-dashboard-integration.md`

## Goal

Make `/overview` the live attention router for Null City. A human at OnionDAO should understand within five seconds:

- what happened;
- where it happened;
- who matters right now;
- whether anyone is in danger;
- what to watch or do next.

The Storyteller voice should be sharp, weird, fantasy/cyberpunk, and DCC-adjacent without becoming an old-fashioned news anchor or directly imitating a copyrighted voice. The dashboard should present the Storyteller as a public showrunner, not as a generic status bot.

## Ownership

- Dashboard repo: `/overview`, projector/mobile rendering, dashboard navigation, public-safe BFF proxy, admin UI for overrides.
- Server repo: evidence frames, model calls, run loop, verification, public-safe projector frame endpoint, override APIs.
- Server must not own human-facing UI.

## Review Findings

Expert reviews converged on these points:

- Build one public-safe `ProjectorStoryFrame`; do not let the dashboard independently stitch story, map, and live state forever.
- Public routes must fail closed: never render candidate, review, dry-run, malformed, or review-needed model text.
- The first viewport should answer: what happened, where, and what humans should do or watch.
- The map must follow the lead event or active cluster, not default to Lumbridge when the story is elsewhere.
- The right rail should be a small set of high-signal stakes, not several equal-weight feeds.
- Claims need stronger grounding than keyword checks before full autonomous Sonnet publishing.

## P0 Backlog

- [ ] **P0-1: Public fail-closed Storyteller copy.**
  - Public `/overview` and public JSON should render only clean canon dispatch copy or deterministic fallback.
  - Review, dry-run, candidate, malformed, or review-needed model text must not appear publicly.
  - Progress 2026-06-01: dashboard digest reader now strips public dispatch copy from dry-run, review, and review-needed canon artifacts; `/overview` now prefers older safe canon copy over newer unsafe drafts.

- [ ] **P0-2: Server-owned projector frame.**
  - Consume a server-produced public frame with narration, events, residents, map pins, actions, calls to action, watch-next, freshness, and public health.
  - Add dashboard BFF `GET /api/projector/overview`.
  - Keep dashboard fallback dev-only and public-safe.

- [ ] **P0-3: First viewport projector hierarchy.**
  - Keep story, map, primary human move/watch-next, and top stakes above the fold on 16:9.
  - Limit first-screen right rail to one combined `Top Things`/`Live Focus` panel.
  - Move long leaderboards and feeds below the fold.

- [ ] **P0-4: Story readability.**
  - Prefer one headline, one lede, short paragraph chunks, and at most three key fact cards.
  - Avoid wall-of-text blocks and old newscaster phrases.
  - Translate AP/GP/NCRI into consequences for newcomers.

- [ ] **P0-5: Map follows the story.**
  - Focus on the lead resident, lead event, or densest important cluster.
  - Show why the viewport was selected.
  - Highlight protagonist/event pins and meaningful off-map clusters.
  - Progress 2026-06-01: current dashboard model now selects the lead resident viewport or highest-scoring active cluster instead of always using Lumbridge.

- [ ] **P0-6: Primary call to action.**
  - Add a single visible action/watch card: grant AP, witness, send offer, visit location, watch resident, or operator check.
  - Keep CTA copy plain and actionable, less ornate than narration.

- [ ] **P0-7: Admin escape hatch.**
  - Add edit, suppress/delete, and restore controls for Storyteller dispatches.
  - Store append-only audit history.
  - Do not make admins review normal dispatches before publication.

## P1 Backlog

- [ ] **P1-1: Human action summaries.**
  - Show AP grants, witnesses, offers, letters, trades, and useful interventions with public-safe aliases.

- [ ] **P1-2: Richer stakes rail.**
  - Replace generic `Leaderboard` with endangered, enriched, newly canonical, human-touched, print/GP/NCRI, and watch-next signals.

- [ ] **P1-3: Continuity and arcs.**
  - Show recurring resident beats, unresolved dangers, and "previously in Null City" continuity from server evidence.

- [ ] **P1-4: Projector polish.**
  - Add full-screen mode, stale-data indicator, mobile ordering, long-name cases, and screenshot regression checks.

- [ ] **P1-5: Dispatch history.**
  - Keep `/overview` focused, but provide a chronicle/history view for previous Storyteller dispatches and evidence.

## Safety Fixtures

- [ ] Review dispatch never public.
- [ ] Dry-run dispatch never public.
- [ ] Candidate/malformed model output never public.
- [ ] Wrong actor/amount/item/location falls back.
- [ ] AP/GP conflation falls back.
- [ ] Prompt injection/private handles in notes, speech, or letters do not leak.
- [ ] Stale position cannot be described as current location.
- [ ] Concurrent scheduler ticks produce at most one paid model call.
- [ ] Suppressed/deleted dispatches never appear publicly.

## Working Order

1. Finish P0-1 and safety fixtures for the current dashboard path.
2. Build P0-2 server-owned public frame and dashboard proxy.
3. Improve P0-3 through P0-6 so the projector is legible and action-oriented.
4. Add P0-7 admin override controls.
5. Add P1 continuity, human actions, history, feedback, and polish.
