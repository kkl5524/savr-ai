/**
 * tests/backend/search.test.js
 * Backend unit tests for the search Netlify function.
 * Uses Jest mocks — no real network calls, no real Supabase needed.
 */

// ── Set required env vars before the module loads ─────────────────────────
process.env.SUPABASE_URL      = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

// ── Mock fetch globally ───────────────────────────────────────────────────
global.fetch = jest.fn();

const { handler } = require('../../netlify/functions/search');

// Helper to build a fake Netlify event
function makeEvent(body, method = 'POST') {
  return {
    httpMethod: method,
    body:       JSON.stringify(body),
    headers:    {},
    queryStringParameters: {},
  };
}

// Helper to parse handler response
function parseResponse(res) {
  return {
    status: res.statusCode,
    body:   JSON.parse(res.body),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────
describe('Search handler — input validation', () => {

  test('returns 400 when no ingredients provided', async () => {
    const res = await handler(makeEvent({ ingredients: [] }));
    const { status, body } = parseResponse(res);

    expect(status).toBe(400);
    expect(body.error).toMatch(/ingredient/i);
  });

  test('returns 400 when body is invalid JSON', async () => {
    const res = await handler({
      httpMethod: 'POST',
      body: 'not valid json {{',
      headers: {},
      queryStringParameters: {},
    });
    const { status, body } = parseResponse(res);

    expect(status).toBe(400);
    expect(body.error).toMatch(/invalid json/i);
  });

  test('normalises ingredient terms to lowercase', async () => {
    // Mock Supabase returning empty array
    global.fetch.mockResolvedValueOnce({
      ok:     true,
      status: 200,
      json:   async () => [],
    });

    await handler(makeEvent({ ingredients: ['GARLIC', 'Chicken', 'OLIVE OIL'] }));

    // Verify the URL constructed contains lowercase terms
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('garlic');
    expect(calledUrl).toContain('chicken');
    expect(calledUrl).not.toContain('GARLIC');
  });

});

// ─────────────────────────────────────────────────────────────────────────
describe('Search handler — Supabase response handling', () => {

  test('returns recipes with match_score calculated correctly', async () => {
    const mockRecipes = [
      { id: 1, title: 'Garlic Chicken', ner: ['garlic', 'chicken', 'lemon'], tags: [], ingredients: [], directions: [], source: null, link: null },
      { id: 2, title: 'Pasta',          ner: ['pasta', 'garlic'],             tags: [], ingredients: [], directions: [], source: null, link: null },
    ];

    global.fetch.mockResolvedValueOnce({
      ok:     true,
      status: 200,
      json:   async () => mockRecipes,
    });

    const res = await handler(makeEvent({ ingredients: ['garlic', 'chicken'] }));
    const { status, body } = parseResponse(res);

    expect(status).toBe(200);
    expect(body.recipes).toHaveLength(2);

    // Garlic Chicken matches both ingredients → score 2
    // Pasta matches only garlic → score 1
    // So Garlic Chicken should come first
    expect(body.recipes[0].id).toBe(1);
    expect(body.recipes[0].match_score).toBe(2);
    expect(body.recipes[1].match_score).toBe(1);
  });

  test('returns 502 when Supabase fetch throws', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network timeout'));

    const res = await handler(makeEvent({ ingredients: ['garlic'] }));
    const { status, body } = parseResponse(res);

    expect(status).toBe(502);
    expect(body.error).toMatch(/search request failed/i);
  });

  test('handles Supabase error response gracefully', async () => {
    global.fetch.mockResolvedValueOnce({
      ok:     false,
      status: 500,
      json:   async () => ({ message: 'relation does not exist' }),
    });

    const res = await handler(makeEvent({ ingredients: ['garlic'] }));
    const { status, body } = parseResponse(res);

    expect(status).toBe(500);
    expect(body.error).toMatch(/relation does not exist/i);
  });

  test('returns empty recipes array when Supabase returns empty', async () => {
    global.fetch.mockResolvedValueOnce({
      ok:     true,
      status: 200,
      json:   async () => [],
    });

    const res = await handler(makeEvent({ ingredients: ['truffles'] }));
    const { status, body } = parseResponse(res);

    expect(status).toBe(200);
    expect(body.recipes).toEqual([]);
    expect(body.offset).toBe(0);
  });

});

// ─────────────────────────────────────────────────────────────────────────
describe('Search handler — ID fetch mode', () => {

  test('fetches recipes by ID array when ids provided', async () => {
    const mockRecipes = [
      { id: 42, title: 'Tomato Soup', ner: ['tomato'], tags: [], ingredients: [], directions: [], source: null, link: null },
    ];

    global.fetch.mockResolvedValueOnce({
      ok:     true,
      status: 200,
      json:   async () => mockRecipes,
    });

    const res = await handler(makeEvent({ ids: [42] }));
    const { status, body } = parseResponse(res);

    expect(status).toBe(200);
    expect(body.recipes[0].id).toBe(42);

    // Verify URL uses id=in.() filter not ner overlay
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('id=in.(42)');
  });

  test('caps ID fetch at 50 IDs to prevent abuse', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => [],
    });

    const ids = Array.from({ length: 100 }, (_, i) => i + 1);
    await handler(makeEvent({ ids }));

    const calledUrl = global.fetch.mock.calls[0][0];
    // Should only include 50 IDs in the URL
    const match = calledUrl.match(/id=in\.\(([^)]+)\)/);
    const idCount = match ? match[1].split(',').length : 0;
    expect(idCount).toBe(50);
  });

});