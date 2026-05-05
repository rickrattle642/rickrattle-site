// Vercel serverless function — visit counter.
// Uses abacus.jasoncameron.dev as backend (free, no signup, JSON, persistent).
// Frontend usage:
//   GET /api/visits          → reads current count
//   GET /api/visits?bump=1   → increments + returns new count

const NAMESPACE = 'rickrattle';
const KEY = 'visits';

export default async function handler(req, res) {
  const bump = req.query?.bump === '1';
  const url = bump
    ? `https://abacus.jasoncameron.dev/hit/${NAMESPACE}/${KEY}`
    : `https://abacus.jasoncameron.dev/get/${NAMESPACE}/${KEY}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'rick-rattle-site/1.0' } });
    if (!r.ok) return res.status(r.status).json({ error: 'Counter upstream', status: r.status });
    const data = await r.json();
    // abacus returns: {value: N, namespace: "...", key: "..."}
    res.setHeader('Cache-Control', bump ? 'no-store' : 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ count: data.value ?? 0 });
  } catch (e) {
    return res.status(502).json({ error: 'Fetch failed', message: e.message });
  }
}
