// POST /api/barraca/end-stream
// Closes the current stream: archives champion to history, resets current.
// Does NOT touch the house record.

import {
  KEYS, redisGet, redisSet, isAdmin, jsonResponse, rankPlayers
} from '../_barraca-shared.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse(res, 200, {});
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });
  if (!isAdmin(req)) return jsonResponse(res, 401, { error: 'Unauthorized' });

  try {
    const current = await redisGet(KEYS.current);
    if (!current || !current.active) {
      return jsonResponse(res, 400, { error: 'No active stream to end' });
    }

    const ranked = rankPlayers(current.players);
    const champion = ranked[0] || null;

    let history = await redisGet(KEYS.history);
    if (!Array.isArray(history)) history = [];

    if (champion) {
      history.unshift({
        date: new Date().toISOString(),
        startedAt: current.startedAt,
        endedAt: new Date().toISOString(),
        champion: champion.name,
        score: champion.score,
        topPlayers: ranked.slice(0, 10)  // archive top 10 for posterity
      });
      history = history.slice(0, 50);  // keep last 50 streams max
      await redisSet(KEYS.history, history);
    }

    // Reset current stream.
    await redisSet(KEYS.current, {
      active: false,
      startedAt: null,
      endedAt: new Date().toISOString(),
      players: []
    });

    return jsonResponse(res, 200, { success: true, archived: champion, history });
  } catch (err) {
    return jsonResponse(res, 500, { error: err.message || String(err) });
  }
}
