// netlify/functions/search.js
// Proxies recipe search requests to Supabase.
// Environment variables (set in Netlify dashboard):
//   SUPABASE_URL      — your project URL, e.g. https://xxxx.supabase.co
//   SUPABASE_ANON_KEY — the public anon key (read-only RLS applies)

let fetch;
try {
  fetch = globalThis.fetch ?? require('node-fetch').default ?? require('node-fetch');
} catch (e) {
  // node-fetch not installed — will fail with a clear error at request time
  fetch = globalThis.fetch;
}

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

exports.handler = async (event) => {
  // Log env var state for debugging
  console.log('[search] SUPABASE_URL set:', !!SUPABASE_URL);
  console.log('[search] SUPABASE_ANON_KEY set:', !!SUPABASE_ANON_KEY);
  console.log('[search] fetch available:', typeof fetch === 'function');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(500, { error: 'Supabase env vars not configured — check your .env file' });
  }

  if (typeof fetch !== 'function') {
    return json(500, { error: 'fetch not available — run: npm install node-fetch' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const {
    ingredients = [],
    tags        = [],
    titleQuery  = '',
    matchCount  = 1,
    limit       = 3,
    offset      = 0,
  } = body;

  const nerQuery = ingredients.map(i => i.toLowerCase().trim()).filter(Boolean);

  // ── ID fetch mode — used by renderPinned to restore saved recipes ──────
  if (body.ids && Array.isArray(body.ids)) {
    const ids = body.ids.map(Number).filter(Boolean).slice(0, 50);
    const idFilter = ids.join(',');
    const idUrl = `${SUPABASE_URL}/rest/v1/recipes?select=id,title,ner,tags,ingredients,directions,source,link&id=in.(${idFilter})`;
    try {
      const res  = await fetch(idUrl, { method: 'GET', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } });
      const data = await res.json();
      return json(200, { recipes: Array.isArray(data) ? data : [] });
    } catch (err) {
      return json(502, { error: 'ID fetch failed', detail: err.message });
    }
  }

  if (!nerQuery.length) {
    return json(400, { error: 'At least one ingredient is required' });
  }

  // Direct REST query using GIN index on ner[] — faster than RPC for large tables
  // cs = "contains" operator — matches rows where ner array contains ANY of the terms
  const nerFilter = nerQuery.map(n => `"${n}"`).join(',');
  const queryUrl  = `${SUPABASE_URL}/rest/v1/recipes?select=id,title,ner,tags,ingredients,directions,source,link&ner=ov.{${encodeURIComponent(nerFilter)}}&limit=20&offset=${offset}`;

  console.log('[search] querying:', queryUrl);

  try {
    const res = await fetch(queryUrl, {
      method:  'GET',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    const data = await res.json();
    console.log('[search] Supabase status:', res.status, 'results:', Array.isArray(data) ? data.length : data);

    if (!res.ok) {
      return json(res.status, { error: data?.message ?? 'Supabase query failed', detail: data });
    }

    // Add a basic match_score (count of matching ner terms) client-side
    const scored = (Array.isArray(data) ? data : []).map(row => ({
      ...row,
      match_score: (row.ner || []).filter(n => nerQuery.includes(n)).length,
    }));

    // Sort by match_score descending
    scored.sort((a, b) => b.match_score - a.match_score);

    return json(200, { recipes: scored, offset: offset + scored.length });
  } catch (err) {
    console.error('[search] fetch error:', err.message);
    return json(502, { error: 'Search request failed', detail: err.message });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}