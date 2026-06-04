// POST /api/barraca/seed
// Idempotent one-shot seed of initial data:
//   - 163 followers (Twitch roster)
//   - First historical session (03/06/2026): mashazinha_ champion @ 750 pts
//   - House record set to that same session's top
//
// Idempotency: only seeds if followers key is currently EMPTY. Re-runs are no-ops
// so the streamer can hit it safely. Use `?force=1` query to overwrite (admin only).
//
// Body: none required. Header X-Admin-Password required.

import {
  KEYS, redisGet, redisSet, isAdmin, jsonResponse
} from '../_barraca-shared.js';

const FOLLOWERS = [
  'Up_Your_Arsenal','Dark_Tiger191','filipegomes888','HookWrath','rafabigodes',
  'Timota_74','fr33_s0ul_pt','GamingWithFlxr','xblkoutxogx420x','zgirao',
  'samuelcariass','DarkTheFirstOne','filipepg','renatosanches63','FIUZA__PT',
  'flipart193','TheSorrow47','MetalCookGaming','CptSnotRocket','UnDeadFoxxD',
  'kubatas88','leleul1ve','gcborg','ariunox','LucasWow95','apbe__007',
  '1_michael_mon','DV_Tuner','sauloflamengo90','RZAttv','rdiogorg','elchapopt',
  'InstintoSilver','ressacas69','pedrombessa','miisoon','kotaplaysofficial',
  'reaperzap69','Sparten593','ElMatozzz','pappadi88','ashelandre','xblackhulk07',
  'dob101','iiitheartist','thecaffeinecryptid','dragon_rl123','SavagePortuguesa',
  'SgtRyGuy','possumatabar','andrediias1996','sillygurl29','kenpa_games',
  'Rfaustin0','xanajogatudo','camjenkins93','twinkiegunr','SilverSerpent4200',
  'NothingsQuenchier','elliejax','MythicVigilante','jiokfellixx','KINGELWOODY',
  'giggls1995','MrParreirinha','BorderlineVibeZ','BLUECHEESEo_o420',
  'JgottiBugotti88','ItsWincy','gloria_playz','Gummiebearbubba','xVesperTVx',
  'mosilva12','Kuraudiu','darksyde_games','lemon_lice','JonahBJams','dmzPT1982',
  'Quintas_Live','aloviely1999','Thor_Q','raposopuro','GrinCulus',
  'queenofcackles','midnight_8k','CesarCardoso25','hugoi90','empire_gaming_tv',
  'Jose_Manteigas','CarlosLopes87','ChaoticCollective420','Lady_DaVinci',
  'billybobbygoat','jamessrva','summoningsesh','rebel420ttv','SirRaph',
  'putsomecherryontop','SlRF0X','stoneyprovolonee','AliaBean12','RoadKillPT77',
  'Eswoogi','enigmahazel','RedBeardedSkull','pinkbubbles1691','SchwiftD_',
  'turtelon478','Sidney7rl','joejoegun222','soonerbabe918','grimmwilleatu',
  'mogie_rl','pilot_jester34','chronoscopeddd','iamamanwhosnotfamous',
  'freezeglitch0','silentphantomx','zx_boogiebear_xz','skyestargaming',
  'xBadxAndyx','astrobaby1116','Ixclusion','xtrue_rebelx','terpymerc',
  'zedoscaesofroad','0XIIIIII','realkozakwolf','desi_shinobi','discojuice02',
  'Speedyy2435','JBirdtheUltimateGamer','hottie_shorty','mashazinha_',
  'DadWozGaming','hotzmxd43','chub_e','LinearCarp8','philodox42','AshCloudHQ',
  'hoboknight47','RealLoki1','GeoDaVincci','dacobra1990','deucegoose910',
  'FatToad843','SegevTron','the_smoke_circle','KUSHxHAZExGAMING','MrStikEFingaz',
  'mexaban26','LokiSlapDash','Skies_Unlimited','WhiteSkaar','JadeRabbitGames',
  'esdrubal_og','Inumerus','vapyagain008','nadiadias__','missjekyll81',
  'sparta_mvp','aynamo','shotini','luka10all','luismartinho33','coronel_pt35'
].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

// First session: 03/06/2026 — mapped from the Tilburg leaderboard print.
const FIRST_SESSION_DATE = '2026-06-03T22:00:00.000Z';
const FIRST_SESSION_TOP = [
  { name: 'mashazinha_',          score: 750 },
  { name: 'kenpa_games',          score: 650 },
  { name: 'putsomecherryontop',   score: 620 },
  { name: 'SlRF0X',               score: 510 },
  { name: 'HookWrath',            score: 320 },
  { name: 'hugoi90',              score: 260 },
  { name: 'dmzPT1982',            score: 200 },
  { name: 'kubatas88',            score: 190 },
  { name: 'elchapopt',            score: 170 },
  { name: 'MetalCookGaming',      score: 150 }
];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse(res, 200, {});
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });
  if (!isAdmin(req)) return jsonResponse(res, 401, { error: 'Unauthorized' });

  const force = req.query && (req.query.force === '1' || req.query.force === 'true');

  try {
    const existingFollowers = await redisGet(KEYS.followers);
    const alreadySeeded = Array.isArray(existingFollowers) && existingFollowers.length > 0;
    if (alreadySeeded && !force) {
      return jsonResponse(res, 200, {
        skipped: true,
        reason: 'Followers already seeded. Pass ?force=1 to overwrite.',
        followersCount: existingFollowers.length
      });
    }

    // 1) Followers roster
    await redisSet(KEYS.followers, FOLLOWERS);

    // 2) House record (Masha 750)
    const champion = FIRST_SESSION_TOP[0];
    await redisSet(KEYS.record, {
      name: champion.name,
      score: champion.score,
      date: FIRST_SESSION_DATE
    });

    // 3) History — prepend the first archived session
    let history = await redisGet(KEYS.history);
    if (!Array.isArray(history)) history = [];
    const alreadyHasFirst = history.some(h => h.date === FIRST_SESSION_DATE && h.champion === champion.name);
    if (!alreadyHasFirst) {
      history.unshift({
        date: FIRST_SESSION_DATE,
        startedAt: FIRST_SESSION_DATE,
        endedAt: FIRST_SESSION_DATE,
        champion: champion.name,
        score: champion.score,
        topPlayers: FIRST_SESSION_TOP.map(p => ({ ...p, lastActivity: FIRST_SESSION_DATE }))
      });
      await redisSet(KEYS.history, history);
    }

    // 4) Reset current to a clean "stream offline" state so the streamer can
    //    cleanly start the next session via the admin UI.
    await redisSet(KEYS.current, {
      active: false,
      startedAt: null,
      endedAt: FIRST_SESSION_DATE,
      players: []
    });

    return jsonResponse(res, 200, {
      success: true,
      followersSeeded: FOLLOWERS.length,
      historicalSessionAdded: !alreadyHasFirst,
      recordSet: champion
    });
  } catch (err) {
    return jsonResponse(res, 500, { error: err.message || String(err) });
  }
}
