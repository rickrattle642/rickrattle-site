// Shared lib for Barraca da Feira API endpoints.
// Vercel ignores files in /api/ that start with `_` from routing, so this is safe.
//
// Requires env vars (set in Vercel project settings):
//   UPSTASH_REDIS_REST_URL    — your Upstash REST endpoint
//   UPSTASH_REDIS_REST_TOKEN  — your read-write token
//   BARRACA_ADMIN_PASSWORD    — single shared password for admin actions

const URL_ENV = 'UPSTASH_REDIS_REST_URL';
const TOKEN_ENV = 'UPSTASH_REDIS_REST_TOKEN';

export const KEYS = {
  current: 'rr:barraca:current',
  record:  'rr:barraca:record',
  history: 'rr:barraca:history'
};

// Run a Redis command via Upstash REST API. Always returns parsed JSON for SET/GET
// of JSON-encoded values.
async function cmd(args) {
  const url = process.env[URL_ENV];
  const token = process.env[TOKEN_ENV];
  if (!url || !token) {
    throw new Error('Upstash Redis env vars missing (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).');
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Upstash ${r.status}: ${text}`);
  }
  const data = await r.json();
  return data.result;
}

export async function redisGet(key) {
  const raw = await cmd(['GET', key]);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

export async function redisSet(key, value) {
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  return cmd(['SET', key, body]);
}

// Read current stream + house record + last 10 history entries in parallel.
export async function readFullState() {
  const [current, record, history] = await Promise.all([
    redisGet(KEYS.current),
    redisGet(KEYS.record),
    redisGet(KEYS.history)
  ]);
  return {
    current: current || { active: false, startedAt: null, endedAt: null, players: [] },
    record:  record  || null,
    history: Array.isArray(history) ? history.slice(0, 10) : []
  };
}

// Admin password gate. Returns true if header matches env var.
export function isAdmin(req) {
  const expected = process.env.BARRACA_ADMIN_PASSWORD;
  if (!expected) return false;
  const provided = (req.headers['x-admin-password'] || req.headers['X-Admin-Password'] || '').toString();
  return provided && provided === expected;
}

// Normalises a player name: trim, lowercase, ASCII-only-ish.
// Keep "masha", "HookWrath" comparable across casing.
export function normaliseName(name) {
  return (name || '').toString().trim();
}
export function normaliseKey(name) {
  return normaliseName(name).toLowerCase();
}

// Sort + rank a players array (descending by score, alphabetical tie-break).
export function rankPlayers(players) {
  return [...(players || [])].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });
}

// JSON response helper with no-cache (these endpoints must always be fresh).
export function jsonResponse(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
  return res.status(status).json(body);
}
