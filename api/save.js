import { timingSafeEqual } from 'node:crypto';

function authed(req) {
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const GH = 'https://api.github.com';

async function gh(path, token, opts = {}) {
  const r = await fetch(GH + path, {
    ...opts,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'shoe-site-admin',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`GitHub ${r.status} on ${path}: ${text.slice(0, 200)}`);
  }
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Password check used by the admin login (writes nothing)
  if (req.method === 'GET' && 'check' in req.query) {
    return authed(req)
      ? res.status(200).json({ ok: true })
      : res.status(401).json({ error: 'Wrong password' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!authed(req)) return res.status(401).json({ error: 'Wrong password' });

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // "owner/repo"
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token || !repo) {
    return res.status(500).json({ error: 'GITHUB_TOKEN or GITHUB_REPO env var is not set in Vercel' });
  }

  const { content, newPhotos = [] } = req.body || {};
  if (!content || typeof content !== 'object' || !Array.isArray(content.packages)) {
    return res.status(400).json({ error: 'Invalid content' });
  }
  for (const p of newPhotos) {
    if (!/^photos\/[\w-]+\.(jpg|jpeg|png|webp)$/.test(p.path || '')) {
      return res.status(400).json({ error: 'Invalid photo path' });
    }
    if (typeof p.data !== 'string' || p.data.length > 4_000_000) {
      return res.status(413).json({ error: 'Photo too large' });
    }
  }

  try {
    const base = `/repos/${repo}`;

    // 1. Latest commit on the branch
    const ref = await gh(`${base}/git/ref/heads/${branch}`, token);
    const parentSha = ref.object.sha;
    const parentCommit = await gh(`${base}/git/commits/${parentSha}`, token);

    // 2. Blobs for every changed file
    const treeItems = [];
    const contentBlob = await gh(`${base}/git/blobs`, token, {
      method: 'POST',
      body: JSON.stringify({
        content: JSON.stringify(content, null, 2) + '\n',
        encoding: 'utf-8',
      }),
    });
    treeItems.push({ path: 'content.json', mode: '100644', type: 'blob', sha: contentBlob.sha });

    for (const p of newPhotos) {
      const blob = await gh(`${base}/git/blobs`, token, {
        method: 'POST',
        body: JSON.stringify({ content: p.data, encoding: 'base64' }),
      });
      treeItems.push({ path: p.path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    // 3. New tree, commit, and branch update — one commit for everything
    const tree = await gh(`${base}/git/trees`, token, {
      method: 'POST',
      body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: treeItems }),
    });
    const commit = await gh(`${base}/git/commits`, token, {
      method: 'POST',
      body: JSON.stringify({
        message: 'Content update via admin',
        tree: tree.sha,
        parents: [parentSha],
      }),
    });
    await gh(`${base}/git/refs/heads/${branch}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    });

    return res.status(200).json({ ok: true, commit: commit.sha });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e).slice(0, 300) });
  }
}
