// Vercel serverless function — generates sitemap.xml dynamically.
// Canonical host hardcoded so URLs are consistent regardless of how the sitemap is reached
// (works the same via /sitemap.xml OR /api/sitemap.xml, on rickrattle.com or vercel preview).
// Search Console already knows /api/sitemap.xml — keep that path live alongside the canonical.

const CANONICAL_HOST = 'https://rickrattle.com';

const STATIC_PATHS = ['/', '/news', '/tips', '/rick', '/about', '/contact', '/terms', '/privacy-policy', '/cookie-policy'];

const GAME_SLUGS = [
  'kcd2','rocket-league','arc-raiders','minecraft','grounded-2','chivalry-2','it-takes-two','split-fiction','the-finals','rdr2',
  'cs2','eldenring','cyberpunk2077','baldursgate3','gta-vi','helldivers2','lol','valorant','palworld','monster-hunter-wilds',
  'apex','fortnite','overwatch2','crimson-desert','diablo-iv','gta-v','marathon','marvel-rivals','re-requiem','saros','windrose',
  'tekken-8','callofduty','destiny-2','forza-horizon-6',
  'subnautica-2','wow','warzone','cod-bo7',
  // Phase 4 — community-requested catalogue additions
  'dota-2','007-first-light','escape-from-tarkov'
];

const MANUAL_ARTICLE_SLUGS = [
  'kcd2-patch-1-3-horse-overhaul','rl-season-evolution-recap','finals-season-3-weapons-leaked',
  'arc-raiders-tech-test-results','minecraft-tricky-trials-recap','chivalry-2-content-roadmap',
  'gaming-handheld-market-2026','esports-2026-prize-pool-record','subscription-fatigue-gaming','crossplay-state-2026',
  // Phase 3B editorial
  'goty-2026-race-wide-open','hidden-gems-2026-played-by-nobody','best-vintage-games-2026',
  'games-aging-surprisingly-well','forgotten-masterpieces-7-underrated','future-contenders-2027-watchlist',
  // Phase 3F platforms
  'ps-plus-2026-monthly-highlights','xbox-game-pass-2026-roadmap'
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
  {game:'escape-from-tarkov', slug:'eft-money-making-guide'}
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
  '/rick':            {priority:'0.9', changefreq:'weekly'},
  '/about':           {priority:'0.6', changefreq:'monthly'},
  '/contact':         {priority:'0.5', changefreq:'monthly'},
  '/terms':           {priority:'0.3', changefreq:'yearly'},
  '/privacy-policy':  {priority:'0.3', changefreq:'yearly'},
  '/cookie-policy':   {priority:'0.3', changefreq:'yearly'}
};

export default function handler(req, res) {
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
