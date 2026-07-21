// POST /api/barraca/admin
// Consolidated admin endpoint — handles every write action via {action} field.
// Single function instead of 5 separate ones (Vercel Hobby plan limit = 12 fns).
//
// Body shape:
//   { action: 'score',      player: 'masha', delta: 100 }       — add points
//   { action: 'score',      player: 'masha', set: 750 }         — set exact
//   { action: 'score',      player: 'masha', remove: true }     — remove from current
//   { action: 'end-stream' }                                     — archive champion
//   { action: 'reset',      startNew: true }                     — reset current stream
//   { action: 'followers',  type: 'add',    names: [...] }       — add to roster
//   { action: 'followers',  type: 'remove', name: '...' }        — remove from roster
//   { action: 'followers',  type: 'set',    names: [...] }       — replace roster
//   { action: 'seed' }                                           — one-shot initial seed
//
// Auth: header X-Admin-Password against BARRACA_ADMIN_PASSWORD env var.

import {
  KEYS, redisGet, redisSet, isAdmin, jsonResponse,
  normaliseName, normaliseKey, rankPlayers,
  CHALLENGES, currentMonthKey,
  ERAS, DEFAULT_CURRENT_ERA
} from '../_barraca-shared.js';

// ===== Seed data (used by 'seed' action + 'refresh-followers' action) =====
// Renames applied vs previous list:
//   HookWrath   → GappaTTV
//   xVesperTVx  → LadyVesperTv
//   raposopuro  → raposopurottv25
// Removed (no longer followers): CptSnotRocket, iiitheartist, zx_boogiebear_xz
// New additions: ~50 new followers added (xxgukaxx, tenminato, Kuraudiu, ティアギート, 海斗_, etc.)
const SEED_FOLLOWERS = [
  'xxgukaxx','海斗_','varex123_','Kakakaue0512','mister_red_face',
  'MiGas_','marcovaz91','a_tal_da_sah','MYXTA20','badguy_123',
  'marcos_dragao','anthonypereira2026','KoRn2Field','MrBAugusto','Boj9',
  'salgas20','NyzoHx','ティアギート','DJGoAlex','shelby__rose',
  'junior_do_muaythai50','ogait13','KappaOito','williamntv','BuggyPT',
  'drippieboydevin','likaspt25','LUR0CK007','ic0____','letsgostreamin88',
  'marcostata14','fernandodmcarvalho','JTFthat','EclecticElectricMG','BattleCryyyyyy',
  'cabraburra','gorillasnipper','SirAerys','zwaaiendedeur','dr0pe87',
  'FallenSilenceGaming','erick_schibes','tubias08','r1n0aheart','fabiopraeiro',
  'fallgon6','ugalover5','xtragaming','tatobarradas15','tepaiheimer',
  'lobomau_dois','rafatekkengamer','tenminato','Up_Your_Arsenal','Dark_Tiger191',
  'filipegomes888','GappaTTV','rafabigodes','Timota_74','fr33_s0ul_pt',
  'GamingWithFlxr','xblkoutxogx420x','zgirao','samuelcariass','DarkTheFirstOne',
  'filipepg','renatosanches63','FIUZA__PT','flipart193','TheSorrow47',
  'MetalCookGaming','UnDeadFoxxD','kubatas88','leleul1ve','gcborg',
  'ariunox','LucasWow95','apbe__007','1_michael_mon','DV_Tuner',
  'sauloflamengo90','RZAttv','rdiogorg','elchapopt','InstintoSilver',
  'ressacas69','pedrombessa','miisoon','kotaplaysofficial','reaperzap69',
  'Sparten593','ElMatozzz','pappadi88','ashelandre','xblackhulk07',
  'dob101','thecaffeinecryptid','dragon_rl123','SavagePortuguesa','SgtRyGuy',
  'possumatabar','andrediias1996','sillygurl29','kenpa_games','Rfaustin0',
  'xanajogatudo','camjenkins93','twinkiegunr','SilverSerpent4200','NothingsQuenchier',
  'elliejax','MythicVigilante','jiokfellixx','KINGELWOODY','giggls1995',
  'MrParreirinha','BorderlineVibeZ','BLUECHEESEo_o420','JgottiBugotti88','ItsWincy',
  'gloria_playz','Gummiebearbubba','LadyVesperTv','mosilva12','Kuraudiu',
  'darksyde_games','lemon_lice','JonahBJams','dmzPT1982','Quintas_Live',
  'aloviely1999','Thor_Q','raposopurottv25','GrinCulus','queenofcackles',
  'midnight_8k','CesarCardoso25','hugoi90','empire_gaming_tv','Jose_Manteigas',
  'CarlosLopes87','ChaoticCollective420','Lady_DaVinci','billybobbygoat','jamessrva',
  'summoningsesh','rebel420ttv','SirRaph','putsomecherryontop','SlRF0X',
  'stoneyprovolonee','AliaBean12','RoadKillPT77','Eswoogi','enigmahazel',
  'RedBeardedSkull','pinkbubbles1691','SchwiftD_','turtelon478','Sidney7rl',
  'joejoegun222','soonerbabe918','grimmwilleatu','mogie_rl','pilot_jester34',
  'chronoscopeddd','iamamanwhosnotfamous','freezeglitch0','silentphantomx','skyestargaming',
  'xBadxAndyx','astrobaby1116','Ixclusion','xtrue_rebelx','terpymerc',
  'zedoscaesofroad','0XIIIIII','realkozakwolf','desi_shinobi','discojuice02',
  'Speedyy2435','JBirdtheUltimateGamer','hottie_shorty','mashazinha_','DadWozGaming',
  'hotzmxd43','chub_e','LinearCarp8','philodox42','AshCloudHQ',
  'hoboknight47','RealLoki1','GeoDaVincci','dacobra1990','deucegoose910',
  'FatToad843','SegevTron','the_smoke_circle','KUSHxHAZExGAMING','MrStikEFingaz',
  'mexaban26','LokiSlapDash','Skies_Unlimited','WhiteSkaar','JadeRabbitGames',
  'esdrubal_og','Inumerus','vapyagain008','nadiadias__','missjekyll81',
  'sparta_mvp','aynamo','shotini','luka10all','luismartinho33','coronel_pt35'
].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

