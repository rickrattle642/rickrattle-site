// POST /api/barraca/score
// Adds (or sets) points for a player in the current stream. Admin-gated.
//
// Body:
//   { player: "masha", delta: 100 }    → adds 100 to masha's score (creates if new)
//   { player: "masha", set: 750 }      → sets masha's score exactly to 750
//   { player: "masha", remove: true }  → removes masha from current stream
//
// Header: X-Admin-Password: <env BARRACA_ADMIN_PASSWORD>
//
// On every change: re-ranks the leaderboard and checks the house record. If the
// leader passes the historic record, the record is updated atomically.

import {
  KEYS, redisGet, redisSet, isAdmin, jsonResponse,
  normaliseName, normaliseKey, rankPlayers
} from '../_barraca-shared.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse(res, 200, {});
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });
  if (!isAdmin(req)) return jsonResponse(res, 401, { error: 'Unauthorized' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const name = normaliseName(body.player);
  if (!name) return jsonResponse(res, 400, { error: 'Missing player name' });

  try {
    let current = await redisGet(KEYS.current);
    if (!current || !current.active) {
      // Auto-start a stream if none is active. Streamer can also manually start it,
      // but this means score-adding "just works" without ceremony.
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

    // Check house record. Only fires if the leader strictly beats the historic top score.
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

    return jsonResponse(res, 200, {
      success: true,
      player: updated || null,
      position,
      newScore: updated ? updated.score : null,
      leaderboard: current.players,
      recordUpdated
    });
  } catch (err) {
    return jsonResponse(res, 500, { error: err.message || String(err) });
  }
}
