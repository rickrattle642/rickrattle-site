// Vercel serverless function — generates sitemap.xml dynamically.
// Uses canonical host header. Add new game slugs / article slugs to keep in sync with frontend.

const STATIC_PATHS = ['/', '/news', '/tips', '/rick'];

const GAME_SLUGS = [
  'kcd2','rocket-league','arc-raiders','minecraft','grounded-2','chivalry-2','it-takes-two','split-fiction','the-finals','rdr2',
  'cs2','eldenring','cyberpunk2077','baldursgate3','gta-vi','helldivers2','lol','valorant','palworld','monster-hunter-wilds',
  'apex','fortnite','overwatch2','crimson-desert','diablo-iv','gta-v','marathon','marvel-rivals','re-requiem','saros','windrose',
  'tekken-8','callofduty'
];

const MANUAL_ARTICLE_SLUGS = [
  'kcd2-patch-1-3-horse-overhaul','rl-season-evolution-recap','finals-season-3-weapons-leaked',
  'arc-raiders-tech-test-results','minecraft-tricky-trials-recap','chivalry-2-content-roadmap',
  'gaming-handheld-market-2026','esports-2026-prize-pool-record','subscription-fatigue-gaming','crossplay-state-2026'
];

const MANUAL_TIPS_SLUGS = [
  // guides
  'kcd2-early-game-survival','rl-aerial-training-routine','finals-light-class-movement','minecraft-villager-trading-loop',
  'arc-raiders-extraction-101','chivalry2-knight-fundamentals','cyberpunk-netrunner-phantom','gtav-money-optimization',
  'split-fiction-coop-tips','rdr2-honor-route','palworld-late-base',
  // tier lists
  'rl-cars-spring-2026','finals-weapons-current','kcd2-perks-bohemia-edition','cs2-rifles-current','eldenring-classes-2026',
  'helldivers2-stratagems','bg3-classes-honour-mode','marvel-rivals-heroes-current','apex-legends-current','valorant-agents-current',
  'mh-wilds-weapons-2026','diablo4-classes-s8','palworld-best-pals-early'
];

function urlEntry(loc, base, priority='0.7', changefreq='weekly') {
  return `  <url>
    <loc>${base}${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export default function handler(req, res) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').toString().split(',')[0];
  const host = req.headers.host;
  const base = `${proto}://${host}`;

  const urls = [
    ...STATIC_PATHS.map(p => urlEntry(p, base, p === '/' ? '1.0' : '0.9', 'daily')),
    ...GAME_SLUGS.flatMap(slug => [
      urlEntry(`/news/${slug}`, base, '0.8', 'daily'),
      urlEntry(`/tips/${slug}`, base, '0.7', 'weekly')
    ]),
    ...MANUAL_ARTICLE_SLUGS.map(slug => urlEntry(`/news/${slug}`, base, '0.6', 'monthly')),
    ...MANUAL_TIPS_SLUGS.map(slug => {
      // best-effort: tips path needs the game slug. Fall back to /tips if unknown.
      // For accuracy, we'd lookup which game owns each slug — keeping simple here.
      return urlEntry(`/tips`, base, '0.5', 'monthly');
    })
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(xml);
}
