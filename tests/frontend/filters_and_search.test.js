/**
 * tests/frontend/filters_and_search.test.js
 * Frontend unit tests for the client-side filter, search, and ingredient logic.
 * Uses jest-environment-jsdom to simulate the browser DOM.
 */

// ── Inline the pure functions under test ─────────────────────────────────
// These are extracted from their respective JS files.
// Since the frontend uses plain global JS (no modules), we copy the
// pure logic functions here to test them in isolation.

// From js/search.js
const STOP_WORDS_SEARCH = new Set([
  'cup','cups','tbsp','tsp','g','kg','ml','oz','lb','clove','cloves',
  'can','cans','bunch','pinch','slice','slices','piece','pieces',
  'large','small','medium','fresh','dried','frozen','raw','whole',
  'of','and','or','the','a','an','to','with','for','in','into',
  'minced','diced','sliced','chopped','grated','crushed','halved',
  'peeled','trimmed','rinsed','drained','cooked','shredded','beaten',
  'taste','needed','optional','divided','packed','heaping','level',
]);

function ingredientToNer(ing) {
  const str = typeof ing === 'string' ? ing : (ing.name || '');
  return str
    .toLowerCase()
    .replace(/[\d¼½¾⅓⅔–\-]+/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS_SEARCH.has(w))
    .join(' ')
    .trim();
}

function coverageScore(recipeNer, userNerSet) {
  if (!recipeNer || recipeNer.length === 0) return 0;
  const matched = recipeNer.filter(n => userNerSet.has(n)).length;
  return matched / recipeNer.length;
}

// From js/ingredients.js
const COMMON_UNITS = ['g','kg','ml','l','oz','lb','cup','cups','tbsp','tsp','piece','pieces','bunch','can','cans','pinch','slice','slices','clove','cloves','fillet','fillets'];

function parseIngredientString(str) {
  const s = str.trim();
  const numMatch = s.match(/^([\d½¼¾⅓⅔⅛]+(?:\.[\d]+)?)\s*/);
  let qty  = '';
  let rest = s;
  if (numMatch) { qty = numMatch[1]; rest = s.slice(numMatch[0].length); }
  const unitPattern = new RegExp('^(' + COMMON_UNITS.join('|') + ')\\b\\s*', 'i');
  const unitMatch   = rest.match(unitPattern);
  let unit = '';
  if (unitMatch) { unit = unitMatch[1].toLowerCase(); rest = rest.slice(unitMatch[0].length); }
  return { name: rest.trim() || s, qty, unit };
}

// From js/mealplan.js
function extractRecipeServings(recipe) {
  const dirs = recipe.instructions || recipe.directions || [];
  const last  = Array.isArray(dirs) ? dirs[dirs.length - 1] : '';
  const text  = [last, recipe.name || ''].join(' ').toLowerCase();
  const patterns = [
    /serves?\s+(\d+)/, /yield[s]?\s+(\d+)/, /makes?\s+(\d+)/,
    /(\d+)\s+serving/, /(\d+)\s+portion/, /for\s+(\d+)\s+people/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return parseInt(m[1]);
  }
  return 4;
}

// From js/grocery.js (simplified store unit logic)
function toStoreUnit_onion(ingStr) {
  // Tests the onion conversion specifically
  const lower = ingStr.toLowerCase();
  if (!lower.includes('onion')) return ingStr;
  // Parse grams roughly
  const tspMatch = lower.match(/(\d+(?:\.\d+)?)\s*tsp/);
  if (tspMatch) {
    const grams = parseFloat(tspMatch[1]) * 4.93;
    if (grams < 80) return 'Small onion';
  }
  const cupMatch = lower.match(/(\d+(?:\.\d+)?)\s*cup/);
  if (cupMatch) {
    const grams = parseFloat(cupMatch[1]) * 236.59;
    if (grams < 150) return 'Medium onion';
    return `${Math.ceil(grams / 200)} × Large onion`;
  }
  return 'Onion';
}

// ─────────────────────────────────────────────────────────────────────────
describe('ingredientToNer — NER term extraction', () => {

  test('extracts food name from quantity + unit + name string', () => {
    expect(ingredientToNer('2 cups chicken breast, minced')).toBe('chicken breast');
  });

  test('extracts single food name', () => {
    expect(ingredientToNer('garlic')).toBe('garlic');
  });

  test('strips numbers and units', () => {
    const result = ingredientToNer('500g beef mince');
    expect(result).toContain('beef');
    expect(result).toContain('mince');
    expect(result).not.toContain('500');
    expect(result).not.toContain('g');
  });

  test('strips stop words', () => {
    const result = ingredientToNer('fresh diced tomatoes');
    expect(result).toContain('tomatoes');
    expect(result).not.toContain('fresh');
    expect(result).not.toContain('diced');
  });

  test('strips parenthetical weight annotations', () => {
    const result = ingredientToNer('1 can (400g) chickpeas');
    expect(result).toContain('chickpeas');
    expect(result).not.toContain('400');
  });

  test('works with ingredient object { name, qty, unit }', () => {
    const result = ingredientToNer({ name: 'Chicken Breast', qty: '2', unit: 'cups' });
    expect(result).toContain('chicken');
    expect(result).toContain('breast');
  });

  test('returns empty string for pure stop words input', () => {
    expect(ingredientToNer('2 cups of the')).toBe('');
  });

  test('handles fraction characters', () => {
    const result = ingredientToNer('½ tsp olive oil');
    expect(result).toContain('olive');
    expect(result).toContain('oil');
  });

});

