// POST /api/barraca/followers
// Manage the follower roster (the "player database" the admin picks from).
//
// Body forms:
//   { action: 'add',    names: ['name1','name2'] }   → adds, de-duped
//   { action: 'remove', name:  'name1' }             → removes a single name
//   { action: 'set',    names: [...] }                → replaces the whole list
//
// Header: X-Admin-Password
//
// GET /api/barraca/followers → public read, returns the list (no auth required)

import {
  KEYS, redisGet, redisSet, isAdmin, jsonResponse, normaliseName, normaliseKey
} from '../_barraca-shared.js';

function dedupe(names) {
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
  // Sort alphabetically case-insensitive — easier to scan in the admin UI.
  return out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse(res, 200, {});

  if (req.method === 'GET') {
    try {
      const list = await redisGet(KEYS.followers);
      return jsonResponse(res, 200, { followers: Array.isArray(list) ? list : [] });
    } catch (err) {
      return jsonResponse(res, 500, { error: err.message || String(err) });
    }
  }

  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });
  if (!isAdmin(req)) return jsonResponse(res, 401, { error: 'Unauthorized' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  try {
    let current = await redisGet(KEYS.followers);
    if (!Array.isArray(current)) current = [];

    const action = body.action;

    if (action === 'add') {
      const incoming = Array.isArray(body.names) ? body.names : [body.name].filter(Boolean);
      current = dedupe([...current, ...incoming]);
    } else if (action === 'remove') {
      const target = normaliseKey(body.name);
      if (!target) return jsonResponse(res, 400, { error: 'Missing name' });
      current = current.filter(n => normaliseKey(n) !== target);
    } else if (action === 'set') {
      current = dedupe(Array.isArray(body.names) ? body.names : []);
    } else {
      return jsonResponse(res, 400, { error: 'Unknown action — use add/remove/set' });
    }

    await redisSet(KEYS.followers, current);
    return jsonResponse(res, 200, { success: true, count: current.length, followers: current });
  } catch (err) {
    return jsonResponse(res, 500, { error: err.message || String(err) });
  }
}
