// netlify/functions/chat.js
// Proxies chat requests to Anthropic Claude.
// Keeps the API key server-side — never exposed to the browser.
// Implements content guardrails aligned with FDA, CDC, NIH, and
// USDA Dietary Guidelines for Americans (2020-2025).
//
// POST /api/chat
// Body: { messages: [{role, content}], system: string, allergens: string[] }

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL      = 'claude-haiku-4-5-20251001'; // fast + cheap for chat
const MAX_BODY_BYTES    = 16 * 1024;

let fetch;
try {
  fetch = globalThis.fetch ?? require('node-fetch').default ?? require('node-fetch');
} catch (e) {
  fetch = globalThis.fetch;
}

// ── Guardrail keyword patterns ────────────────────────────────────────────
const GUARDRAILS = [
  {
    id: 'eating_disorder',
    test: /\b(how (to|do i|can i) (starv|fast for (days|weeks)|survive on (no|zero) (food|calories))|make myself (not hungry|stop eating)|suppress (hunger|appetite) (dangerously|extreme)|eat (nothing|0 calories)|laxative.{0,20}(lose weight|diet)|purge|diet pills|detox (tea|juice) (fast|cleanse))\b/i,
    refusal: "I'm not able to help with that. Extreme restriction, fasting beyond medically supervised periods, or purging behaviors are associated with serious health risks. If you're struggling with your relationship with food, the National Eating Disorders Association helpline is available at 1-800-931-2237. I'm here to help you cook balanced, enjoyable meals.",
  },
  {
    id: 'food_safety',
    test: /\b(eat (raw|undercooked) (chicken|poultry|turkey|pork|ground beef|minced beef|hamburger)|leave (meat|chicken|fish|dairy|eggs) out (overnight|for (hours|days))|skip (washing|cleaning) (chicken|meat|produce)|refreeze (thawed|defrosted) (raw )?(meat|poultry|fish))\b/i,
    refusal: "I can't recommend that — it would create a food safety risk. The USDA and FDA require chicken and poultry to reach 165°F (74°C) internally, ground beef 160°F (71°C), and pork 145°F (63°C) to destroy harmful bacteria like Salmonella and E. coli. I'm happy to suggest safe cooking methods that still produce great results.",
  },
  {
    id: 'canning_safety',
    test: /\b(can (meat|fish|chicken|beans|vegetables|low.acid) (without|no) (pressure|pressure canner)|skip (pressure|processing) (for|when) canning|water bath (can|canning) (meat|fish|poultry|beans|corn|carrots|green beans))\b/i,
    refusal: "That method isn't safe. The USDA requires pressure canning for all low-acid foods (meat, fish, most vegetables) to prevent Clostridium botulinum — the bacteria that causes botulism. Water bath canning is only safe for high-acid foods like fruits, jams, and pickles. I can walk you through the correct process.",
  },
  {
    id: 'harmful_substances',
    test: /\b(cook (with|using) (bleach|ammonia|hydrogen peroxide|rubbing alcohol|isopropyl|acetone|paint thinner|turpentine|lye|drain cleaner)|(add|put|use) (bleach|ammonia|isopropyl|rubbing alcohol) (in|to|into) (food|drink|recipe)|(essential oil|tea tree|eucalyptus).{0,30}(ingest|eat|drink|consume|cook with))\b/i,
    refusal: "I can't help with that. Those substances are toxic and not safe to ingest or use in food preparation. If you've been exposed to a harmful substance, contact Poison Control at 1-800-222-1222. I'm happy to suggest safe flavor-enhancing techniques instead.",
  },
  {
    id: 'extreme_restriction',
    test: /\b((500|600|700|800).{0,15}(calorie|kcal).{0,15}(diet|day|plan|only)|hcg diet|military diet (for (weeks|months))|cabbage soup diet (only|forever)|cotton ball diet|breatharian)\b/i,
    refusal: "I'm not able to recommend very low calorie diets below 800 kcal/day. The NIH advises these should only be followed under direct medical supervision. The USDA Dietary Guidelines recommend at least 1,600 kcal/day for most adults. I can help you create satisfying, nutrient-dense meals within a healthy calorie range.",
  },
  {
    id: 'medical_nutrition',
    test: /\b((diet|food|meal plan) (to|for) (cure|treat|reverse|heal|fix) (diabetes|cancer|kidney disease|renal failure|crohn|colitis|celiac|epilepsy|phenylketonuria|pku)|(ketogenic|renal|dialysis|low.oxalate|low.purine|FODMAP) diet (to cure|instead of (medication|medicine|treatment|chemo)))\b/i,
    refusal: "Managing a medical condition through diet should be overseen by a registered dietitian or your healthcare provider. I can help you cook delicious, generally healthy meals, but for therapeutic dietary advice please consult a qualified professional.",
  },
  {
    id: 'distillation',
    test: /\b(distill (alcohol|spirits|liquor|moonshine) at home|make (methanol|wood alcohol)|home distill(ing|ation))\b/i,
    refusal: "Home distillation of spirits is illegal in most jurisdictions and carries a serious risk of methanol poisoning, which can cause blindness or death. I can help with safe home fermentation like kombucha, beer brewing, or wine making.",
  },
  {
    id: 'off_topic_harm',
    test: /\b(how (to|do i) (make|synthesize|produce|extract) (drugs|methamphetamine|meth|cocaine|fentanyl|poison|toxin)|recipe for (poison|ricin|cyanide|arsenic))\b/i,
    refusal: "I'm a cooking assistant and can only help with food preparation and recipes. I'm not able to help with that request.",
  },
];