// ─────────────────────────────────────────────────────────────────────────
describe('coverageScore — recipe ingredient coverage', () => {

  test('returns 1.0 when user has all recipe ingredients', () => {
    const recipeNer  = ['garlic', 'chicken', 'lemon'];
    const userNerSet = new Set(['garlic', 'chicken', 'lemon', 'olive oil']);
    expect(coverageScore(recipeNer, userNerSet)).toBe(1.0);
  });

  test('returns 0 when user has none of the recipe ingredients', () => {
    const recipeNer  = ['truffle', 'lobster', 'saffron'];
    const userNerSet = new Set(['garlic', 'onion']);
    expect(coverageScore(recipeNer, userNerSet)).toBe(0);
  });

  test('returns correct ratio for partial match', () => {
    const recipeNer  = ['garlic', 'chicken', 'lemon', 'butter'];
    const userNerSet = new Set(['garlic', 'chicken']);
    expect(coverageScore(recipeNer, userNerSet)).toBe(0.5);
  });

  test('returns 0 for empty recipe NER', () => {
    expect(coverageScore([], new Set(['garlic']))).toBe(0);
  });

  test('returns 0 for null recipe NER', () => {
    expect(coverageScore(null, new Set(['garlic']))).toBe(0);
  });

});

// ─────────────────────────────────────────────────────────────────────────
describe('parseIngredientString — ingredient parsing', () => {

  test('parses quantity, unit, and name from full string', () => {
    const result = parseIngredientString('500g beef mince');
    expect(result.qty).toBe('500');
    expect(result.unit).toBe('g');
    expect(result.name).toBe('beef mince');
  });

  test('parses cups correctly', () => {
    const result = parseIngredientString('2 cups chicken stock');
    expect(result.qty).toBe('2');
    expect(result.unit).toBe('cups');
    expect(result.name).toBe('chicken stock');
  });

  test('handles ingredient with no quantity or unit', () => {
    const result = parseIngredientString('garlic');
    expect(result.name).toBe('garlic');
    expect(result.qty).toBe('');
    expect(result.unit).toBe('');
  });

  test('handles tbsp unit', () => {
    const result = parseIngredientString('3 tbsp olive oil');
    expect(result.qty).toBe('3');
    expect(result.unit).toBe('tbsp');
    expect(result.name).toBe('olive oil');
  });

  test('parses cloves unit', () => {
    const result = parseIngredientString('4 cloves garlic');
    expect(result.qty).toBe('4');
    expect(result.unit).toBe('cloves');
    expect(result.name).toBe('garlic');
  });

});

// ─────────────────────────────────────────────────────────────────────────
describe('extractRecipeServings — serving size detection', () => {

  test('extracts servings from "Serves 4" in last direction', () => {
    const recipe = { instructions: ['Chop onion.', 'Cook chicken.', 'Serves 4.'], name: '' };
    expect(extractRecipeServings(recipe)).toBe(4);
  });

  test('extracts servings from "Yields 6 servings"', () => {
    const recipe = { instructions: ['Mix everything.', 'Yields 6 servings.'], name: '' };
    expect(extractRecipeServings(recipe)).toBe(6);
  });

  test('extracts servings from "Makes 8"', () => {
    const recipe = { instructions: ['Bake at 350F.', 'Makes 8 cookies.'], name: '' };
    expect(extractRecipeServings(recipe)).toBe(8);
  });

  test('extracts from "for X people"', () => {
    const recipe = { instructions: ['Simmer 20 min.', 'Recipe is for 6 people.'], name: '' };
    expect(extractRecipeServings(recipe)).toBe(6);
  });

  test('defaults to 4 when no serving info found', () => {
    const recipe = { instructions: ['Chop.', 'Cook.', 'Enjoy.'], name: '' };
    expect(extractRecipeServings(recipe)).toBe(4);
  });

  test('defaults to 4 for empty instructions', () => {
    expect(extractRecipeServings({ instructions: [], name: '' })).toBe(4);
  });

  test('works with directions field instead of instructions', () => {
    const recipe = { directions: ['Stir well.', 'Serves 2.'], name: '' };
    expect(extractRecipeServings(recipe)).toBe(2);
  });

});

// ─────────────────────────────────────────────────────────────────────────
describe('toStoreUnit — store-friendly grocery conversion', () => {

  test('converts small tsp onion amount to "Small onion"', () => {
    expect(toStoreUnit_onion('2 tsp onion, grated')).toBe('Small onion');
  });

  test('converts 1 cup onion to a single large onion', () => {
    // 1 cup = 236g, which exceeds medium threshold (150g) → Large onion
    expect(toStoreUnit_onion('1 cup onion, diced')).toMatch(/Large onion/);
  });

  test('converts large onion quantity to multiple large onions', () => {
    expect(toStoreUnit_onion('3 cups onion')).toMatch(/Large onion/);
  });

});