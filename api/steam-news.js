// Vercel serverless function — proxies Steam News API to bypass CORS.
// Frontend usage: /api/steam-news?appid=1771300&count=8

export default async function handler(req, res) {
  const { appid, count = 8, maxlength = 600 } = req.query || {};
  if (!appid) {
    return res.status(400).json({ error: 'Missing appid' });
  }
  const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${encodeURIComponent(appid)}&count=${encodeURIComponent(count)}&maxlength=${encodeURIComponent(maxlength)}&format=json`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'rick-rattle-site/1.0' } });
    if (!r.ok) return res.status(r.status).json({ error: 'Steam upstream error', status: r.status });
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800'); // 15min CDN cache
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'Fetch failed', message: e.message });
  }
}
