// ──────────────────────────────────────────────
// CHAT — floating AI chef panel
// Context-aware: recipe modal, recipe step, or meal plan
// ──────────────────────────────────────────────

// Chat state
let _chatOpen    = false;
let _chatContext = null;   // { type: 'recipe'|'step'|'mealplan', recipe?, step?, plan? }
let _chatHistory = [];     // [{ role, content }]

// ── Open / close ──────────────────────────────────────────────────────────
function openAiChat(withWelcome = false) {
  _chatOpen = true;
  document.getElementById('ai-chat-panel').classList.add('open');
  document.getElementById('ai-chat-bubble').classList.add('open');

  // Show welcome message if no context and no messages yet
  const messages = document.getElementById('ai-chat-messages');
  if (withWelcome && messages && !messages.children.length) {
    document.getElementById('ai-chat-context-label').textContent = 'General cooking help';
    appendAiMessage('ai', 'Hi! I\'m Savr AI. Open a recipe and click **? Ask AI** to ask about a specific recipe or step. Or just ask me anything about cooking!');
  }

  setTimeout(() => document.getElementById('ai-chat-input')?.focus(), 50);
}

function toggleAiChat(e) {
  if (e) e.stopPropagation();
  if (_chatOpen) {
    closeAiChat();
  } else {
    openAiChat(true); // show welcome if first open
  }
}

function closeAiChat() {
  _chatOpen = false;
  document.getElementById('ai-chat-panel').classList.remove('open');
  document.getElementById('ai-chat-bubble').classList.remove('open');
}

// ── Context-specific entry points ─────────────────────────────────────────
function openAiChatForRecipe(recipe) {
  _chatContext = { type: 'recipe', recipe };
  _chatHistory = [];
  document.getElementById('ai-chat-context-label').textContent = `About: ${recipe.name}`;
  clearAiMessages();
  appendAiMessage('ai', `I'm looking at **${recipe.name}**. Ask me anything — substitutions, technique, dietary tweaks, or how to scale it up.`);
  _chatOpen = false; // force re-open
  openAiChat();
}

function openAiChatForStep(stepText) {
  const recipe = currentModalId ? findRecipe(currentModalId) : null;
  _chatContext = { type: 'step', recipe, step: stepText };
  _chatHistory = [];
  document.getElementById('ai-chat-context-label').textContent =
    recipe ? `Step from: ${recipe.name}` : 'Recipe step';
  const short = stepText.length > 60 ? stepText.slice(0, 60) + '…' : stepText;
  clearAiMessages();
  appendAiMessage('ai', `You're asking about this step:\n\n*"${short}"*\n\nWhat would you like to know?`);
  const input = document.getElementById('ai-chat-input');
  if (input) input.placeholder = 'e.g. How do I know when it\'s done?';
  _chatOpen = false;
  openAiChat();
}

function openAiChatForMealPlan() {
  const saved = typeof loadMealPlan === 'function' ? loadMealPlan() : null;
  _chatContext = { type: 'mealplan', plan: saved?.plan };
  _chatHistory = [];
  document.getElementById('ai-chat-context-label').textContent = 'About your meal plan';
  clearAiMessages();
  appendAiMessage('ai', 'I can see your meal plan. Ask me about nutrition balance, prep tips, swaps, or how to make the week easier.');
  _chatOpen = false;
  openAiChat();
}

// ── Message rendering ─────────────────────────────────────────────────────
function clearAiMessages() {
  const el = document.getElementById('ai-chat-messages');
  if (el) el.innerHTML = '';
  _chatHistory = [];
}

function appendAiMessage(role, text) {
  const el = document.getElementById('ai-chat-messages');
  if (!el) return;

  // Simple markdown: **bold**, *italic*, newlines
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');

  const div = document.createElement('div');
  div.className = `ai-msg ai-msg--${role}`;
  div.innerHTML = `<div class="ai-msg-bubble">${html}</div>`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function appendAiTyping() {
  const el = document.getElementById('ai-chat-messages');
  if (!el) return;
  const div = document.createElement('div');
  div.className = 'ai-msg ai-msg--ai ai-msg--typing';
  div.id = 'ai-typing-indicator';
  div.innerHTML = '<div class="ai-msg-bubble"><span class="ai-typing-dots"><span></span><span></span><span></span></span></div>';
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function removeAiTyping() {
  document.getElementById('ai-typing-indicator')?.remove();
}

// ── Build system prompt from context ──────────────────────────────────────
function buildSystemPrompt() {
  const base = 'You are Savr AI, a friendly expert cooking assistant embedded in a recipe app. Be concise, practical, and specific. Never give generic advice — always relate to the actual recipe or context provided.';

  if (!_chatContext) return base;

  if (_chatContext.type === 'recipe' && _chatContext.recipe) {
    const r = _chatContext.recipe;
    const ings = (r.ingredients || []).slice(0, 10).join(', ');
    return `${base}\n\nCurrent recipe: "${r.name}"\nIngredients: ${ings}\nSteps: ${(r.instructions || []).length} steps.`;
  }

  if (_chatContext.type === 'step' && _chatContext.step) {
    const r = _chatContext.recipe;
    const recipePart = r ? `Recipe: "${r.name}". ` : '';
    return `${base}\n\n${recipePart}The user is asking about this specific step: "${_chatContext.step}"`;
  }

  if (_chatContext.type === 'mealplan' && _chatContext.plan) {
    const meals = _chatContext.plan
      .flatMap(d => MEAL_SLOTS.map(s => {
        const meal = d.meals[s];
        if (!meal) return null;
        const r = findRecipe(meal.recipeId);
        return r ? `${d.day} ${s}: ${r.name}` : null;
      }).filter(Boolean))
      .join(', ');
    return `${base}\n\nThe user's 7-day meal plan includes: ${meals || 'various recipes'}.`;
  }

  return base;
}

// ── Send message ──────────────────────────────────────────────────────────
async function sendAiChat() {
  const input = document.getElementById('ai-chat-input');
  const text  = input?.value.trim();
  if (!text) return;

  input.value    = '';
  input.disabled = true;

  appendAiMessage('user', text);
  _chatHistory.push({ role: 'user', content: text });

  appendAiTyping();

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 400,
        system:     buildSystemPrompt(),
        messages:   _chatHistory,
      }),
    });

    const data = await res.json();
    const reply = data.content?.[0]?.text ?? 'Sorry, I couldn\'t get a response.';

    removeAiTyping();
    appendAiMessage('ai', reply);
    _chatHistory.push({ role: 'assistant', content: reply });

    // Keep history at max 10 turns to avoid token creep
    if (_chatHistory.length > 20) _chatHistory = _chatHistory.slice(-20);

  } catch (err) {
    removeAiTyping();
    appendAiMessage('ai', 'Sorry, I\'m having trouble connecting right now. Please try again.');
    console.error('[chat]', err);
  } finally {
    input.disabled = false;
    input.focus();
  }
}