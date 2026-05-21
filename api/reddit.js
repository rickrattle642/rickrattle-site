// Vercel serverless function — proxies Reddit content to bypass CORS + 403 from cloud IPs.
// Frontend usage: /api/reddit?subreddit=RocketLeague&limit=15&sort=hot
//
// Strategy (in order, first success wins):
//   1) old.reddit.com /<sub>/<sort>.json     ← historically least blocked from Vercel egress
//   2) www.reddit.com /<sub>/<sort>.json     ← canonical host fallback
//   3) www.reddit.com /<sub>/<sort>/.rss     ← RSS feed parsed into the same JSON shape
//      (RSS lacks score/num_comments; we synthesize score=999 so frontend filter passes,
//       since RSS only emits already-trending posts.)
//
// Response shape is unchanged: { data: { children: [{ kind:'t3', data:{...} }] } }
// so index.html parser (data.data.children[].data.{id,title,score,selftext,...}) stays intact.

const PER_ATTEMPT_TIMEOUT_MS = 4500;

// Reddit policy-compliant UA. Slight rotation between attempts avoids fingerprint stick.
const UAS = [
  'web:rickrattle-gaminghub:v1.0.0 (by /u/rickrattle642)',
  'web:rickrattle-gaminghub:v1.0.1 (by /u/rickrattle642)',
  'web:rickrattle-gaminghub:v1.1.0 (by /u/rickrattle642)'
];

function timedFetch(url, opts = {}, ms = PER_ATTEMPT_TIMEOUT_MS) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(t));
}

async function tryJson(host, safe, sort, limit, ua) {
  const url = `https://${host}/r/${safe}/${sort}.json?limit=${encodeURIComponent(limit)}&raw_json=1`;
  const r = await timedFetch(url, {
    headers: {
      'User-Agent': ua,
      'Accept': 'application/json,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    redirect: 'follow'
  });
  if (!r.ok) throw new Error(`${host} ${r.status}`);
  const data = await r.json();
  if (!data || !data.data || !Array.isArray(data.data.children)) {
    throw new Error(`${host} bad shape`);
  }
  return data;
}

// Minimal Atom feed parser for Reddit RSS — Reddit serves Atom XML, not RSS 2.0.
function parseRedditFeed(xml, subreddit) {
  const entries = [];
  // Each <entry>...</entry> block.
  const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml))) {
    const block = m[1];
    const pick = (re) => { const x = block.match(re); return x ? x[1] : ''; };
    const decode = (s) => s
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'");

    const id = pick(/<id>([^<]+)<\/id>/).split('_').pop() || Math.random().toString(36).slice(2, 10);
    const title = decode(pick(/<title[^>]*>([\s\S]*?)<\/title>/).replace(/<!\[CDATA\[|\]\]>/g, '').trim());
    const linkHref = pick(/<link[^>]*href="([^"]+)"/);
    const author = pick(/<author>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/author>/);
    const updated = pick(/<updated>([^<]+)<\/updated>/);
    const contentHtml = decode(pick(/<content[^>]*>([\s\S]*?)<\/content>/).replace(/<!\[CDATA\[|\]\]>/g, ''));
    // Strip HTML tags for selftext.
    const selftext = contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
    // Permalink from canonical link: /r/<sub>/comments/<id>/<slug>/
    const permalink = linkHref.replace(/^https?:\/\/[^/]+/, '') || `/r/${subreddit}/comments/${id}/`;
    const createdSec = updated ? Math.floor(new Date(updated).getTime() / 1000) : Math.floor(Date.now() / 1000);

    if (!title) continue;
    entries.push({
      kind: 't3',
      data: {
        id,
        title,
        author: (author || '').replace(/^\/u\//, ''),
        permalink,
        url: linkHref,
        selftext,
        score: 999,           // RSS has no score — synthesize above redditMinScore (80)
        num_comments: 0,
        created_utc: createdSec,
        link_flair_text: null,
        stickied: false,
        over_18: false,
        preview: null,
        thumbnail: ''
      }
    });
  }
  return { data: { children: entries } };
}

async function tryRss(safe, sort, ua) {
  const url = `https://www.reddit.com/r/${safe}/${sort}/.rss`;
  const r = await timedFetch(url, {
    headers: {
      'User-Agent': ua,
      'Accept': 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    redirect: 'follow'
  });
  if (!r.ok) throw new Error(`rss ${r.status}`);
  const xml = await r.text();
  const data = parseRedditFeed(xml, safe);
  if (!data.data.children.length) throw new Error('rss empty');
  return data;
}

export default async function handler(req, res) {
  const { subreddit, limit = 15, sort = 'hot' } = req.query || {};
  if (!subreddit) {
    return res.status(400).json({ error: 'Missing subreddit' });
  }
  const safe = String(subreddit).replace(/[^A-Za-z0-9_]/g, '');
  const safeSort = ['hot', 'new', 'top', 'rising'].includes(String(sort)) ? String(sort) : 'hot';
  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));

  const attempts = [
    () => tryJson('old.reddit.com', safe, safeSort, safeLimit, UAS[0]),
    () => tryJson('www.reddit.com', safe, safeSort, safeLimit, UAS[1]),
    () => tryRss(safe, safeSort, UAS[2])
  ];

  const errors = [];
  for (const attempt of attempts) {
    try {
      const data = await attempt();
      res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
      return res.status(200).json(data);
    } catch (e) {
      errors.push(e.message || String(e));
    }
  }

  // All strategies failed — return 502 so frontend keeps cached payload (SWR).
  res.setHeader('Cache-Control', 's-maxage=60'); // brief cache even on error to avoid hammer
  return res.status(502).json({
    error: 'Reddit upstream unavailable',
    subreddit: safe,
    attempts: errors
  });
}
