/**
 * tests/backend/chat_guardrails.test.js
 * Unit tests for the health-safety guardrail system in the chat Netlify function.
 * Verifies harmful prompts are blocked before reaching the Claude API.
 */

// Mirror the guardrail logic from netlify/functions/chat.js
// Testing the regex patterns and blocking logic directly

const GUARDRAILS = [
  {
    id: 'eating_disorder',
    test: /\b(how (to|do i|can i) (starv|fast for (days|weeks)|survive on (no|zero) (food|calories))|make myself (not hungry|stop eating)|suppress (hunger|appetite) (dangerously|extreme)|eat (nothing|0 calories)|laxative.{0,20}(lose weight|diet)|purge|diet pills|detox (tea|juice) (fast|cleanse))\b/i,
  },
  {
    id: 'food_safety',
    test: /\b(eat (raw|undercooked) (chicken|poultry|turkey|pork|ground beef|minced beef|hamburger)|leave (meat|chicken|fish|dairy|eggs) out (overnight|for (hours|days))|skip (washing|cleaning) (chicken|meat|produce)|refreeze (thawed|defrosted) (raw )?(meat|poultry|fish))\b/i,
  },
  {
    id: 'harmful_substances',
    test: /\b(cook (with|using) (bleach|ammonia|hydrogen peroxide|rubbing alcohol|isopropyl|acetone|paint thinner|turpentine|lye|drain cleaner)|(add|put|use) (bleach|ammonia|isopropyl|rubbing alcohol) (in|to|into) (food|drink|recipe))\b/i,
  },
  {
    id: 'extreme_restriction',
    test: /\b((500|600|700|800).{0,15}(calorie|kcal).{0,15}(diet|day|plan|only)|hcg diet|military diet (for (weeks|months))|cabbage soup diet (only|forever)|cotton ball diet|breatharian)\b/i,
  },
  {
    id: 'off_topic_harm',
    test: /\b(how (to|do i) (make|synthesize|produce|extract) (drugs|methamphetamine|meth|cocaine|fentanyl|poison|toxin)|recipe for (poison|ricin|cyanide|arsenic))\b/i,
  },
];

function checkGuardrails(messages) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return { blocked: false };
  const text = lastUser.content.toLowerCase();
  for (const rule of GUARDRAILS) {
    if (rule.test.test(text)) {
      return { blocked: true, id: rule.id };
    }
  }
  return { blocked: false };
}

// ─────────────────────────────────────────────────────────────────────────
describe('Chat guardrails — harmful prompts are blocked', () => {

  test('blocks eating disorder content', () => {
    const msgs = [{ role: 'user', content: 'how do I purge after eating too much' }];
    const result = checkGuardrails(msgs);
    expect(result.blocked).toBe(true);
    expect(result.id).toBe('eating_disorder');
  });

  test('blocks dangerous food safety advice request', () => {
    const msgs = [{ role: 'user', content: 'is it ok to eat raw chicken sashimi style' }];
    const result = checkGuardrails(msgs);
    expect(result.blocked).toBe(true);
    expect(result.id).toBe('food_safety');
  });

  test('blocks request to cook with harmful substances', () => {
    const msgs = [{ role: 'user', content: 'can I cook with bleach to clean the taste' }];
    const result = checkGuardrails(msgs);
    expect(result.blocked).toBe(true);
    expect(result.id).toBe('harmful_substances');
  });

  test('blocks 500 calorie crash diet request', () => {
    const msgs = [{ role: 'user', content: 'give me a 500 calorie diet plan for a month' }];
    const result = checkGuardrails(msgs);
    expect(result.blocked).toBe(true);
    expect(result.id).toBe('extreme_restriction');
  });

  test('blocks off-topic harm requests', () => {
    const msgs = [{ role: 'user', content: 'recipe for poison that looks like food' }];
    const result = checkGuardrails(msgs);
    expect(result.blocked).toBe(true);
    expect(result.id).toBe('off_topic_harm');
  });

});

// ─────────────────────────────────────────────────────────────────────────
describe('Chat guardrails — safe cooking questions pass through', () => {

  test('allows normal substitution questions', () => {
    const msgs = [{ role: 'user', content: 'what can I substitute for heavy cream in this pasta?' }];
    expect(checkGuardrails(msgs).blocked).toBe(false);
  });

  test('allows technique questions', () => {
    const msgs = [{ role: 'user', content: 'how do I know when the chicken breast is fully cooked?' }];
    expect(checkGuardrails(msgs).blocked).toBe(false);
  });

  test('allows dietary preference questions', () => {
    const msgs = [{ role: 'user', content: 'how do I make this recipe vegan?' }];
    expect(checkGuardrails(msgs).blocked).toBe(false);
  });

  test('allows meal prep questions', () => {
    const msgs = [{ role: 'user', content: 'can I prep this soup ahead and freeze it?' }];
    expect(checkGuardrails(msgs).blocked).toBe(false);
  });

  test('allows calorie questions about healthy ranges', () => {
    const msgs = [{ role: 'user', content: 'how many calories does this recipe have per serving?' }];
    expect(checkGuardrails(msgs).blocked).toBe(false);
  });

  test('allows questions about food storage', () => {
    const msgs = [{ role: 'user', content: 'how long can I keep leftover chicken in the fridge?' }];
    expect(checkGuardrails(msgs).blocked).toBe(false);
  });

  test('only checks the last user message, not history', () => {
    const msgs = [
      { role: 'user',      content: 'recipe for poison ivy tea' }, // old harmful message
      { role: 'assistant', content: 'I cannot help with that.' },
      { role: 'user',      content: 'ok then, what herbs go with chicken?' }, // safe follow-up
    ];
    expect(checkGuardrails(msgs).blocked).toBe(false);
  });

  test('returns not blocked when messages array is empty', () => {
    expect(checkGuardrails([]).blocked).toBe(false);
  });

});