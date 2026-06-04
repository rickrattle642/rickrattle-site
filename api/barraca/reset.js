// POST /api/barraca/reset
// Wipes the CURRENT stream's leaderboard without archiving. Does NOT touch
// the house record or history. Use only for mid-stream do-overs.
//
// Body (optional): { startNew: true } — also starts a fresh stream right after.

import {
  KEYS, redisSet, isAdmin, jsonResponse
} from '../_barraca-shared.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse(res, 200, {});
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });
  if (!isAdmin(req)) return jsonResponse(res, 401, { error: 'Unauthorized' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const startNew = !!body.startNew;

  try {
    await redisSet(KEYS.current, {
      active: startNew,
      startedAt: startNew ? new Date().toISOString() : null,
      endedAt: null,
      players: []
    });
    return jsonResponse(res, 200, { success: true, startNew });
  } catch (err) {
    return jsonResponse(res, 500, { error: err.message || String(err) });
  }
}
