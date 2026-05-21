// Vercel serverless function — generates sitemap.xml dynamically.
// Canonical host hardcoded so URLs are consistent regardless of how the sitemap is reached
// (works the same via /sitemap.xml OR /api/sitemap.xml, on rickrattle.com or vercel preview).
// Search Console already knows /api/sitemap.xml — keep that path live alongside the canonical.

const CANONICAL_HOST = 'https://rickrattle.com';

const STATIC_PATHS = ['/', '/news', '/tips', '/rick'];

const GAME_SLUGS = [
  'kcd2','rocket-league','arc-raiders','minecraft','grounded-2','chivalry-2','it-takes-two','split-fiction','the-finals','rdr2',
  'cs2','eldenring','cyberpunk2077','baldursgate3','gta-vi','helldivers2','lol','valorant','palworld','monster-hunter-wilds',
  'apex','fortnite','overwatch2','crimson-desert','diablo-iv','gta-v','marathon','marvel-rivals','re-requiem','saros','windrose',
  'tekken-8','callofduty','destiny-2','forza-horizon-6'
];

const MANUAL_ARTICLE_SLUGS = [
  'kcd2-patch-1-3-horse-overhaul','rl-season-evolution-recap','finals-season-3-weapons-leaked',
  'arc-raiders-tech-test-results','minecraft-tricky-trials-recap','chivalry-2-content-roadmap',
  'gaming-handheld-market-2026','esports-2026-prize-pool-record','subscription-fatigue-gaming','crossplay-state-2026'
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
  {game:'destiny-2', slug:'destiny2-class-tier-list'}
];

function urlEntry(loc, priority='0.7', changefreq='weekly') {
  return `  <url>
    <loc>${CANONICAL_HOST}${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export default function handler(req, res) {
  const urls = [
    ...STATIC_PATHS.map(p => urlEntry(p, p === '/' ? '1.0' : '0.9', 'daily')),
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