const FIRST_SESSION_DATE = '2026-06-03T22:00:00.000Z';
const FIRST_SESSION_TOP = [
  { name: 'mashazinha_',          score: 750 },
  { name: 'kenpa_games',          score: 650 },
  { name: 'putsomecherryontop',   score: 620 },
  { name: 'SlRF0X',               score: 510 },
  { name: 'GappaTTV',             score: 320 },   // renamed from HookWrath
  { name: 'hugoi90',              score: 260 },
  { name: 'dmzPT1982',            score: 200 },
  { name: 'kubatas88',            score: 190 },
  { name: 'elchapopt',            score: 170 },
  { name: 'MetalCookGaming',      score: 150 }
];

// ===== Helpers =====

function dedupeFollowers(names) {
  const seen = new Set();
  const out = [];
  for (const raw of names || []) {
    const n = normaliseName(raw);
    if (!n) continue;
    const k = normaliseKey(n);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

// ===== Action handlers =====

async function actionScore(body) {
  const name = normaliseName(body.player);
  if (!name) return { status: 400, body: { error: 'Missing player name' } };

  let current = await redisGet(KEYS.current);
  if (!current || !current.active) {
    current = {
      active: true,
      startedAt: new Date().toISOString(),
      endedAt: null,
      players: []
    };
  }

  const key = normaliseKey(name);
  const existing = current.players.find(p => normaliseKey(p.name) === key);

  if (body.remove) {
    current.players = current.players.filter(p => normaliseKey(p.name) !== key);
  } else if (typeof body.set === 'number' && Number.isFinite(body.set)) {
    if (existing) {
      existing.score = Math.max(0, Math.round(body.set));
      existing.lastActivity = new Date().toISOString();
    } else {
      current.players.push({
        name,
        score: Math.max(0, Math.round(body.set)),
        lastActivity: new Date().toISOString()
      });
    }
  } else {
    const delta = Math.round(Number(body.delta) || 0);
    if (existing) {
      existing.score = Math.max(0, existing.score + delta);
      existing.lastActivity = new Date().toISOString();
    } else if (delta > 0) {
      current.players.push({
        name,
        score: delta,
        lastActivity: new Date().toISOString()
      });
    }
  }

  current.players = rankPlayers(current.players);

  const leader = current.players[0];
  let recordUpdated = false;
  if (leader && leader.score > 0) {
    const record = await redisGet(KEYS.record);
    if (!record || leader.score > record.score) {
      await redisSet(KEYS.record, {
        name: leader.name,
        score: leader.score,
        date: new Date().toISOString()
      });
      recordUpdated = true;
    }
  }

  await redisSet(KEYS.current, current);

  const updated = current.players.find(p => normaliseKey(p.name) === key);
  const position = updated ? current.players.indexOf(updated) + 1 : null;

  return {
    status: 200,
    body: {
      success: true,
      player: updated || null,
      position,
      newScore: updated ? updated.score : null,
      leaderboard: current.players,
      recordUpdated
    }
  };
}

async function actionEndStream() {
  const current = await redisGet(KEYS.current);
  if (!current || !current.active) {
    return { status: 400, body: { error: 'No active stream to end' } };
  }

  const ranked = rankPlayers(current.players);
  const champion = ranked[0] || null;
  // Stamp the current era on the new history entry so per-era stats + badges are correct
  // without needing close-era migrations later.
  const currentEra = (await redisGet(KEYS.currentEra)) || DEFAULT_CURRENT_ERA;

  let history = await redisGet(KEYS.history);
  if (!Array.isArray(history)) history = [];

  if (champion) {
    history.unshift({
      date: new Date().toISOString(),
      startedAt: current.startedAt,
      endedAt: new Date().toISOString(),
      champion: champion.name,
      score: champion.score,
      topPlayers: ranked.slice(0, 10),
      gameType: currentEra
    });
    history = history.slice(0, 50);
    await redisSet(KEYS.history, history);
  }

  await redisSet(KEYS.current, {
    active: false,
    startedAt: null,
    endedAt: new Date().toISOString(),
    players: []
  });

  return { status: 200, body: { success: true, archived: champion, history } };
}

async function actionReset(body) {
  const startNew = !!body.startNew;
  await redisSet(KEYS.current, {
    active: startNew,
    startedAt: startNew ? new Date().toISOString() : null,
    endedAt: null,
    players: []
  });
  return { status: 200, body: { success: true, startNew } };
}

async function actionFollowers(body) {
  let current = await redisGet(KEYS.followers);
  if (!Array.isArray(current)) current = [];

  const type = body.type;
  if (type === 'add') {
    const incoming = Array.isArray(body.names) ? body.names : [body.name].filter(Boolean);
    current = dedupeFollowers([...current, ...incoming]);
  } else if (type === 'remove') {
    const target = normaliseKey(body.name);
    if (!target) return { status: 400, body: { error: 'Missing name' } };
    current = current.filter(n => normaliseKey(n) !== target);
  } else if (type === 'set') {
    current = dedupeFollowers(Array.isArray(body.names) ? body.names : []);
  } else {
    return { status: 400, body: { error: 'Unknown followers type — use add/remove/set' } };
  }

  await redisSet(KEYS.followers, current);
  return { status: 200, body: { success: true, count: current.length, followers: current } };
}

// Manually edit / clear / recompute the house record.
//   { action: 'set-record', clear: true }                       → wipes record entirely
//   { action: 'set-record', recompute: true }                   → derives record from history
//   { action: 'set-record', name: 'masha', score: 750, date }   → exact override
async function actionSetRecord(body) {
  if (body.clear) {
    await redisSet(KEYS.record, null);
    return { status: 200, body: { success: true, cleared: true, record: null } };
  }
  if (body.recompute) {
    const history = await redisGet(KEYS.history);
    let best = null;
    if (Array.isArray(history)) {
      for (const h of history) {
        if (!h) continue;
        const candidate = { name: h.champion, score: h.score, date: h.date };
        if (!best || candidate.score > best.score) best = candidate;
      }
    }
    if (best) await redisSet(KEYS.record, best);
    else await redisSet(KEYS.record, null);
    return { status: 200, body: { success: true, recomputed: true, record: best } };
  }
  const name = normaliseName(body.name);
  const score = Math.round(Number(body.score));
  if (!name || !Number.isFinite(score) || score < 0) {
    return { status: 400, body: { error: 'set-record requires {name, score} or {clear:true} or {recompute:true}' } };
  }
  const record = {
    name,
    score,
    date: body.date || new Date().toISOString()
  };
  await redisSet(KEYS.record, record);
  return { status: 200, body: { success: true, record } };
}

// Challenge tracker — counts how many times Rick completes each challenge per month.
// Body shapes:
//   { action: 'challenge', name: 'WHISKEY', delta: 1 }              — increment (default +1)
//   { action: 'challenge', name: 'WHISKEY', delta: -1 }             — decrement (floored at 0)
//   { action: 'challenge', name: 'WHISKEY', set: 5 }                — exact value
//   { action: 'challenge', name: 'WHISKEY', set: 5, month: '2026-06' } — override month
//   { action: 'challenge', resetMonth: true, month: '2026-06' }     — clear a month
async function actionChallenge(body) {
  const month = (body.month && /^\d{4}-\d{2}$/.test(body.month)) ? body.month : currentMonthKey();

  let store = await redisGet(KEYS.challenges);
  if (!store || typeof store !== 'object' || Array.isArray(store)) store = {};

  // Ensure bucket for this month exists with all challenges at 0
  if (!store[month] || typeof store[month] !== 'object') store[month] = {};
  for (const c of CHALLENGES) if (typeof store[month][c] !== 'number') store[month][c] = 0;

  if (body.resetMonth) {
    for (const c of CHALLENGES) store[month][c] = 0;
    await redisSet(KEYS.challenges, store);
    return { status: 200, body: { success: true, month, challenges: store[month], reset: true } };
  }

  const name = (body.name || '').toString().toUpperCase();
  if (!CHALLENGES.includes(name)) {
    return { status: 400, body: { error: `Unknown challenge "${name}". Valid: ${CHALLENGES.join(', ')}` } };
  }

  if (typeof body.set === 'number' && Number.isFinite(body.set)) {
    store[month][name] = Math.max(0, Math.round(body.set));
  } else {
    const delta = Number.isFinite(Number(body.delta)) ? Math.round(Number(body.delta)) : 1;
    store[month][name] = Math.max(0, store[month][name] + delta);
  }

  await redisSet(KEYS.challenges, store);
  return {
    status: 200,
    body: { success: true, month, name, value: store[month][name], challenges: store[month] }
  };
}

async function actionSeed(body) {
  const force = !!body.force;
  const existingFollowers = await redisGet(KEYS.followers);
  const alreadySeeded = Array.isArray(existingFollowers) && existingFollowers.length > 0;
  if (alreadySeeded && !force) {
    return {
      status: 200,
      body: {
        skipped: true,
        reason: 'Followers already seeded. Pass {force:true} to overwrite.',
        followersCount: existingFollowers.length
      }
    };
  }

  await redisSet(KEYS.followers, SEED_FOLLOWERS);

  const champion = FIRST_SESSION_TOP[0];
  await redisSet(KEYS.record, {
    name: champion.name,
    score: champion.score,
    date: FIRST_SESSION_DATE
  });

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

  await redisSet(KEYS.current, {
    active: false,
    startedAt: null,
    endedAt: FIRST_SESSION_DATE,
    players: []
  });

  return {
    status: 200,
    body: {
      success: true,
      followersSeeded: SEED_FOLLOWERS.length,
      historicalSessionAdded: !alreadyHasFirst,
      recordSet: champion
    }
  };
}

// Overwrite the followers roster with the current SEED_FOLLOWERS constant (the "source of truth"
// baked into the code). Use when the code has been updated with new followers / renames but Redis
// still holds the old list.
async function actionRefreshFollowers() {
  await redisSet(KEYS.followers, SEED_FOLLOWERS);
  return {
    status: 200,
    body: { success: true, count: SEED_FOLLOWERS.length, followers: SEED_FOLLOWERS }
  };
}

// Rename a player across ALL data: current stream, record, history (champion + topPlayers),
// followers, and every era-archive snapshot. Case-insensitive match.
//   { action: 'rename-player', from: 'HookWrath', to: 'GappaTTV' }
async function actionRenamePlayer(body) {
  const fromName = normaliseName(body.from);
  const toName   = normaliseName(body.to);
  if (!fromName || !toName) {
    return { status: 400, body: { error: 'Both from + to names required' } };
  }
  const fromKey = fromName.toLowerCase();

  const [current, record, history, followers, eraArchive] = await Promise.all([
    redisGet(KEYS.current),
    redisGet(KEYS.record),
    redisGet(KEYS.history),
    redisGet(KEYS.followers),
    redisGet(KEYS.eraArchive)
  ]);

  const changes = { current: 0, record: 0, history: 0, followers: 0, eraArchive: 0 };

  // Current stream players
  let newCurrent = current;
  if (current && Array.isArray(current.players)) {
    newCurrent = { ...current, players: current.players.map(p => {
      if ((p.name || '').toLowerCase() === fromKey) { changes.current++; return { ...p, name: toName }; }
      return p;
    })};
  }

  // Record
  let newRecord = record;
  if (record && (record.name || '').toLowerCase() === fromKey) {
    newRecord = { ...record, name: toName };
    changes.record = 1;
  }

  // History
  const newHistory = (Array.isArray(history) ? history : []).map(h => {
    const newH = { ...h };
    if ((h.champion || '').toLowerCase() === fromKey) { newH.champion = toName; changes.history++; }
    if (Array.isArray(h.topPlayers)) {
      newH.topPlayers = h.topPlayers.map(p => {
        if ((p.name || '').toLowerCase() === fromKey) { changes.history++; return { ...p, name: toName }; }
        return p;
      });
    }
    return newH;
  });

  // Followers
  const newFollowers = (Array.isArray(followers) ? followers : []).map(n => {
    if ((n || '').toLowerCase() === fromKey) { changes.followers++; return toName; }
    return n;
  });

  // Era archive snapshots (nested state)
  const newEraArchive = (Array.isArray(eraArchive) ? eraArchive : []).map(snap => {
    if (!snap || !snap.before) return snap;
    const b = { ...snap.before };
    if (b.record && (b.record.name || '').toLowerCase() === fromKey) {
      b.record = { ...b.record, name: toName }; changes.eraArchive++;
    }
    if (Array.isArray(b.history)) {
      b.history = b.history.map(h => {
        const newH = { ...h };
        if ((h.champion || '').toLowerCase() === fromKey) { newH.champion = toName; changes.eraArchive++; }
        if (Array.isArray(h.topPlayers)) {
          newH.topPlayers = h.topPlayers.map(p => {
            if ((p.name || '').toLowerCase() === fromKey) { changes.eraArchive++; return { ...p, name: toName }; }
            return p;
          });
        }
        return newH;
      });
    }
    if (b.current && Array.isArray(b.current.players)) {
      b.current = { ...b.current, players: b.current.players.map(p => {
        if ((p.name || '').toLowerCase() === fromKey) { changes.eraArchive++; return { ...p, name: toName }; }
        return p;
      })};
    }
    return { ...snap, before: b };
  });

  await Promise.all([
    redisSet(KEYS.current,    newCurrent),
    redisSet(KEYS.record,     newRecord),
    redisSet(KEYS.history,    newHistory),
    redisSet(KEYS.followers,  newFollowers),
    redisSet(KEYS.eraArchive, newEraArchive)
  ]);

  return {
    status: 200,
    body: { success: true, from: fromName, to: toName, changes, totalChanges: Object.values(changes).reduce((s,v) => s+v, 0) }
  };
}

// Bulk-retag history entries by date range. Fixes historical mislabelling — for entries
// created before actionEndStream stamped gameType, or when close-era misclassified them.
//   { action: 'retag-history', dateFrom: '2026-07-01', gameType: 'wheel' }
//   { action: 'retag-history', dateFrom: '2026-07-01', dateTo: '2026-07-31', gameType: 'wheel' }
async function actionRetagHistory(body) {
  const gameType = (body.gameType || '').toString();
  if (!ERAS[gameType]) {
    return { status: 400, body: { error: `Invalid gameType "${gameType}". Valid: ${Object.keys(ERAS).join(', ')}` } };
  }
  const dateFrom = body.dateFrom ? new Date(body.dateFrom).getTime() : 0;
  const dateTo   = body.dateTo   ? new Date(body.dateTo).getTime()   : Number.MAX_SAFE_INTEGER;
  if (isNaN(dateFrom) || isNaN(dateTo)) {
    return { status: 400, body: { error: 'Invalid dateFrom/dateTo (expected ISO like 2026-07-01).' } };
  }

  const history = await redisGet(KEYS.history);
  if (!Array.isArray(history) || history.length === 0) {
    return { status: 400, body: { error: 'History is empty — nothing to retag.' } };
  }

  let retagged = 0;
  const updated = history.map(h => {
    const t = new Date(h.date || h.startedAt || 0).getTime();
    if (t >= dateFrom && t <= dateTo && h.gameType !== gameType) {
      retagged++;
      return { ...h, gameType };
    }
    return h;
  });

  await redisSet(KEYS.history, updated);
  return {
    status: 200,
    body: { success: true, retagged, total: updated.length, gameType, dateFrom: body.dateFrom, dateTo: body.dateTo }
  };
}

// ===== Era management =====
// Close the current era and start a new one.
//   { action: 'close-era', newEra: 'wheel' }            → tags untagged history with current era,
//                                                         snapshots state for undo, resets record + stream
//                                                         and switches currentEra to newEra
//   { action: 'close-era', revert: true }               → pops most recent snapshot off the archive and restores it
async function actionCloseEra(body) {
  if (body.revert) {
    return actionRevertEra();
  }

  const currentEra = (await redisGet(KEYS.currentEra)) || DEFAULT_CURRENT_ERA;
  const newEra = body.newEra || (currentEra === 'dartboard' ? 'wheel' : currentEra);
  if (!ERAS[newEra]) {
    return { status: 400, body: { error: `Unknown era "${newEra}". Valid: ${Object.keys(ERAS).join(', ')}` } };
  }
  if (newEra === currentEra) {
    return { status: 400, body: { error: `Already in era "${currentEra}" — nothing to close.` } };
  }

  const [record, history, current, eraArchive] = await Promise.all([
    redisGet(KEYS.record),
    redisGet(KEYS.history),
    redisGet(KEYS.current),
    redisGet(KEYS.eraArchive)
  ]);

  // Tag untagged history with the era we're closing (so the archive view can show them).
  const taggedHistory = (Array.isArray(history) ? history : []).map(h =>
    h && !h.gameType ? { ...h, gameType: currentEra } : h
  );

  // Snapshot the full BEFORE state for revert.
  const snapshot = {
    closedAt: new Date().toISOString(),
    closingEra: currentEra,
    newEra,
    before: {
      record: record || null,
      history: Array.isArray(history) ? history : [],
      current: current || { active: false, startedAt: null, endedAt: null, players: [] },
      currentEra
    }
  };
  const newArchive = Array.isArray(eraArchive) ? [...eraArchive, snapshot] : [snapshot];

  await Promise.all([
    redisSet(KEYS.eraArchive, newArchive),
    redisSet(KEYS.history,    taggedHistory),
    redisSet(KEYS.record,     null),
    redisSet(KEYS.current,    { active: false, startedAt: null, endedAt: null, players: [] }),
    redisSet(KEYS.currentEra, newEra)
  ]);

  return {
    status: 200,
    body: {
      success: true,
      closingEra: currentEra,
      newEra,
      archiveLength: newArchive.length,
      historyTagged: taggedHistory.length
    }
  };
}

// Revert the most recent close-era transition.
async function actionRevertEra() {
  const eraArchive = await redisGet(KEYS.eraArchive);
  if (!Array.isArray(eraArchive) || eraArchive.length === 0) {
    return { status: 400, body: { error: 'Nada para reverter — arquivo de eras está vazio.' } };
  }
  const last = eraArchive[eraArchive.length - 1];
  const remaining = eraArchive.slice(0, -1);

  await Promise.all([
    redisSet(KEYS.eraArchive, remaining),
    redisSet(KEYS.history,    last.before.history),
    redisSet(KEYS.record,     last.before.record),
    redisSet(KEYS.current,    last.before.current),
    redisSet(KEYS.currentEra, last.before.currentEra || DEFAULT_CURRENT_ERA)
  ]);

  return {
    status: 200,
    body: {
      success: true,
      revertedFrom: last.newEra,
      revertedTo:   last.closingEra,
      archiveRemaining: remaining.length
    }
  };
}

// ===== Dispatcher =====

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse(res, 200, {});
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });
  if (!isAdmin(req)) return jsonResponse(res, 401, { error: 'Unauthorized' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const action = body.action;
  if (!action) return jsonResponse(res, 400, { error: 'Missing action field' });

  try {
    let result;
    switch (action) {
      case 'score':       result = await actionScore(body); break;
      case 'end-stream':  result = await actionEndStream(); break;
      case 'reset':       result = await actionReset(body); break;
      case 'followers':   result = await actionFollowers(body); break;
      case 'seed':        result = await actionSeed(body); break;
      case 'set-record':  result = await actionSetRecord(body); break;
      case 'challenge':   result = await actionChallenge(body); break;
      case 'close-era':          result = await actionCloseEra(body); break;
      case 'retag-history':      result = await actionRetagHistory(body); break;
      case 'refresh-followers':  result = await actionRefreshFollowers(); break;
      case 'rename-player':      result = await actionRenamePlayer(body); break;
      default:            return jsonResponse(res, 400, { error: 'Unknown action: ' + action });
    }
    return jsonResponse(res, result.status, result.body);
  } catch (err) {
    return jsonResponse(res, 500, { error: err.message || String(err) });
  }
}
