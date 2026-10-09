// Vercel serverless function — generates sitemap.xml dynamically.
// Canonical host hardcoded so URLs are consistent regardless of how the sitemap is reached
// (works the same via /sitemap.xml OR /api/sitemap.xml, on rickrattle.com or vercel preview).
// Search Console already knows /api/sitemap.xml — keep that path live alongside the canonical.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CANONICAL_HOST = 'https://rickrattle.com';

const STATIC_PATHS = ['/', '/news', '/tips', '/mobile', '/rick', '/mediakit', '/partners', '/hall-of-fame', '/about', '/contact', '/terms', '/privacy-policy', '/cookie-policy'];

const GAME_SLUGS = [
  'kcd2','rocket-league','arc-raiders','minecraft','grounded-2','chivalry-2','it-takes-two','split-fiction','the-finals','rdr2',
  'cs2','eldenring','cyberpunk2077','baldursgate3','gta-vi','helldivers2','lol','valorant','palworld','monster-hunter-wilds',
  'apex','fortnite','overwatch2','crimson-desert','diablo-iv','gta-v','marathon','marvel-rivals','re-requiem','saros','windrose',
  'tekken-8','callofduty','destiny-2','forza-horizon-6',
  'subnautica-2','wow','warzone','cod-bo7',
  // Phase 4 — community-requested catalogue additions
  'dota-2','007-first-light','escape-from-tarkov',
  // Phase 6 — Paralives Early Access launch (May 25, 2026)
  'paralives',
  // Phase 8 — Path of Exile 2
  'path-of-exile-2',
  // Phase 9 — Halo: Campaign Evolved launch (July 28, 2026)
  'halo-campaign-evolved',
  // Phase 11 — Marvel's Wolverine launch (September 15, 2026)
  'marvels-wolverine',
  // Phase 12 — Mobile section launch (September 29, 2026)
  'balatro-mobile','rainbow-six-mobile','honkai-star-rail','palworld-mobile','delta-force',
  // Phase 15 — Last War: Survival (September 29, 2026)
  'last-war-survival',
  // Phase 16 — Gears of War: E-Day (October 2, 2026)
  'gears-of-war-e-day'
];

const MANUAL_ARTICLE_SLUGS = [
  'kcd2-patch-1-3-horse-overhaul','rl-season-evolution-recap','finals-season-3-weapons-leaked',
  'arc-raiders-tech-test-results','minecraft-tricky-trials-recap','chivalry-2-content-roadmap',
  'gaming-handheld-market-2026','esports-2026-prize-pool-record','subscription-fatigue-gaming','crossplay-state-2026',
  // Phase 3B editorial
  'goty-2026-race-wide-open','hidden-gems-2026-played-by-nobody','best-vintage-games-2026',
  'games-aging-surprisingly-well','forgotten-masterpieces-7-underrated','future-contenders-2027-watchlist',
  // Phase 3F platforms
  'ps-plus-2026-monthly-highlights','xbox-game-pass-2026-roadmap',
  // Phase 6 — Paralives launch coverage
  'paralives-early-access-launch','paralives-post-launch-roadmap','paralives-bundles-and-collabs',
  // Phase 10 — GTA 6 Netflix gameplay reveal (August 27, 2026)
  'gta-6-gameplay-reveal-vice-city-detail','gta-6-netflix-trailer-every-reveal','gta-6-eating-sleeping-exercise-mechanics',
  'gta-6-netflix-extended-look-11-features','gta-6-vehicle-police-mechanics-details','gta-6-gameplay-details-rockstar-demo',
  'gta-6-gameplay-video-features-november-launch',
  // Phase 11 — Marvel's Wolverine launch coverage + Fortnite (September 17, 2026)
  'marvels-wolverine-best-xp-farm-level-up-fast','fortnite-pixel-polli-free-skin-sprite-mastery',
  'marvels-wolverine-secret-ending-repressed-memories','marvels-wolverine-tips-to-know-before-you-play',
  'marvels-wolverine-best-techniques-adaptations-unlock-first',
  'marvels-wolverine-advanced-tips-xp-economy-shortcuts','marvels-wolverine-mission-list-walkthrough-hub',
  // Phase 14 — Fortnitemares 2026 coverage (September 29, 2026)
  'fortnite-fortnitemares-2026-season-4-overview','fortnite-chapter-8-season-4-end-date-leaks',
  // Phase 16 — Gears of War: E-Day review round-up (October 2, 2026)
  'gears-of-war-e-day-review-round-up-what-critics-say'
];

