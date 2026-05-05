# Rick Rattle — Gaming Hub

Single-page gaming hub deployable to Vercel. Static HTML + serverless API proxies to bypass CORS restrictions on Steam, Reddit, RSS, and Imgur.

## Structure

```
website tick/
├── index.html              # main app (SPA with History API routing)
├── vercel.json             # rewrites + headers for clean URLs
├── api/
│   ├── steam-news.js       # /api/steam-news?appid=XXXX
│   ├── reddit.js           # /api/reddit?subreddit=XXX
│   ├── rss.js              # /api/rss?url=ENCODED_URL
│   └── imgur-album.js      # /api/imgur-album?id=XXX
├── logo.png
└── Chanel Points/          # local card images (not used in prod — Imgur replaces these)
```

## Local dev

```bash
npm i -g vercel
vercel dev
```

This boots the static site + serverless functions at `http://localhost:3000`.

## Deploy to Vercel

```bash
vercel
```

Or push the folder to GitHub and connect via the Vercel dashboard.

## Environment variables (Vercel project settings)

| Name | Required | Used by | Where to get it |
|---|---|---|---|
| `IMGUR_CLIENT_ID` | Yes (for cards) | `/api/imgur-album` | https://api.imgur.com/oauth2/addclient (anonymous, free) |

No other env vars needed. Steam, Reddit, RSS proxies don't require auth.

## Routes (SEO-friendly clean URLs)

- `/` — Home
- `/news` — News index
- `/news/:slug` — Article detail OR game-specific news page
- `/tips` — Tips index
- `/tips/:slug` — Game-specific tips page
- `/rick` — Channel page (creator)

All routes serve `index.html` and the SPA renders the appropriate view. Vercel pre-renders meta tags so Google/social bots see correct titles/descriptions.

## Adding content

- **Games**: edit `const games = [...]` in index.html
- **Articles**: edit `const articles = [...]`
- **Guides**: edit `const guides = [...]`
- **Tier lists**: edit `const tierLists = [...]`
- **RSS feeds**: edit `const platformFeeds = [...]`
