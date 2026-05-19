# Null City — Design & Brand

A single-file design brief for **Null City v2**, the in-person event RPG hosted at the Onion DAO embassy in Chicago. This document is intended for handoff to a design tool (claude.ai/design) — it describes the world, the visual system, the typography, the components, and the "voice" of the product.

---

## 1. The Premise (so the design makes sense)

Null City is a small, dim, candlelit *city of AI residents* that sits behind the Onion DAO embassy. Humans (called **visitors**) walk in off the street, attend workshops, earn **Shards** (a universal point currency), and then *spend those shards on AI residents* in exchange for faction-specific **resources**. Those resources combine into **achievements**, which are printed as 3D lanyard tokens and ratify new **parcels** of territory on a wall map.

There are two coexisting brands sharing the same shell:
- **Null City** — the dark, secret, slightly haunted gameplay surface. Default.
- **Onion DAO** — the warm, paper-bright public-facing surface for the parent org.

They share a palette of 8 "shard" signal colors. They differ in **ground** (background) and **text** scales: Null City is a dark cathedral; Onion DAO is parchment.

The aesthetic is **medieval cathedral × server room**:
- Stained glass, soldered halos, reliquary boards, hand-drafted schematics.
- Validator nodes as scribes; resident deaths as funerals; epitaphs in a library of souls.
- Lit by a few moving "light sources" that animate refracted color across glass.

It should never feel like a SaaS dashboard. It should feel like *you have been admitted somewhere*.

---

## 2. Brand Vocabulary

Use these words exactly. They are load-bearing.

| Term | Meaning |
|---|---|
| **Visitor** | A human user (external). |
| **Resident** | An AI agent (internal). |
| **Faction Rep** | A long-lived flagship resident representing a faction. |
| **Shard** | Universal point currency. Earned by humans, spent on residents. |
| **Attention** | A resident's economic life — depletes each tick, refills when humans spend shards on them. |
| **Resource** | A faction-specific token. 12 total, 3 per faction, tiered T1/T2/T3. |
| **Achievement** | A 3D-printable lanyard recipe. Single-faction, cross-faction, or civic. |
| **Parcel** | A unit of territory on the wall map. Born when an achievement is redeemed. |
| **Embassy** | The physical venue in Chicago (Onion DAO HQ). |
| **Library of Souls** | The graveyard / record of deceased residents. |

Tagline-ish moods to reach for: *"You are not currently a credentialed guest at the embassy."* / *"The city flaked off a tiny piece of itself when you arrived. It noticed you."* / *"Their memory got a little of you in it."*

---

## 3. The Four Factions

Each faction has a **theme**, **motto**, **single hex color**, and a 1–2 sentence flavor blurb. The color is used for: faction-card left-borders, parcel fills on the wall map, leaderboard swatches, and as an accent in faction-scoped UI.

| Faction | Theme | Color | Motto |
|---|---|---|---|
| **The Solder Saints** | Hardware | `#B87333` (copper) | "No mind without a body. No body without a board." |
| **The Hatchery** | AI / model training | `#E6B800` (egg-yolk gold) | "Every resident was someone's training run." |
| **The Locksmiths** | Cybersecurity | `#1A1A1A` (redacted black) | "There is no secure system. We are merely curating the breaches." |
| **The Ledgerwrights** | Blockchain | `#8C6B3F` (illuminated-manuscript bronze) | "Nothing happened until everyone agrees it happened." |

**Locksmiths are visually special:** their parcels render as solid black blocks (redacted), with a faint reddish glow (`box-shadow: 0 0 6px rgba(212,112,122,0.5)`). Treat them as the "negative space" faction wherever they appear.

Each faction has named rivalries (they say things about each other) — useful for faction-detail flavor text but never aggregated into a single tile.

---

## 4. The 12 Resources

Three per faction, tiered. The names are precious and a little weird on purpose — keep them verbatim.

