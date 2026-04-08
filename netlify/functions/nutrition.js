// netlify/functions/nutrition.js
// Looks up nutrition data from the USDA SR Legacy dataset in Supabase.
// No external API calls — all data is local to your Supabase project.
//
// POST /api/nutrition
// Body: { ner: ['garlic', 'chicken', 'olive oil'] }
// Returns: array of { ner_term, fdc_id, description, calories, protein, fat, carbs, fiber }

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY    = process.env.SUPABASE_ANON_KEY;

let fetch;
try {
  fetch = globalThis.fetch ?? require('node-fetch').default ?? require('node-fetch');
} catch (e) {
  fetch = globalThis.fetch;
}

exports.handler = async (event) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(500, { error: 'Supabase env vars not configured' });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const { ner = [] } = body;
  if (!ner.length) return json(400, { error: 'ner array is required' });

  // Cap at 20 terms to prevent abuse
  const nerTerms = ner.slice(0, 20).map(t => String(t).toLowerCase().trim()).filter(Boolean);

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_recipe_nutrition`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_ner: nerTerms }),
    });

    const data = await res.json();
    if (!res.ok) {
      return json(res.status, { error: data?.message ?? 'Nutrition lookup failed' });
    }

    return json(200, data);
  } catch (err) {
    console.error('[nutrition] error:', err.message);
    return json(502, { error: 'Nutrition lookup failed', detail: err.message });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}