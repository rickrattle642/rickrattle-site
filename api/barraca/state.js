// GET /api/barraca/state
// Public read endpoint. Returns the full state used by the public page + OBS overlay.
// No auth — anyone can read.

import { readFullState, jsonResponse } from '../_barraca-shared.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse(res, 200, {});
  if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'Method not allowed' });
  try {
    const state = await readFullState();
    return jsonResponse(res, 200, state);
  } catch (err) {
    return jsonResponse(res, 500, { error: err.message || String(err) });
  }
}
