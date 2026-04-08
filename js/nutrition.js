// ──────────────────────────────────────────────
// NUTRITION — USDA SR Legacy dataset via Supabase
// ──────────────────────────────────────────────
// Nutrition data is looked up from the local `nutrition` table
// imported from the USDA SR Legacy dataset — no external API calls.

const NUTRITION_PROXY = '/api/nutrition';

// ── In-memory cache: recipeId → nutrition totals ───────────────────────────
const nutritionCache = {};

// ── Unit → grams conversion ────────────────────────────────────────────────
const UNIT_TO_GRAMS = {
  g: 1, gram: 1, grams: 1,
  kg: 1000,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  lb: 453.59, pound: 453.59, pounds: 453.59,
  ml: 1, milliliter: 1, milliliters: 1,
  l: 1000, liter: 1000, liters: 1000,
  tsp: 4.93, teaspoon: 4.93, teaspoons: 4.93,
  tbsp: 14.79, tablespoon: 14.79, tablespoons: 14.79,
  cup: 236.59, cups: 236.59,
  'fl oz': 29.57,
  clove: 5, cloves: 5,
  piece: 100, pieces: 100,
  slice: 30, slices: 30,
  can: 400, cans: 400,
  bunch: 150, bunches: 150,
  sprig: 2, sprigs: 2,
  pinch: 0.3, pinches: 0.3,
  dash: 0.6, dashes: 0.6,
  fillet: 150, fillets: 150,
  stalk: 40, stalks: 40,
  head: 300, heads: 300,
  strip: 20, strips: 20,
  large: 150, medium: 100, small: 60,
};

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 0.333, '⅔': 0.667, '⅛': 0.125 };

// ── Parse ingredient string into { qty, unit, name } ──────────────────────
function parseIngredient(str) {
  let s = str.trim();
  for (const [g, v] of Object.entries(FRACTIONS)) s = s.replace(g, v + ' ');

  const numRe   = /^([\d]+(?:\.[\d]+)?(?:\s+[\d]+\/[\d]+)?|[\d]+\/[\d]+)\s*/;
  let qty = 1;
  const numMatch = s.match(numRe);
  if (numMatch) {
    const raw = numMatch[1].trim();
    if (raw.includes('/')) {
      const [n, d] = raw.split('/');
      qty = parseFloat(n) / parseFloat(d);
    } else {
      qty = parseFloat(raw);
    }
    s = s.slice(numMatch[0].length);
  }

  s = s.replace(/\(.*?\)/g, '').trim();

  const unitKeys    = Object.keys(UNIT_TO_GRAMS).sort((a, b) => b.length - a.length);
  const unitPattern = new RegExp('^(' + unitKeys.map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b\\s*', 'i');
  let unit = null;
  const unitMatch = s.match(unitPattern);
  if (unitMatch) { unit = unitMatch[1].toLowerCase(); s = s.slice(unitMatch[0].length); }

  s = s.split(',')[0].trim();

  const noise = ['fresh','dried','raw','frozen','cooked','minced','diced','sliced',
                 'chopped','grated','crushed','shredded','peeled','trimmed','rinsed',
                 'drained','halved','beaten','softened','melted','of','the','a','an'];
  s = s.split(/\s+/).filter(w => !noise.includes(w.toLowerCase())).join(' ').trim();

  return { qty, unit, name: s };
}

function toGrams({ qty, unit }) {
  if (!unit) return qty * 100;
  const factor = UNIT_TO_GRAMS[unit.toLowerCase()];
  return factor ? qty * factor : qty * 100;
}

// ── Main: fetch nutrition for all recipe ingredients from Supabase ─────────
async function fetchRecipeNutrition(recipe) {
  if (nutritionCache[recipe.id]) return nutritionCache[recipe.id];

  const ingredients = recipe.ingredients || [];
  if (!ingredients.length) return null;

  // Extract NER terms from ingredient strings for lookup
  const nerTerms = ingredients
    .map(ing => {
      const parsed = parseIngredient(typeof ing === 'string' ? ing : (ing.name || ''));
      return parsed.name.toLowerCase();
    })
    .filter(Boolean);

  if (!nerTerms.length) return null;

  try {
    const res = await fetch(NUTRITION_PROXY, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ner: nerTerms }),
    });

    if (!res.ok) return null;

    const rows = await res.json();
    if (!rows?.length) return null;

    // Build a map of ner_term → nutrition per 100g
    const nerMap = {};
    for (const row of rows) {
      nerMap[row.ner_term] = row;
    }

    // Scale each ingredient's nutrition by its actual quantity in grams
    const totals = { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
    let anyMatched = false;

    for (const ing of ingredients) {
      const ingStr = typeof ing === 'string' ? ing : (ing.name || '');
      const parsed = parseIngredient(ingStr);
      const grams  = toGrams(parsed);
      const key    = parsed.name.toLowerCase();
      const n      = nerMap[key];

      if (!n) continue;
      anyMatched = true;

      const scale = grams / 100;
      totals.calories += (n.calories || 0) * scale;
      totals.protein  += (n.protein  || 0) * scale;
      totals.fat      += (n.fat      || 0) * scale;
      totals.carbs    += (n.carbs    || 0) * scale;
      totals.fiber    += (n.fiber    || 0) * scale;
    }

    if (!anyMatched) return null;

    const result = {
      calories: Math.round(totals.calories),
      protein:  Math.round(totals.protein),
      fat:      Math.round(totals.fat),
      carbs:    Math.round(totals.carbs),
      fiber:    Math.round(totals.fiber),
    };

    nutritionCache[recipe.id] = result;
    return result;

  } catch (err) {
    console.warn('[nutrition] lookup failed:', err.message);
    return null;
  }
}