const MANUAL_TIPS_SLUGS = [
  // guides
  {game:'kcd2', slug:'kcd2-early-game-survival'},
  {game:'rocket-league', slug:'rl-aerial-training-routine'},
  {game:'the-finals', slug:'finals-light-class-movement'},
  {game:'minecraft', slug:'minecraft-villager-trading-loop'},
  {game:'arc-raiders', slug:'arc-raiders-extraction-101'},
  {game:'arc-raiders', slug:'arc-raiders-extraction-routing'},
  {game:'arc-raiders', slug:'arc-raiders-pvp-loadout'},
  {game:'chivalry-2', slug:'chivalry2-knight-fundamentals'},
  {game:'cyberpunk2077', slug:'cyberpunk-netrunner-phantom'},
  {game:'gta-v', slug:'gtav-money-optimization'},
  {game:'split-fiction', slug:'split-fiction-coop-tips'},
  {game:'rdr2', slug:'rdr2-honor-route'},
  {game:'palworld', slug:'palworld-late-base'},
  {game:'minecraft', slug:'minecraft-first-night-survival'},
  {game:'minecraft', slug:'minecraft-trial-chambers-loot-route'},
  {game:'re-requiem', slug:'re-requiem-best-weapons-grace'},
  {game:'re-requiem', slug:'re-requiem-best-weapons-leon'},
  {game:'re-requiem', slug:'re-requiem-ammo-economy'},
  {game:'re-requiem', slug:'re-requiem-no-damage-run'},
  {game:'crimson-desert', slug:'crimson-desert-combat-stances'},
  {game:'crimson-desert', slug:'crimson-desert-pvp-builds'},
  {game:'diablo-iv', slug:'diablo4-leveling-1-70'},
  {game:'diablo-iv', slug:'diablo4-pit-pushing-meta'},
  {game:'diablo-iv', slug:'diablo4-auradin-paladin-build'},
  {game:'diablo-iv', slug:'diablo4-warlock-intro'},
  {game:'monster-hunter-wilds', slug:'mh-wilds-artian-weapons-tu4'},
  {game:'destiny-2', slug:'destiny2-classes-overview'},
  {game:'destiny-2', slug:'destiny2-edge-of-fate-beginner'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-tracker'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-easy-money'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-credit-skill-point-farm'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-best-cars-race-type'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-beginner-tips-tricks'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-progression-pathways'},
  {game:'subnautica-2', slug:'subnautica-2-first-hour'},
  {game:'subnautica-2', slug:'subnautica-2-things-to-do-first'},
  {game:'wow', slug:'wow-new-player-class-path'},
  {game:'wow', slug:'wow-dps-tier-mythic-plus'},
  {game:'warzone', slug:'warzone-current-meta-loadouts'},
  {game:'cod-bo7', slug:'cod-bo7-launch-meta'},
  {game:'tekken-8', slug:'tekken-8-mod-discovery'},
  {game:'fortnite', slug:'fortnite-weapons-tier-chapter-7'},
  // tier lists
  {game:'rocket-league', slug:'rl-cars-spring-2026'},
  {game:'the-finals', slug:'finals-weapons-current'},
  {game:'kcd2', slug:'kcd2-perks-bohemia-edition'},
  {game:'cs2', slug:'cs2-rifles-current'},
  {game:'eldenring', slug:'eldenring-classes-2026'},
  {game:'helldivers2', slug:'helldivers2-stratagems'},
  {game:'baldursgate3', slug:'bg3-classes-honour-mode'},
  {game:'marvel-rivals', slug:'marvel-rivals-heroes-current'},
  {game:'apex', slug:'apex-legends-current'},
  {game:'valorant', slug:'valorant-agents-current'},
  {game:'monster-hunter-wilds', slug:'mh-wilds-weapons-tu4'},
  {game:'diablo-iv', slug:'diablo4-classes-tier-s13'},
  {game:'diablo-iv', slug:'diablo4-leveling-tier-s13'},
  {game:'diablo-iv', slug:'diablo4-speed-farm-tier-s13'},
  {game:'palworld', slug:'palworld-best-pals-early'},
  {game:'minecraft', slug:'minecraft-enchantments-tier'},
  {game:'arc-raiders', slug:'arc-raiders-pve-weapon-tier-list'},
  {game:'arc-raiders', slug:'arc-raiders-pvp-weapon-tier-list'},
  {game:'crimson-desert', slug:'crimson-desert-classes-tier'},
  {game:'re-requiem', slug:'re-requiem-weapons-tier'},
  {game:'destiny-2', slug:'destiny2-exotic-weapons-pve'},
  {game:'destiny-2', slug:'destiny2-class-tier-list'},
  // Phase 4 — added FH6 guides
  {game:'forza-horizon-6', slug:'forza-horizon-6-complete-walkthrough'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-tips-and-tricks'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-barn-finds'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-car-list'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-easy-car-unlock'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-afk-xp-grind'},
  // Phase 4 — Dota 2
  {game:'dota-2', slug:'dota-2-beginner-fundamentals'},
  {game:'dota-2', slug:'dota-2-hero-guides-hub'},
  {game:'dota-2', slug:'dota-2-stratz-hero-builds'},
  // Phase 4 — LoL
  {game:'lol', slug:'lol-alistar-comprehensive-guide'},
  {game:'lol', slug:'lol-smolder-guide'},
  {game:'lol', slug:'lol-kindred-jungle-guide'},
  {game:'lol', slug:'lol-pyke-echoes-from-the-deep'},
  {game:'lol', slug:'lol-aatrox-grandmaster-guide'},
  {game:'lol', slug:'lol-fiora-handbook'},
  {game:'lol', slug:'lol-probuilds-meta'},
  {game:'lol', slug:'lol-champion-tier-list'},
  // Phase 4 — 007 First Light
  {game:'007-first-light', slug:'007-first-light-essential-tips'},
  {game:'007-first-light', slug:'007-first-light-chapters-progress'},
  {game:'007-first-light', slug:'007-first-light-beginner-guide'},
  {game:'007-first-light', slug:'007-first-light-walkthrough'},
  {game:'007-first-light', slug:'007-first-light-best-weapons'},
  {game:'007-first-light', slug:'007-first-light-stealth-tips'},
  {game:'007-first-light', slug:'007-first-light-gadget-usage'},
  // Phase 4 — Escape from Tarkov
  {game:'escape-from-tarkov', slug:'eft-the-guide-quest'},
  {game:'escape-from-tarkov', slug:'eft-the-guide-requirements'},
  {game:'escape-from-tarkov', slug:'eft-best-pc-settings'},
  {game:'escape-from-tarkov', slug:'eft-weapon-choice-guide'},
  {game:'escape-from-tarkov', slug:'eft-achievements-guide'},
  {game:'escape-from-tarkov', slug:'eft-money-making-guide'},
  // Phase 5 — SEO-targeted guides (queries already getting GSC impressions)
  {game:'forza-horizon-6', slug:'forza-horizon-6-faq'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-colossus-unlock-guide'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-raku-raku-xp'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-seasonal-objective-cars'},
  {game:'arc-raiders', slug:'arc-raiders-ttk-weapon-tier'},
  // Phase 6 — Paralives Early Access guides
  {game:'paralives', slug:'paralives-things-to-do-first'},
  {game:'paralives', slug:'paralives-paramaker-guide'},
  {game:'paralives', slug:'paralives-cheats-console-commands'},
  {game:'paralives', slug:'paralives-roadmap'},
  // Phase 7 — High-density SEO guides
  {game:'007-first-light', slug:'007-first-light-best-gadgets-ranked'},
  {game:'arc-raiders', slug:'arc-raiders-best-settings-fps-visibility'},
  {game:'arc-raiders', slug:'arc-raiders-best-solo-build'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-level-up-fast-xp'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-super-wheelspins'},
  // Phase 8 — SEO batch June 2026 (FH6 Spinball Wizard + Skill Points + PoE2 + CS2 x3)
  {game:'forza-horizon-6', slug:'forza-horizon-6-spinball-wizard-cars'},
  {game:'forza-horizon-6', slug:'forza-horizon-6-farm-skill-points'},
  {game:'path-of-exile-2',  slug:'path-of-exile-2-best-builds-hub'},
  {game:'cs2',              slug:'cs2-best-settings-options'},
  {game:'cs2',              slug:'cs2-fps-console-commands'},
  {game:'cs2',              slug:'cs2-pro-settings-gear-list'},
  // Phase 9 — July 2026 batch: Warzone meta refresh + Halo Campaign Evolved launch + GTA Online
  {game:'warzone',              slug:'warzone-current-meta-tier-list'},
  {game:'warzone',              slug:'warzone-best-guns-current-meta'},
  {game:'warzone',              slug:'warzone-best-loadouts-current'},
  {game:'halo-campaign-evolved', slug:'halo-campaign-evolved-walkthrough'},
  {game:'halo-campaign-evolved', slug:'halo-campaign-evolved-all-skulls'},
  {game:'halo-campaign-evolved', slug:'halo-campaign-evolved-all-terminals'},
  {game:'gta-v',                slug:'gta-online-weekly-updates-tracker'},
  // Phase 12 — Mobile section launch (September 29, 2026)
  {game:'balatro-mobile', slug:'balatro-mobile-early-game-guide'},
  {game:'balatro-mobile', slug:'balatro-mobile-synergy-combos-guide'},
  {game:'balatro-mobile', slug:'balatro-mobile-unlock-secret-jokers-guide'},
  {game:'delta-force',    slug:'delta-force-mobile-fps-lag-settings-guide'},
  {game:'delta-force',    slug:'delta-force-mobile-best-weapons-meta-guide'},
  {game:'delta-force',    slug:'delta-force-mobile-sensitivity-hud-guide'},
  // Phase 13 — Mobile section batch 2 (September 29, 2026)
  {game:'rainbow-six-mobile', slug:'r6-mobile-sensitivity-hud-settings-guide'},
  {game:'rainbow-six-mobile', slug:'r6-mobile-best-operators-guide'},
  {game:'rainbow-six-mobile', slug:'r6-mobile-connection-errors-lag-fix-guide'},
  {game:'palworld-mobile',    slug:'palworld-mobile-vs-online-release-date-guide'},
  {game:'palworld-mobile',    slug:'palworld-mobile-requirements-apk-safety-guide'},
  {game:'palworld-mobile',    slug:'palworld-online-controls-mechanics-guide'},
  {game:'honkai-star-rail',   slug:'honkai-star-rail-tier-list-builds-guide'},
  {game:'honkai-star-rail',   slug:'honkai-star-rail-active-codes-guide'},
  {game:'honkai-star-rail',   slug:'honkai-star-rail-memory-of-chaos-simulated-universe-guide'},
  // Phase 14 — Fortnite, Grounded 2, It Takes Two, Warzone (September 29, 2026)
  {game:'fortnite',       slug:'fortnite-season-4-weapons-meta-guide'},
  {game:'grounded-2',     slug:'grounded-2-best-mutations-guide'},
  {game:'grounded-2',     slug:'grounded-2-queen-ant-boss-guide'},
  {game:'it-takes-two',   slug:'it-takes-two-friends-pass-crossplay-guide'},
  {game:'it-takes-two',   slug:'it-takes-two-minigames-achievements-guide'},
  {game:'warzone',        slug:'warzone-gunsmith-recoil-ttk-guide'},
  {game:'warzone',        slug:'warzone-audio-settings-footsteps-guide'},
  {game:'warzone',        slug:'warzone-connection-errors-crash-fix-guide'},
  // Phase 15 — Last War: Survival (September 29, 2026)
  {game:'last-war-survival', slug:'last-war-survival-f2p-beginner-guide'},
  {game:'last-war-survival', slug:'last-war-survival-tank-squad-meta-guide'},
  {game:'last-war-survival', slug:'last-war-survival-season-2-aircraft-meta-guide'},
  // Phase 16 — Gears of War: E-Day (October 2, 2026)
  {game:'gears-of-war-e-day', slug:'gears-of-war-e-day-walkthrough-all-acts-chapters'},
  {game:'gears-of-war-e-day', slug:'gears-of-war-e-day-collectibles-guide'},
  {game:'gears-of-war-e-day', slug:'gears-of-war-e-day-pc-graphics-settings-fps-guide'},
  {game:'gears-of-war-e-day', slug:'gears-of-war-e-day-horde-siege-guide'},
  {game:'gears-of-war-e-day', slug:'gears-of-war-e-day-hard-cases-weapon-mods-guide'}
];

function urlEntry(loc, priority='0.7', changefreq='weekly') {
  return `  <url>
    <loc>${CANONICAL_HOST}${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

// Per-path SEO weighting. Legal/about/contact get lower priority + monthly changefreq.
const STATIC_META = {
  '/':                {priority:'1.0', changefreq:'daily'},
  '/news':            {priority:'0.9', changefreq:'daily'},
  '/tips':            {priority:'0.9', changefreq:'daily'},
  '/mobile':          {priority:'0.7', changefreq:'weekly'},
  '/rick':            {priority:'0.9', changefreq:'weekly'},
  '/mediakit':        {priority:'0.7', changefreq:'monthly'},
  '/partners':        {priority:'0.6', changefreq:'monthly'},
  '/hall-of-fame':    {priority:'0.6', changefreq:'monthly'},
  '/about':           {priority:'0.6', changefreq:'monthly'},
  '/contact':         {priority:'0.5', changefreq:'monthly'},
  '/terms':           {priority:'0.3', changefreq:'yearly'},
  '/privacy-policy':  {priority:'0.3', changefreq:'yearly'},
  '/cookie-policy':   {priority:'0.3', changefreq:'yearly'}
};

export default function handler(req, res) {
  // SPA pages share this function (Hobby plan: max 12 functions) — vercel.json rewrites
  // every site route to /api/sitemap.xml?p=<path>. No `p` => the sitemap itself.
  if (req.query && typeof req.query.p === 'string') return pageHandler(req, res);
  const urls = [
    ...STATIC_PATHS.map(p => {
      const m = STATIC_META[p] || {priority:'0.7', changefreq:'weekly'};
      return urlEntry(p, m.priority, m.changefreq);
    }),
    ...GAME_SLUGS.flatMap(slug => [
      urlEntry(`/news/${slug}`, '0.8', 'daily'),
      urlEntry(`/tips/${slug}`, '0.7', 'weekly')
    ]),
    ...MANUAL_ARTICLE_SLUGS.map(slug => urlEntry(`/news/${slug}`, '0.6', 'monthly')),
    ...MANUAL_TIPS_SLUGS.map(t => urlEntry(`/tips/${t.game}/${t.slug}`, '0.6', 'monthly'))
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(xml);
}


/* ====================================================================
// Vercel serverless function — serves index.html with per-URL <head> baked in.
//
// Why: the site is a client-side SPA. The static index.html has an empty canonical and
// the homepage title/description, so Google's first (non-JS) pass saw the SAME shell for
// every URL -> "Duplicate without user-selected canonical" + "Discovered, not indexed".
// This function reads index.html, pulls the real data (games/articles/guides/tierLists/
// SEO_COPY) out of the inline script, and rewrites title, description, canonical, robots,
// Open Graph/Twitter tags and JSON-LD for the requested path, plus a small crawlable
// HTML snapshot inside #view (replaced by the SPA as soon as JS runs).
//
// Routing: vercel.json rewrites every SPA route to /api/page?p=<original path>.
// The client-side updateSEO() still runs and produces the same values, so users see no change.


   ==================================================================== */
const ORIGIN = 'https://rickrattle.com';

const STATIC_VIEWS = ['rick', 'mediakit', 'partners', 'hall-of-fame', 'mobile', 'about', 'contact', 'terms', 'privacy-policy', 'cookie-policy'];
const STATIC_COPY_KEY = {
  'rick': 'rick', 'mediakit': 'mediakit', 'partners': 'partners', 'hall-of-fame': 'premiados', 'mobile': 'mobile',
  'about': 'about', 'contact': 'contact', 'terms': 'terms', 'privacy-policy': 'privacy', 'cookie-policy': 'cookies'
};

let CACHE = null;

function pageLoad() {
  if (CACHE) return CACHE;
  const file = path.join(process.cwd(), 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<script>\n?([\s\S]*?)<\/script>\s*<\/body>/);
  if (!m) throw new Error('inline script not found in index.html');
  let code = m[1];
  const cut = code.indexOf("applyTheme(localStorage.getItem('rr_theme')");
  if (cut < 0) throw new Error('INIT marker not found in index.html');
  code = code.slice(0, cut) +
    '\n;globalThis.__data={games,articles,guides,tierLists,SEO_COPY,tr,gameThumb};';

  const stub = () => new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()),
    apply: () => stub(), set: () => true, construct: () => stub()
  });
  const ctx = {
    console, setTimeout, clearTimeout, setInterval: () => 0, URL, URLSearchParams,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: stub(),
    location: { pathname: '/', search: '', hash: '', href: ORIGIN + '/', origin: ORIGIN },
    navigator: { language: 'en', userAgent: '' },
    history: { pushState() {}, replaceState() {} },
    fetch: () => Promise.reject(new Error('disabled')),
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    IntersectionObserver: class { observe() {} }
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'index-inline.js' });
  CACHE = { template: html, data: ctx.__data };
  return CACHE;
}

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function clip(s, n = 160) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 80)).replace(/[,;:.\-–—]+$/, '') + '…';
}

function abs(u) {
  if (!u) return ORIGIN + '/logo.png';
  if (/^https?:\/\//i.test(u)) return u;
  return ORIGIN + (u.startsWith('/') ? u : '/' + u);
}

// Build the SEO payload for a path. Mirrors updateSEO() in index.html (EN copy).
function resolve(rawPath, data) {
  const { games, articles, guides, tierLists, SEO_COPY, tr, gameThumb } = data;
  const copy = SEO_COPY.en;
  let clean = String(rawPath || '/').split('?')[0].replace(/^\/+|\/+$/g, '');
  const seg = clean ? clean.split('/') : [];
  const view = seg[0] || 'home';
  const a = seg[1] || null, b = seg[2] || null;

  const out = {
    status: 200, robots: 'index, follow',
    title: copy.siteTitle, desc: copy.siteDesc, img: '/logo.png',
    canonical: ORIGIN + '/', ogType: 'website', jsonld: null, snapshot: null
  };
  const bad = s => !s || /[{}$]/.test(s);
  const notFound = () => { out.status = 404; out.robots = 'noindex, nofollow'; out.title = 'Page not found — Rick Rattle'; out.desc = copy.siteDesc; out.canonical = ORIGIN + '/'; out.snapshot = null; return out; };
  const li = (href, label) => `<li><a href="${esc(href)}">${esc(label)}</a></li>`;
  const snap = (h1, p, links) => `<div class="page-head"><div><h1 class="page-title">${esc(h1)}</h1><p class="page-sub">${esc(p)}</p></div></div>` +
    (links && links.length ? `<ul>${links.join('')}</ul>` : '');
  const sortNew = (x, y) => String(y.date || '').localeCompare(String(x.date || ''));

  if (view === 'home') {
    out.canonical = ORIGIN + '/';
    out.snapshot = snap('Rick Rattle — Gaming Hub', out.desc, [...articles].sort(sortNew).slice(0, 12).map(x => li('/news/' + x.slug, tr(x.title))));
    return out;
  }

  if (view === 'news') {
    if (!a) {
      out.title = copy.newsHub.title; out.desc = copy.newsHub.desc; out.canonical = ORIGIN + '/news';
      out.snapshot = snap('News', out.desc, [...articles].sort(sortNew).map(x => li('/news/' + x.slug, tr(x.title))));
      return out;
    }
    if (bad(a) || b) return notFound();
    const art = articles.find(x => x.slug === a);
    const game = games.find(g => g.slug === a);
    out.canonical = ORIGIN + '/news/' + a;
    if (art) {
      out.title = `${tr(art.title)} — Rick Rattle`; out.desc = clip(tr(art.summary) || copy.siteDesc);
      out.img = art.thumb || gameThumb(art.game) || out.img; out.ogType = 'article';
      const g = games.find(x => x.slug === art.game);
      out.jsonld = {
        '@context': 'https://schema.org', '@type': 'NewsArticle', headline: tr(art.title).slice(0, 110),
        description: out.desc, image: [abs(out.img)], datePublished: art.date, dateModified: art.lastUpdated || art.date,
        mainEntityOfPage: out.canonical, author: { '@type': 'Person', name: 'Rick Rattle' },
        publisher: { '@type': 'Organization', name: 'Rick Rattle', logo: { '@type': 'ImageObject', url: ORIGIN + '/logo.png' } }
      };
      out.snapshot = snap(tr(art.title), tr(art.summary), g ? [li('/news/' + g.slug, g.name + ' — news'), li('/tips/' + g.slug, g.name + ' — tips & guides')] : []);
      return out;
    }
    if (game) {
      const m = copy.gameNews(game); out.title = m.title; out.desc = clip(m.desc); out.img = gameThumb(game.slug) || out.img;
      out.snapshot = snap(`${game.name} — News`, out.desc, articles.filter(x => x.game === game.slug).sort(sortNew).map(x => li('/news/' + x.slug, tr(x.title))));
      return out;
    }
    // Not in static data: could be an auto-fetched Steam/Reddit/RSS item (resolved client-side,
    // noindex + canonical to the source). Serve the shell as noindex so it never competes with us.
    out.robots = 'noindex, follow';
    return out;
  }

  if (view === 'tips') {
    if (!a) {
      out.title = copy.tipsHub.title; out.desc = copy.tipsHub.desc; out.canonical = ORIGIN + '/tips';
      out.snapshot = snap('Tips, Guides & Tier Lists', out.desc, games.map(g => li('/tips/' + g.slug, g.name)));
      return out;
    }
    if (bad(a) || (b && bad(b))) return notFound();
    const game = games.find(g => g.slug === a);
    if (!game) return notFound();
    if (!b) {
      const m = copy.gameTips(game); out.title = m.title; out.desc = clip(m.desc); out.img = gameThumb(game.slug) || out.img;
      out.canonical = ORIGIN + '/tips/' + a;
      const items = [...guides.filter(g => g.game === a), ...tierLists.filter(g => g.game === a)];
      out.snapshot = snap(`${game.name} — Tips, Guides & Tier Lists`, out.desc, items.map(x => li(`/tips/${a}/${x.slug}`, tr(x.title))));
      return out;
    }
    const item = guides.find(g => g.slug === b) || tierLists.find(g => g.slug === b);
    if (!item || item.game !== a) return notFound();
    out.canonical = `${ORIGIN}/tips/${a}/${b}`;
    out.title = `${tr(item.title)} — Rick Rattle`; out.desc = clip(tr(item.summary) || copy.gameTips(game).desc);
    out.img = gameThumb(game.slug) || out.img; out.ogType = 'article';
    out.jsonld = {
      '@context': 'https://schema.org', '@type': 'Article', headline: tr(item.title).slice(0, 110), description: out.desc,
      image: [abs(out.img)], datePublished: item.date, dateModified: item.lastUpdated || item.date, mainEntityOfPage: out.canonical,
      author: { '@type': 'Person', name: item.author || 'Rick Rattle' },
      publisher: { '@type': 'Organization', name: 'Rick Rattle', logo: { '@type': 'ImageObject', url: ORIGIN + '/logo.png' } }
    };
    out.snapshot = snap(tr(item.title), tr(item.summary), [li('/tips/' + a, game.name + ' — all guides'), li('/news/' + a, game.name + ' — news')]);
    return out;
  }

  if (STATIC_VIEWS.includes(view)) {
    const c = copy[STATIC_COPY_KEY[view]];
    if (c) { out.title = c.title; out.desc = clip(c.desc); }
    out.canonical = ORIGIN + '/' + view;
    out.snapshot = snap(String(out.title).replace(/ — Rick Rattle$/, ''), out.desc, []);
    return out;
  }

  return notFound();
}

function inject(template, o) {
  const img = abs(o.img);
  let h = template;
  const rep = (re, val) => { h = h.replace(re, () => val); };
  rep(/<title>[\s\S]*?<\/title>/, `<title>${esc(o.title)}</title>`);
  rep(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(o.desc)}">`);
  rep(/<meta name="robots" id="seoRobots" content="[^"]*">/, `<meta name="robots" id="seoRobots" content="${o.robots}">`);
  rep(/<link rel="canonical" id="seoCanonical" href="[^"]*">/, `<link rel="canonical" id="seoCanonical" href="${esc(o.canonical)}">`);
  rep(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${o.ogType}">`);
  rep(/(<meta property="og:title" id="seoOgTitle" content=")[^"]*(">)/, `$1${esc(o.title)}$2`);
  rep(/(<meta property="og:description" id="seoOgDesc" content=")[^"]*(">)/, `$1${esc(o.desc)}$2`);
  rep(/(<meta property="og:image" id="seoOgImage" content=")[^"]*(">)/, `$1${esc(img)}$2`);
  rep(/(<meta property="og:url" id="seoOgUrl" content=")[^"]*(">)/, `$1${esc(o.canonical)}$2`);
  rep(/(<meta name="twitter:title" id="seoTwitterTitle" content=")[^"]*(">)/, `$1${esc(o.title)}$2`);
  rep(/(<meta name="twitter:description" id="seoTwitterDesc" content=")[^"]*(">)/, `$1${esc(o.desc)}$2`);
  rep(/(<meta name="twitter:image" id="seoTwitterImage" content=")[^"]*(">)/, `$1${esc(img)}$2`);
  if (o.jsonld) {
    const json = JSON.stringify(o.jsonld).replace(/</g, '\\u003c');
    h = h.replace('</head>', () => `<script type="application/ld+json" id="pageJsonLd">${json}</script>\n</head>`);
  }
  if (o.snapshot) {
    h = h.replace('<div class="content" id="view"></div>', () => `<div class="content" id="view">${o.snapshot}</div>`);
  }
  return h;
}

function pageHandler(req, res) {
  try {
    const { template, data } = pageLoad();
    const p = (req.query && req.query.p) || '/';
    const o = resolve(p, data);
    const html = inject(template, o);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', o.status === 200
      ? 'public, s-maxage=3600, stale-while-revalidate=86400'
      : 'public, s-maxage=600');
    return res.status(o.status).send(html);
  } catch (e) {
    // Never take the site down because of SEO injection — fall back to the plain shell.
    console.error('[api/page] fallback to static shell:', e);
    try {
      const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      return res.status(200).send(html);
    } catch (e2) {
      return res.status(500).send('Internal error');
    }
  }
}

