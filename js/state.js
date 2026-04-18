// ──────────────────────────────────────────────
// STATE — shared mutable application state
// ──────────────────────────────────────────────

function safeRead(key, fallback, validator) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    if (validator && !validator(parsed)) {
      console.warn(`[state] Corrupt localStorage key "${key}" — resetting.`);
      localStorage.removeItem(key);
      return fallback;
    }
    return parsed;
  } catch (e) {
    console.warn(`[state] Failed to parse localStorage key "${key}" — resetting.`, e.message);
    localStorage.removeItem(key);
    return fallback;
  }
}

const isArrayOfStrings  = v => Array.isArray(v) && v.every(x => typeof x === 'string');
const isArrayOfIntegers = v => Array.isArray(v) && v.every(x => Number.isInteger(x));
// Ingredients are now objects { name, qty, unit } — validate shape
const isIngredientArray = v => Array.isArray(v) && v.every(x =>
  x && typeof x === 'object' && typeof x.name === 'string'
);

// Migrate legacy string array → object array
function migrateIngredients(raw) {
  const parsed = safeRead('savr_ingredients', [], v => Array.isArray(v));
  if (!parsed.length) return [];
  // If already objects, validate and return
  if (typeof parsed[0] === 'object') return isIngredientArray(parsed) ? parsed : [];
  // Legacy strings — convert to objects with no qty/unit
  return parsed.map(name => ({ name, qty: '', unit: '' }));
}

let ingredients    = migrateIngredients();
let pinned         = safeRead('savr_pinned', [], isArrayOfIntegers);
let currentRecipes = [];
let currentModalId = null;
let aiResponseIndex = 0;