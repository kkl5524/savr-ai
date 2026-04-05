// ──────────────────────────────────────────────
// NUTRITION — USDA FoodData Central integration
// ──────────────────────────────────────────────
// Requests go through /api/nutrition/* which Netlify rewrites to a
// serverless function that injects the API key server-side.
// Set FDC_API_KEY in: Netlify dashboard → Site → Environment variables
const FDC_PROXY = '/api/nutrition';

// Nutrient IDs used by FDC
const NID = { protein: 203, fat: 204, carbs: 205, fiber: 291, calories: 208 };

// ── Unit → grams conversion table ─────────────
// All values are approximate; weights vary by ingredient density.
// For volume units we use water-equivalent density as a baseline —
// the FDC lookup on the actual food corrects for density at scaling time.
const UNIT_TO_GRAMS = {
  // weight
  g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  lb: 453.59, pound: 453.59, pounds: 453.59,
  // volume (water-density baseline)
  ml: 1, milliliter: 1, milliliters: 1,
  l: 1000, liter: 1000, liters: 1000,
  tsp: 4.93, teaspoon: 4.93, teaspoons: 4.93,
  tbsp: 14.79, tablespoon: 14.79, tablespoons: 14.79,
  cup: 236.59, cups: 236.59,
  'fl oz': 29.57, 'fluid oz': 29.57,
  // counts — assign a typical gram weight per unit
  clove: 5, cloves: 5,           // garlic
  piece: 100, pieces: 100,
  slice: 30, slices: 30,
  can: 400, cans: 400,           // standard 400g/14oz tin
  bunch: 150, bunches: 150,
  sprig: 2, sprigs: 2,
  pinch: 0.3, pinches: 0.3,
  dash: 0.6, dashes: 0.6,
  fillet: 150, fillets: 150,
  stalk: 40, stalks: 40,
  head: 300, heads: 300,         // e.g. garlic head
  ear: 90, ears: 90,             // corn
  strip: 20, strips: 20,
  large: 150, medium: 100, small: 60,
};

// Fraction glyphs → decimal
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 0.333, '⅔': 0.667, '⅛': 0.125 };

// ── Parse an ingredient string into { qty, unit, name } ──
// Handles: "2 cups broccoli florets", "½ tsp salt",
//          "3 cloves garlic, minced", "1 can (400g) chickpeas"
function parseIngredient(str) {
  let s = str.trim();

  // Replace fraction glyphs
  for (const [glyph, val] of Object.entries(FRACTIONS)) {
    s = s.replace(glyph, val + ' ');
  }

  // Match leading number(s): "2", "1.5", "2 1/2", "1/3"
  const numRe = /^([\d]+(?:\.[\d]+)?(?:\s+[\d]+\/[\d]+)?|[\d]+\/[\d]+)\s*/;
  let qty = 1;
  const numMatch = s.match(numRe);
  if (numMatch) {
    const raw = numMatch[1].trim();
    if (raw.includes('/')) {
      // plain fraction e.g. "1/3"
      const [n, d] = raw.split('/');
      qty = parseFloat(n) / parseFloat(d);
    } else if (/\s/.test(raw)) {
      // mixed number e.g. "2 1/2" → already split above, handle
      const parts = raw.split(/\s+/);
      const whole = parseFloat(parts[0]);
      const [fn, fd] = parts[1].split('/');
      qty = whole + parseFloat(fn) / parseFloat(fd);
    } else {
      qty = parseFloat(raw);
    }
    s = s.slice(numMatch[0].length);
  }

  // Remove parenthetical weight annotations like "(400g)" or "(14 oz)"
  s = s.replace(/\(.*?\)/g, '').trim();

  // Match unit
  const unitKeys = Object.keys(UNIT_TO_GRAMS).sort((a, b) => b.length - a.length);
  const unitPattern = new RegExp(
    '^(' + unitKeys.map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b\\s*',
    'i'
  );
  let unit = null;
  const unitMatch = s.match(unitPattern);
  if (unitMatch) {
    unit = unitMatch[1].toLowerCase();
    s = s.slice(unitMatch[0].length);
  }

  // Remove preparation notes after comma: "garlic, minced" → "garlic"
  s = s.split(',')[0].trim();

  // Remove trailing qualifiers: "fresh", "dried", "raw", "chopped", etc.
  const noise = ['fresh', 'dried', 'raw', 'frozen', 'cooked', 'minced', 'diced', 'sliced',
                 'chopped', 'grated', 'crushed', 'shredded', 'peeled', 'trimmed', 'rinsed',
                 'drained', 'halved', 'beaten', 'softened', 'melted', 'packed', 'heaping',
                 'of', 'the', 'a', 'an'];
  s = s.split(/\s+/).filter(w => !noise.includes(w.toLowerCase())).join(' ').trim();

  return { qty, unit, name: s };
}

