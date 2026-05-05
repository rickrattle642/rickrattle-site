// Vercel serverless function — proxies Reddit JSON to bypass CORS.
// Frontend usage: /api/reddit?subreddit=RocketLeague&limit=15

export default async function handler(req, res) {
  const { subreddit, limit = 15, sort = 'hot' } = req.query || {};
  if (!subreddit) {
    return res.status(400).json({ error: 'Missing subreddit' });
  }
  const safe = String(subreddit).replace(/[^A-Za-z0-9_]/g, '');
  const url = `https://www.reddit.com/r/${safe}/${sort}.json?limit=${encodeURIComponent(limit)}&raw_json=1`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'rick-rattle-site/1.0 (by /u/anonymous)' } });
    if (!r.ok) return res.status(r.status).json({ error: 'Reddit upstream error', status: r.status });
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'Fetch failed', message: e.message });
  }
}
