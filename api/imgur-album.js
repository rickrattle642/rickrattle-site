// Vercel serverless function — fetches an Imgur album and returns image URLs.
// Frontend usage: /api/imgur-album?id=js3Ofk4
// Requires env var IMGUR_CLIENT_ID. Register a free app at https://api.imgur.com/oauth2/addclient

export default async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });
  const clientId = process.env.IMGUR_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: 'IMGUR_CLIENT_ID not configured. Add it in Vercel project settings.' });
  }
  // Imgur album URLs may include a slug like "kcd-wheel-of-torture-js3Ofk4" — extract last token.
  const albumId = String(id).split('-').pop().replace(/[^A-Za-z0-9]/g, '');
  try {
    const r = await fetch(`https://api.imgur.com/3/album/${albumId}`, {
      headers: { Authorization: `Client-ID ${clientId}` }
    });
    if (!r.ok) return res.status(r.status).json({ error: 'Imgur upstream error', status: r.status });
    const data = await r.json();
    const images = (data.data?.images || []).map(img => ({
      id: img.id,
      url: img.link,                   // direct i.imgur.com URL
      title: img.title || null,
      description: img.description || null,
      width: img.width,
      height: img.height,
      type: img.type
    }));
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400'); // 1h CDN cache, 24h SWR
    return res.status(200).json({ id: albumId, count: images.length, images });
  } catch (e) {
    return res.status(502).json({ error: 'Fetch failed', message: e.message });
  }
}
