// netlify/functions/search.js
// Proxies recipe search requests to Supabase.
// Environment variables (set in Netlify dashboard):
//   SUPABASE_URL      — your project URL, e.g. https://xxxx.supabase.co
//   SUPABASE_ANON_KEY — the public anon key (read-only RLS applies)

// node-fetch polyfill for local Netlify CLI dev environment
const fetch = globalThis.fetch ?? require('node-fetch');

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

exports.handler = async (event) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(500, { error: 'Supabase env vars not configured' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const {
    ingredients = [],   // array of clean ingredient name strings
    tags        = [],   // array of tag strings to require
    titleQuery  = '',   // free-text title search
    matchCount  = 1,    // minimum matching ingredients
    limit       = 3,    // default: top 3
    offset      = 0,    // for pagination / "load more"
  } = body;

  // Normalise ingredients to lowercase for consistent NER matching
  const nerQuery = ingredients.map(i => i.toLowerCase().trim()).filter(Boolean);

  if (!nerQuery.length) {
    return json(400, { error: 'At least one ingredient is required' });
  }

  // Call the search_recipes Postgres function via Supabase REST rpc endpoint
  const url = `${SUPABASE_URL}/rest/v1/rpc/search_recipes`;
  const payload = {
    p_ner:         nerQuery,
    p_tags:        tags,
    p_title_query: titleQuery,
    p_match_count: matchCount,
    p_limit:       limit,
    p_offset:      offset,
  };

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      return json(res.status, { error: data?.message ?? 'Supabase query failed' });
    }

    return json(200, { recipes: data, offset: offset + data.length });
  } catch (err) {
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