// ── Convert parsed qty+unit to grams ───────────
function toGrams({ qty, unit }) {
  if (!unit) return qty * 100; // unitless count → assume ~100g each
  const factor = UNIT_TO_GRAMS[unit.toLowerCase()];
  return factor ? qty * factor : qty * 100;
}

// ── In-memory cache: fdcId → nutrient data ─────
const fdcCache = {};

// ── Search FDC for best food match ─────────────
async function searchFDC(name) {
  const params = new URLSearchParams({
    query: name,
    dataType: 'Foundation,SR Legacy',
    pageSize: 1,
  });
  const res = await fetch(`${FDC_PROXY}/foods/search?${params}`);
  if (!res.ok) throw new Error(`FDC search failed: ${res.status}`);
  const data = await res.json();
  return data.foods?.[0]?.fdcId ?? null;
}

// ── Fetch nutrient details for an fdcId ────────
async function fetchNutrients(fdcId) {
  if (fdcCache[fdcId]) return fdcCache[fdcId];
  const ids = Object.values(NID).join(',');
  const res = await fetch(`${FDC_PROXY}/food/${fdcId}?nutrients=${ids}`);
  if (!res.ok) throw new Error(`FDC details failed: ${res.status}`);
  const data = await res.json();

  // Map nutrient ID → value per 100g
  const map = {};
  for (const n of (data.foodNutrients || [])) {
    // Foundation / SR Legacy use .nutrient.id; branded uses .nutrientId
    const nid = n.nutrient?.id ?? n.nutrientId;
    const val = n.amount ?? n.value ?? 0;
    map[nid] = val;
  }

  const result = {
    caloriesPer100g: map[NID.calories] ?? null,
    proteinPer100g:  map[NID.protein]  ?? null,
    fatPer100g:      map[NID.fat]      ?? null,
    carbsPer100g:    map[NID.carbs]    ?? null,
    fiberPer100g:    map[NID.fiber]    ?? null,
  };

  // If all values are null or zero the FDC returned no useful data — don't cache garbage
  const hasData = Object.values(result).some(v => v != null && v > 0);
  if (!hasData) return null;

  fdcCache[fdcId] = result;
  return result;
}

// ── Main: fetch + sum nutrition for all ingredients ──
// Returns { calories, protein, fat, carbs, fiber } all rounded integers.
// Falls back to recipe's static .nutrition on any error.
async function fetchRecipeNutrition(recipe) {
  const totals = { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };

  const results = await Promise.allSettled(
    recipe.ingredients.map(async (ing) => {
      const parsed = parseIngredient(ing);
      const grams  = toGrams(parsed);

      const fdcId = await searchFDC(parsed.name);
      if (!fdcId) return null;

      const n = await fetchNutrients(fdcId);
      const scale = grams / 100;

      return {
        calories: n.caloriesPer100g * scale,
        protein:  n.proteinPer100g  * scale,
        fat:      n.fatPer100g      * scale,
        carbs:    n.carbsPer100g    * scale,
        fiber:    n.fiberPer100g    * scale,
      };
    })
  );

  let anySucceeded = false;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      anySucceeded = true;
      totals.calories += r.value.calories;
      totals.protein  += r.value.protein;
      totals.fat      += r.value.fat;
      totals.carbs    += r.value.carbs;
      totals.fiber    += r.value.fiber;
    }
  }

  if (!anySucceeded) return null; // signal caller to use fallback

  return {
    calories: Math.round(totals.calories),
    protein:  Math.round(totals.protein),
    fat:      Math.round(totals.fat),
    carbs:    Math.round(totals.carbs),
    fiber:    Math.round(totals.fiber),
  };
}