function checkGuardrails(messages) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return { blocked: false };
  const text = lastUser.content.toLowerCase();
  for (const rule of GUARDRAILS) {
    if (rule.test.test(text)) {
      console.log(`[chat] guardrail triggered: ${rule.id}`);
      return { blocked: true, refusal: rule.refusal };
    }
  }
  return { blocked: false };
}

const COOKING_SCOPE_ADDENDUM = `

IMPORTANT GUIDELINES — follow these strictly:
1. SCOPE: You are exclusively a cooking and recipe assistant. If asked about anything unrelated to food, cooking, nutrition, or kitchen techniques, politely redirect: "I'm Savr AI and I can only help with cooking and recipes."
2. FOOD SAFETY: Always follow USDA/FDA safe minimum internal temperatures: Poultry 165°F/74°C, Ground meat 160°F/71°C, Whole cuts of beef/pork/lamb 145°F/63°C, Fish 145°F/63°C. Never recommend undercooked poultry, pork, or ground meat.
3. NUTRITION: Align advice with USDA Dietary Guidelines for Americans 2020-2025. Do not recommend diets below 1,200 kcal/day without noting medical supervision is required.
4. ALLERGENS: Always flag the 9 FDA major allergens when relevant: milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soybeans, sesame.
5. MEDICAL: Do not prescribe therapeutic diets for medical conditions. Always recommend consulting a registered dietitian or doctor for medical nutrition therapy.`;

exports.handler = async (event) => {
  console.log('[chat] handler called, method:', event.httpMethod);
  console.log('[chat] ANTHROPIC_API_KEY set:', !!ANTHROPIC_API_KEY);

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  if (!ANTHROPIC_API_KEY) {
    return json(500, { error: 'ANTHROPIC_API_KEY not configured' });
  }

  const rawBody = event.body || '{}';
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return json(413, { error: 'Request body too large' });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const { messages = [], system = '', allergens = [] } = body;

  if (!messages.length) {
    return json(400, { error: 'messages array is required' });
  }

  // Guardrail check
  const guard = checkGuardrails(messages);
  if (guard.blocked) {
    return json(200, { reply: guard.refusal, guardrail: true });
  }

  // Build allergen addendum
  const allergenAddendum = allergens.length
    ? `\n\nCRITICAL — USER ALLERGENS: The user is allergic to: ${allergens.join(', ')}. Never suggest, recommend, or include these in any advice. If the current recipe contains these allergens, proactively flag it and suggest safe alternatives.`
    : '';

  const fullSystem = (system || 'You are Savr AI, a friendly expert cooking assistant.') +
    COOKING_SCOPE_ADDENDUM + allergenAddendum;

  try {
    console.log('[chat] calling Anthropic with', messages.length, 'messages');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: 400,
        system:     fullSystem,
        messages:   messages.slice(-20),
      }),
    });

    const data = await res.json();
    console.log('[chat] Anthropic status:', res.status);

    if (!res.ok) {
      console.error('[chat] Anthropic error:', JSON.stringify(data));
      return json(res.status, { error: data?.error?.message ?? 'Anthropic request failed' });
    }

    const reply = data.content?.[0]?.text ?? '';
    return json(200, { reply });

  } catch (err) {
    console.error('[chat] fetch error:', err.message);
    return json(502, { error: 'Chat request failed', detail: err.message });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}