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

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ORIGIN = 'https://rickrattle.com';

const STATIC_VIEWS = ['rick', 'mediakit', 'partners', 'hall-of-fame', 'mobile', 'about', 'contact', 'terms', 'privacy-policy', 'cookie-policy'];
const STATIC_COPY_KEY = {
  'rick': 'rick', 'mediakit': 'mediakit', 'partners': 'partners', 'hall-of-fame': 'premiados', 'mobile': 'mobile',
  'about': 'about', 'contact': 'contact', 'terms': 'terms', 'privacy-policy': 'privacy', 'cookie-policy': 'cookies'
};

let CACHE = null;

function load() {
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

export default function handler(req, res) {
  try {
    const { template, data } = load();
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

export { resolve, load, inject };
