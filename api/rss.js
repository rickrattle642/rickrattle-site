// Vercel serverless function — fetches an RSS/Atom feed and returns normalized JSON.
// Frontend usage: /api/rss?url=https%3A%2F%2Frss.app%2Fr%2Ffeed%2FXXX
// Only the rss.app domain (and a few common feed hosts) is allowed by default — extend ALLOW_HOSTS as needed.

const ALLOW_HOSTS = [
  'rss.app',
  'feeds.feedburner.com',
  'feeds.arstechnica.com',
  'www.pcgamer.com',
  'www.eurogamer.net',
  'www.rockpapershotgun.com',
  'www.gamesindustry.biz'
];

function pick(el, ...names) {
  for (const n of names) {
    const node = el.getElementsByTagName(n)[0];
    if (node && node.textContent) return node.textContent.trim();
  }
  return '';
}

function attr(el, tag, attrName) {
  const node = el.getElementsByTagName(tag)[0];
  return node ? node.getAttribute(attrName) : null;
}

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractImage(itemEl, descHtml) {
  const mediaThumbs = itemEl.getElementsByTagName('media:thumbnail');
  if (mediaThumbs[0] && mediaThumbs[0].getAttribute('url')) return mediaThumbs[0].getAttribute('url');
  const mediaContents = itemEl.getElementsByTagName('media:content');
  if (mediaContents[0] && mediaContents[0].getAttribute('url')) return mediaContents[0].getAttribute('url');
  const enclosures = itemEl.getElementsByTagName('enclosure');
  for (const en of enclosures) {
    const type = en.getAttribute('type') || '';
    if (type.startsWith('image/')) return en.getAttribute('url');
  }
  if (descHtml) {
    const m = descHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) return m[1];
  }
  return null;
}

export default async function handler(req, res) {
  const { url } = req.query || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });
  let target;
  try { target = new URL(url); } catch { return res.status(400).json({ error: 'Invalid url' }); }
  if (!ALLOW_HOSTS.some(h => target.hostname === h || target.hostname.endsWith('.' + h))) {
    return res.status(403).json({ error: 'Host not allowed', host: target.hostname });
  }
  try {
    const r = await fetch(target.toString(), { headers: { 'User-Agent': 'rick-rattle-site/1.0' } });
    if (!r.ok) return res.status(r.status).json({ error: 'Upstream error', status: r.status });
    const xmlText = await r.text();
    // Parse with @xmldom/xmldom (Node-compatible DOM parser).
    // We do best-effort regex-based parsing here since adding a dependency is heavier; this is
    // sufficient for well-formed RSS/Atom from rss.app and similar.
    const items = [];
    const itemRegex = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
    let match;
    while ((match = itemRegex.exec(xmlText)) !== null && items.length < 25) {
      const block = match[0];
      const get = (tag) => {
        const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
        return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
      };
      const title = stripHtml(get('title'));
      // link: prefer <link>...</link> but for Atom may be <link href="..."/>
      let link = stripHtml(get('link'));
      if (!link) {
        const lm = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
        if (lm) link = lm[1];
      }
      const desc = get('description') || get('summary') || get('content:encoded') || '';
      const pubDate = get('pubDate') || get('published') || get('updated') || '';
      // image
      let img = null;
      const mt = block.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i);
      const mc = block.match(/<media:content[^>]*url=["']([^"']+)["']/i);
      const enc = block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image\//i);
      const inImg = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
      img = (mt && mt[1]) || (mc && mc[1]) || (enc && enc[1]) || (inImg && inImg[1]) || null;
      const guidM = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
      const guid = guidM ? guidM[1].trim() : link;
      items.push({
        guid,
        title,
        link,
        summary: stripHtml(desc).slice(0, 220) + (stripHtml(desc).length > 220 ? '…' : ''),
        date: pubDate ? new Date(pubDate).toISOString() : null,
        image: img
      });
    }
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
    return res.status(200).json({ source: target.toString(), count: items.length, items });
  } catch (e) {
    return res.status(502).json({ error: 'Fetch failed', message: e.message });
  }
}
