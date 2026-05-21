# Rick Rattle — Content Rules

Quick reference for adding/editing content on rickrattle.com. Read before any content change.

---

## 1. Slug / URL rule (future content only)

- **Never use abbreviations.** Prefer the full canonical name.
  - Good: `slug:'rocket-league-season-15-meta'`
  - Bad: `slug:'rl-s15-meta'`
  - Good: `slug:'kingdom-come-deliverance-2-patch-1-3'`
  - Bad: `slug:'kcd2-patch-1-3'`
- **Lowercase, hyphen-separated, ASCII only.** No spaces, no diacritics, no underscores.
- **Game segment** must match the canonical game slug from the `games` array in `index.html`.
- **Slugs are permanent.** Once published, never rename — Google has indexed it. Typos get a sitemap entry or 301, not a rename.
- **Legacy slugs stay as they are.** Do NOT retroactively rename old entries (e.g. `kcd2-*` stays).

## 2. Editorial label (`prefix`) — identity, not SEO

Pick one when relevant:

- `rattle-take` — Rick Rattle Take (personal/opinion angle)
- `meta-watch` — Meta Watch (what shifts the meta)
- `worth-watching` — Worth Watching (trends to track)
- `quick-read` — Quick Read (2-3 min, no fluff)
- `stream-test` — Stream Test Candidate (will Rick try it live)
- `community-pulse` — Community Pulse (what players are saying)

Where it shows: **below the breadcrumb** on the article page. It is **identity**, not a category — it never appears in the URL, canonical, breadcrumb trail, or structured data.

## 3. Data-first rule (layout / homepage)

Do **not** make any of the following until Search Console data is in:

- Redesign the homepage
- Move featured sections
- Restructure the mobile layout
- Create mixed-content rows (news + tips + tier lists in one row)
- Redesign the welcome section

Layout decisions wait for real traffic data — what users actually click, where bounce happens, which sections convert.

## 4. SEO domain rule

- Canonical origin is **`https://rickrattle.com`** (apex, no www).
- Never reference `rickrattle.tv` anywhere — domain is dead.
- Sitemap, robots, structured data, OG tags must all point to the apex.
- Hardcoded as `CANONICAL_ORIGIN` constant in `index.html` — don't read `location.origin` for canonicals.

## 5. Stability invariants (don't break)

- Homepage must never depend on the news fetch. Cached payload renders first, fresh fetches in background.
- Twitch embed mounts once per session (singleton). Don't recreate the iframe on re-render — moves it via `appendChild`.
- Reddit/RSS calls go through `fetchJsonApi` (4s timeout + 1 silent retry + SWR cache).
- `Promise.allSettled` for parallel fetches — never `Promise.all` (one failure must not block the rest).
