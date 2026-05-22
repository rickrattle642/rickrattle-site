// Vercel serverless function — checks if a Twitch channel is currently live via Helix API.
// Frontend usage: /api/twitch-live  (defaults to rick__rattle)
//                 /api/twitch-live?channel=someone_else
//
// Why this exists:
//   The Twitch embed iframe makes many auth/GQL calls when mounted. If the channel is
//   offline, those calls 429-rate-limit and pollute the console. By gating the iframe
//   behind a server-side liveness check (cached 60s edge + browser), the iframe only
//   ever loads when there's actually something to watch — zero stray 429s.
//
// Returns 200 always. Frontend treats missing creds / API errors as "offline" (safe default).
//
// Env vars required (set in Vercel project settings):
//   TWITCH_CLIENT_ID
//   TWITCH_CLIENT_SECRET

const DEFAULT_CHANNEL = 'rick__rattle';

// In-process token cache (per Lambda warm instance).
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAppToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;
  const body = `client_id=${encodeURIComponent(process.env.TWITCH_CLIENT_ID)}` +
               `&client_secret=${encodeURIComponent(process.env.TWITCH_CLIENT_SECRET)}` +
               `&grant_type=client_credentials`;
  const r = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  const data = await r.json();
  if (!data.access_token) throw new Error('token: no access_token in response');
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000);
  return cachedToken;
}

export default async function handler(req, res) {
  const raw = (req.query && req.query.channel) || DEFAULT_CHANNEL;
  const channel = String(raw).replace(/[^A-Za-z0-9_]/g, '').toLowerCase();
  if (!channel) {
    return res.status(400).json({ error: 'Invalid channel', live: false });
  }

  // If env vars aren't configured, fail safe (frontend treats as offline).
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
    res.setHeader('Cache-Control', 's-maxage=30');
    return res.status(200).json({
      live: false,
      error: 'twitch_credentials_missing',
      hint: 'Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in Vercel env vars.'
    });
  }

  try {
    const token = await getAppToken();
    const r = await fetch(`https://api.twitch.tv/helix/streams?user_login=${channel}`, {
      headers: {
        'Client-Id': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
      }
    });
    if (!r.ok) throw new Error(`helix ${r.status}`);
    const data = await r.json();
    const stream = data && data.data && data.data[0];

    // Edge cache 60s, SWR 120s — keeps Twitch API calls minimal under traffic.
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

    if (stream) {
      return res.status(200).json({
        live: true,
        channel,
        title: stream.title || '',
        viewers: stream.viewer_count || 0,
        game: stream.game_name || '',
        startedAt: stream.started_at || null,
        // Helix thumb URL has {width}/{height} placeholders.
        thumb: (stream.thumbnail_url || '')
          .replace('{width}', '640')
          .replace('{height}', '360')
      });
    } else {
      return res.status(200).json({ live: false, channel });
    }
  } catch (e) {
    // Never 500 — frontend reads any error as "offline" and skips iframe mount.
    res.setHeader('Cache-Control', 's-maxage=30');
    return res.status(200).json({ live: false, channel, error: e.message || String(e) });
  }
}