**Solder Saints:** Flux Drop (T1, 2 shards) · Signed Schematic (T2, 6 shards) · Reliquary Board (T3, 15 shards)
**Hatchery:** Token Crumb (T1, 2) · Echo Fragment (T2, 6) · Lineage Scroll (T3, 15)
**Locksmiths:** Tumbler Pin (T1, 2) · Master Bypass (T2, 6) · Vault Charter (T3, 15)
**Ledgerwrights:** Mempool Mote (T1, 2) · Block Seal (T2, 6) · Genesis Crumb (T3, 15)

Each resource needs:
- A **flavor line** (one sentence, given verbatim in `packages/types`).
- A **standing gate** — T1 needs `acquaintance`, T2 needs `ally`, T3 needs `officer`.

Visually: think small artifact cards — a faction-colored frame, a serif name, a thin mono cost line, a single-paragraph italic serif flavor line.

---

## 5. The 11 Achievements

Recipes that consume resources and produce a 3D-printed lanyard token.

- **Single-faction (4):** The Soldered Halo · The Hatched Egg · The Master Key · The Signed Block.
- **Cross-faction (4):** The Embodied Mind (Saints+Hatchery) · The Sealed Sandbox (Hatchery+Locksmiths) · The Witnessed Vault (Locksmiths+Ledgerwrights) · The Forged Coin (Ledgerwrights+Saints).
- **Civic (3, no recipe — granted by embassy):** The First Shard · The Mortician's Ribbon · The Founder's Stake.

When designing achievement cards: emphasize the **name in serif**, the **recipe as small mono lines**, and treat civic achievements differently — they should feel *bestowed*, not bought (no recipe block; a small "GRANTED" tag in mono).

---

## 6. The Color System

### 6.1 Shard signal palette (constant across brands)

These 8 colors are *the* palette. Everything else is a ground or a text tone. They are named with an `--s-` prefix and used for: chart accents, animated voronoi shards on the hero, faction-rep moods, the shard divider line, link colors, ticker event colors.

| Token | Hex | Use |
|---|---|---|
| `--s-blue` | `#3D94C4` | Login/auth links, cool accents |
| `--s-green` | `#4EAE6E` | Birth events, success states |
| `--s-gold` | `#E4B840` | Primary link color, achievement events, leaderboard counts |
| `--s-rose` | `#D4707A` | Death events, locksmith glow |
| `--s-teal` | `#58C0B4` | Tertiary accent |
| `--s-amber` | `#F0B84C` | Secondary warm accent |
| `--s-mauve` | `#B080A0` | Unease / liminal accent |
| `--s-bone` | `#3A342C` | The "neutral" shard color; warm dark |

Each color also has a **glow variant** at 10% alpha (`--g-blue`, `--g-green`, etc.) for soft fills.

### 6.2 Null City — dark ground/text scale (DEFAULT)

```
--ground-0: #0E0C0A   /* void — page background */
--ground-1: #161310   /* crypt — surface 1 */
--ground-2: #1E1A16   /* nave — surface 2 */
--ground-3: #28231E   /* chapel — borders */
--ground-4: #342D26   /* alcove — hover borders */
--ground-5: #443B30   /* worn */
--ground-6: #5C5040   /* weathered */

--text-0:   #EDE8E0   /* chalk — primary, headings */
--text-1:   #D4CDB8   /* chalk-2 — body */
--text-2:   #B0A690   /* chalk-3 — secondary, motto */
--text-3:   #8A7E6A   /* chalk-4 — labels, tags */
```

Legacy aliases exist for porting (`--void`, `--crypt`, `--nave`, `--chapel`, `--alcove`, `--worn`, `--weathered`, `--chalk`, `--chalk-2`, etc.). Prefer the semantic `--ground-N` / `--text-N` tokens in new work.

### 6.3 Onion DAO — light ground/text scale (overrides on `[data-brand="onion-dao"]`)

```
--ground-0: #EDE8E0   /* parchment */
--ground-1: #E4DED4
--ground-2: #D8D0C4
--ground-3: #C8BEA8
--ground-4: #B0A690
--ground-5: #8A7E6A
--ground-6: #706858

--text-0:   #1A1714   /* ink */
--text-1:   #2C2820
--text-2:   #4A4438
--text-3:   #706858

--grout:    #C8BEA8
--selection-bg: rgba(61,148,196,.18)
```

