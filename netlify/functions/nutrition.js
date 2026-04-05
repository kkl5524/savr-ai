// Netlify serverless function — proxies requests to USDA FoodData Central.
// FDC_API_KEY is set in Netlify dashboard → Environment variables.
//
// CRASH CASE 2 MITIGATION: API flooding / rate exhaustion

const fetch = globalThis.fetch ?? require('node-fetch');
// ─────────────────────────────────────────────────────────
// Vulnerability: each recipe modal fires one FDC search + one FDC detail
// request per ingredient (up to 12+). A bot or a user rapidly opening modals
// can exhaust the FDC rate limit (30 req/hr on DEMO_KEY, 1000/hr on a real key)
// and Netlify's function invocation budget. The nutrition proxy has no guards.
//
// Attack to reproduce:
//   for (let i = 0; i < 200; i++) fetch('/api/nutrition/foods/search?query=garlic')
//   → 429 from FDC within seconds; all nutrition lookups fail globally.
//
// Mitigations implemented:
//   1. Per-IP rate limit: max 60 nutrition requests per 15-minute window,
//      tracked in a module-level Map (persists across warm invocations).
//   2. Allowlist: only /foods/search and /food/{numeric-id} paths are
//      forwarded — arbitrary path traversal to other FDC endpoints is blocked.
//   3. Query param sanitisation: only the expected params (query, dataType,
//      pageSize, nutrients) are forwarded — injection of api_key overrides
//      or other params is stripped.
//   4. Timeout: requests to FDC are aborted after 8 seconds to prevent
//      Netlify function timeouts from cascading.

const FDC_BASE          = 'https://api.nal.usda.gov/fdc/v1';
const RATE_WINDOW_MS    = 15 * 60 * 1000;  // 15 minutes
const RATE_LIMIT        = 60;               // requests per window per IP
const REQUEST_TIMEOUT   = 8000;             // ms

// Module-level store — survives warm Lambda invocations
const ipWindows = new Map(); // ip → { count, windowStart }

function getRateLimitKey(event) {
  // Netlify sets the real client IP in x-nf-client-connection-ip
  return event.headers?.['x-nf-client-connection-ip']
      || event.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
      || 'unknown';
}

function checkRateLimit(ip) {
  const now    = Date.now();
  const record = ipWindows.get(ip);

  if (!record || now - record.windowStart > RATE_WINDOW_MS) {
    ipWindows.set(ip, { count: 1, windowStart: now });
    return true; // allowed
  }

  if (record.count >= RATE_LIMIT) return false; // blocked

  record.count++;
  return true; // allowed
}

// Only allow these two path patterns
const ALLOWED_PATHS = [
  /^foods\/search$/,
  /^food\/\d+$/,
];

// Only forward these query params — anything else is stripped
const ALLOWED_PARAMS = new Set(['query', 'dataType', 'pageSize', 'nutrients', 'pageNumber']);

exports.handler = async (event) => {
  const apiKey = process.env.FDC_API_KEY;
  if (!apiKey) {
    return json(500, { error: 'FDC_API_KEY environment variable not set' });
  }

  // ── Rate limit check ──────────────────────────────────────────────────────
  const ip = getRateLimitKey(event);
  if (!checkRateLimit(ip)) {
    return json(429, { error: 'Too many nutrition requests — please wait a moment.' });
  }

  // ── Path allowlist ────────────────────────────────────────────────────────
  const subpath = event.path.replace(/^\/?api\/nutrition\/?/, '').replace(/^\//, '');
  if (!subpath || !ALLOWED_PATHS.some(re => re.test(subpath))) {
    return json(400, { error: 'Invalid FDC path' });
  }

  // ── Query param sanitisation ──────────────────────────────────────────────
  const rawParams = event.queryStringParameters || {};
  const safeParams = new URLSearchParams();
  for (const [k, v] of Object.entries(rawParams)) {
    if (ALLOWED_PARAMS.has(k)) safeParams.set(k, v);
  }
  safeParams.set('api_key', apiKey);

  const url = `${FDC_BASE}/${subpath}?${safeParams.toString()}`;

  // ── Fetch with timeout ─────────────────────────────────────────────────────
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const body = await response.text();
    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body,
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return json(504, { error: 'FDC request timed out' });
    }
    return json(502, { error: 'FDC request failed', detail: err.message });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}