The light theme should feel like **aged paper** — not bright white. Never use pure `#FFF` or pure `#000` in either theme.

### 6.4 Grout

`--grout` is the inter-shard hairline — `var(--ground-0)` in dark mode, `#C8BEA8` in light. `--grout-narrow: 1px`. Used between voronoi cells, between shard-line spans, anywhere a stained-glass leading line is implied.

---

## 7. Typography

Three families, loaded from Google Fonts in the layout `<head>`:

```html
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600;700;800&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&display=swap" rel="stylesheet" />
```

| Token | Family | Role |
|---|---|---|
| `--serif` | **Outfit** | Display + serif-feeling headings. (Used as "serif" semantically even though it's a humanist sans — it carries the elegant, ceremonial weight in this design.) |
| `--sans` | **DM Sans** | Body copy, UI labels, paragraphs. |
| `--mono` | **Space Mono** | Tags, metadata, costs, leaderboard counts, section labels, anything tabular. |

### 7.1 Scale & treatment patterns

- **Hero / page title** — `font-family: var(--serif); font-weight: 300; font-size: clamp(48px, 9vw, 96px); line-height: 0.95; letter-spacing: -0.03em; color: var(--text-0);`
- **Lede paragraph** — `var(--serif); font-weight: 300; font-size: clamp(18px, 2.6vw, 22px); color: var(--text-1);`
- **Body paragraph** — `var(--sans); font-size: 15px; line-height: 1.7; color: var(--text-2);`
- **Section tag (the "EMBASSY · CHICAGO" line)** — `var(--mono); font-size: 10px; font-weight: 300; letter-spacing: 4px; text-transform: uppercase; color: var(--text-3);` — with a trailing 1px hairline rule that fills the rest of the row in `--ground-4`.
- **Card heading (faction name etc.)** — `var(--serif); font-size: 20px; font-weight: 500; color: var(--text-0);`
- **Motto / flavor** — `var(--serif); font-style: italic; font-size: 14px; color: var(--text-2); line-height: 1.5;`
- **Numeric value (standing, costs, parcel count)** — `var(--mono); font-variant-numeric: tabular-nums; color: var(--text-1) or var(--s-gold);`
- **Numeric label** — `var(--mono); font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: var(--text-3);`

### 7.2 Mobile reductions

At ≤520px, section-tag letter-spacing drops 4px → 3px, margin-bottom 64px → 40px. Brand-toggle bar shrinks 46px → 37px, font 10px → 8px.

---

## 8. Layout & Structure

### 8.1 Page chrome

- **Fixed top nav** (`BrandToggle`): 46px tall, `background: var(--ground-1); border-bottom: 1px solid var(--ground-4);`. Left side: two brand pills ("Onion DAO" / "Null City") — the active one has `background: var(--ground-0)` and a 2px `--s-gold` bottom border. Right side: nav links + a "Sponsors" dropdown + "Apply" / "Login" buttons (login color = `var(--s-blue)`).
- **Main column** is centered with `max-width: 720px` for prose pages, `max-width: 1100px` for grid pages, padded `64–96px top, 32px sides`.

### 8.2 Spacing rhythm

There is a strong *vertical breathing* rhythm — long gaps (48–96px) between major sections, tight gaps (12–16px) within cards. Headings hold a lot of white space above and below them. The page should feel like a printed program, not a scroll feed.

### 8.3 Cards (faction tile etc.)

```
background: var(--ground-1);
border: 1px solid var(--ground-3);
border-left: 3px solid var(--accent);   /* the faction color */
padding: 24px;
transition: border-color 0.2s, background 0.2s;
```

Hover: `background: var(--ground-2); border-color: var(--ground-4);` (keep the colored left border at full strength).

Grid: `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;`.

### 8.4 Links

`color: var(--s-gold); text-decoration: none; border-bottom: 1px solid rgba(228,184,64,0.35);` — on hover, border solidifies to full gold. *Avoid underline-by-default and avoid blue links* (except the explicit login chip).

### 8.5 Selection

`::selection { background: rgba(228,184,64,.22); color: var(--text-0); }` in dark; `rgba(61,148,196,.18)` in light.

---

## 9. Signature Visual Motifs

These are the things that make Null City *feel* like Null City. New designs should use them rather than reach for generic SaaS chrome.

### 9.1 Shard Line — a horizontal stained-glass bar

A thin row of 8 colored bars (one per shard color), separated by 1px grout, sitting tight inside a 1px grout frame. Three variants:

- **default** — 5px tall, opacity 0.75. Used as section dividers.
- **`heavy`** — 8px tall, 2px gap, opacity 0.85. Used as page-level frames.
- **`breath`** — 3px tall, opacity 0.4. Used to softly close a page, "the city is still breathing."

Always render all 8 colors in the same order: blue, green, gold, rose, teal, amber, mauve, bone.

### 9.2 Skyline SVG — Chicago in silhouette

A line-art Chicago skyline (with the John Hancock-style X-bracing on the tallest building) drawn as a single filled path. Two orientations (`portrait` viewBox `0 0 380 96`, `landscape` viewBox `0 0 370 80`) and two variants (`dark` = chalk fill on void, `light` = ink fill on parchment). It sits behind the page title at low opacity (~0.28 dark, ~0.17 light) — a quiet horizon line.

### 9.3 Hero Voronoi Shards

A drifting voronoi tessellation of 22-ish polygons (more on widescreen), each filled with one of the 8 shard colors at low alpha, distributed across three depth planes:

- `deep` — `scale(0.78); blur(1px) brightness(0.7); opacity 0.55; z 1`
- `middle` — no transform; opacity 1; z 2
- `near` — `scale(1.18); drop-shadow(0 4px 12px rgba(0,0,0,.4)); opacity 0.95; z 3`

They wander slowly toward random nearby targets (drift speed 0.36, wander radius 0.105) and resample when they arrive. Used as an ambient hero background. The optional "Onion DAO" variant tints them over a real Chicago skyline photograph at 6% overlay opacity, using a heavily desaturated palette.

### 9.4 Stained-glass canvas

A canvas-rendered voronoi mosaic that *lights up* from two slowly-moving virtual light sources. Each polygon's brightness and alpha are functions of distance to the nearest light, so the panel appears to be lit from behind by a flickering candle. Used in: avatar/profile cards, achievement detail modals, anywhere we want to gesture at "reverence."

Center reserves a `photoZone` rectangle for an avatar/monogram. Edges fade to ground via a long gradient.

### 9.5 Emotion presets

Faction reps and residents have an *emotion* that drives the voronoi animation: `stillness` (frozen, neutral, bone accent), `reverie` (gold + amber, slow swing), `unease` (mauve + blue, faster), `anguish` (rose + mauve, fast), `fury` (rose + amber, fastest). Each preset defines `driftSpeed`, `wanderRadius`, `overlayOpacity`, `shardSwing`, `swingPeriod`, `palette`, and `accent`. Use them to make a resident's profile feel emotionally distinct without writing a single word.

### 9.6 The Wall

A public 50×50 grid display showing every parcel as a 1.8%×1.8% square positioned at its (x, y), filled in its faction color with a soft `box-shadow: 0 0 4px rgba(237,232,224,0.06)` chalk-glow. Locksmiths are solid black with a reddish glow. A `Territory` leaderboard floats top-right with the faction swatches and parcel counts. A bottom ticker (3.5rem tall) scrolls live events:

- 🥚 `--s-green` — births
- 💀 `--s-rose` — deaths
- 🏆 `--s-gold` — achievements

The ticker scrolls 60s linear infinite. When empty: *"… the city is quiet for now …"*

---

## 10. Voice & Copy

The product talks like a kindly but slightly disquieting **embassy clerk**. It uses:

- Em-dashes and ellipses generously.
- Lowercase liturgical phrases ("the city flaked off a tiny piece of itself when you arrived").
- Death and birth as plain events, never euphemized.
- Mottos that are slogans, not slogans-for-engagement ("Nothing happened until everyone agrees it happened.").
- "You" in second person, always — the visitor is being addressed *by the city*.

It does **not** use:

- Marketing exhortation ("Sign up now!", "Get started!").
- Emoji in body copy (emoji are reserved for the ticker only).
- Web3-bro affect.
- The words "platform," "ecosystem," "experience," or "journey."

When in doubt: *fewer words, lower in the page, in italics, in serif*.

---

## 11. Surfaces & Routes

| Route | Audience | Vibe |
|---|---|---|
| `/` | Unauthed visitor | Gate — single column, skyline behind title, breath shard-line. *"You are not currently a credentialed guest at the embassy."* |
| `/dashboard` | Authed visitor | Four faction cards in a grid; standing & motto on each. |
| `/dashboard/residents/:id` | Authed visitor | Resident profile with stained-glass avatar + chat (coming). |
| `/dashboard/achievements` | Authed visitor | Recipe progress + redeem buttons (coming). |
| `/staff` | Admin | Spartan ops surface; QR scan + print-job queue. |
| `/wall` | Public big screen | 50×50 parcel grid + leaderboard + scrolling ticker. Black background, faint chalk grid. |
| `/library` | Public | The Library of Souls — list of deceased residents with epitaphs. |

The visitor surface is the design priority. Staff and wall surfaces share tokens but optimize for readability at distance / under fluorescent light.

---

## 12. Components Already In The Codebase

(Locations under `webapp/src/lib/components/` — useful as reference designs.)

- `SkylineSvg.svelte` — the Chicago horizon line.
- `ShardLine.svelte` — the 8-color divider, with `heavy` / `breath` variants.
- `SectionTag.svelte` — the spaced-out uppercase mono label with trailing hairline.
- `BrandToggle.svelte` — the fixed top nav with brand pills.
- `HeroShards.svelte` — the drifting voronoi background.
- `StainedGlassCanvas.svelte` — the lit-glass canvas for avatars.
- `ShardBadge.svelte` — the visitor's shard-balance chip.
- `UserQrBadge.svelte` — the QR badge staff scans at workshops.
- `SharableCard.svelte` + `ShareBar.svelte` — outbound-shareable card (OG image style).
- `PullQuote.svelte` — large serif quote block for marketing pages.

---

## 13. Iconography & Imagery

- **No icon set.** Where an icon would normally go, prefer a single emoji (only on the wall ticker) or a one-letter monogram in the avatar's photo zone, set in Outfit 900 at 10% alpha.
- **3D-printed lanyard achievements** are the primary "merch" — every achievement detail page should hint at the physical token without rendering a photoreal model. A small isometric SVG or a stained-glass medallion in `StainedGlassCanvas` is enough.
- **Photography** (the Chicago skyline asset) is used *only* on the Onion DAO light surface, heavily desaturated, beneath the voronoi.

---

## 14. Motion

- **Slow.** Default ease is `0.2s` for hovers, `0.4s` for brand-theme transitions. Page-arrival uses `fadeUp` keyframe (`opacity 0 → 1; translateY 14px → 0`).
- **Continuous.** Voronoi shards drift, stained-glass canvas lights pulse, ticker scrolls. The page is alive at idle, but at low energy.
- **Never bouncy.** No `cubic-bezier` overshoot. No spring physics. No big modal animations.

---

## 15. What to Take Away

A page that fits Null City has, in roughly this order from top to bottom:

1. A 46px top nav with two brand pills.
2. A lot of vertical air.
3. A small mono section tag with a trailing hairline.
4. A long serif title at weight 300, slightly negative tracking.
5. An italic serif lede in `--text-1`.
6. A short DM Sans paragraph in `--text-2`.
7. Faction-colored cards or a content grid, separated by the shard-line.
8. A breath shard-line at the bottom — the city exhaling.

Above all: **the page should feel like a printed program from a place that already exists.** Not a launch page.
