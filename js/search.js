// ──────────────────────────────────────────────
// SEARCH — queries the recipe dataset via Netlify function → Supabase
// ──────────────────────────────────────────────

const SEARCH_PAGE_SIZE = 3;
const SEARCH_LOAD_MORE = 6;

const searchState = {
  lastIngredients: [],
  lastTags:        [],
  lastTitleQuery:  '',
  offset:          0,
  exhausted:       false,
};

const STOP_WORDS_SEARCH = new Set([
  'cup','cups','tbsp','tsp','g','kg','ml','oz','lb','clove','cloves',
  'can','cans','bunch','pinch','slice','slices','piece','pieces',
  'large','small','medium','fresh','dried','frozen','raw','whole',
  'of','and','or','the','a','an','to','with','for','in','into',
  'minced','diced','sliced','chopped','grated','crushed','halved',
  'peeled','trimmed','rinsed','drained','cooked','shredded','beaten',
  'taste','needed','optional','divided','packed','heaping','level',
]);

// Works with both legacy strings and new { name, qty, unit } objects
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

// ── Coverage scoring ───────────────────────────────────────────────────────
// Returns a score 0–1 representing how well a recipe's NER matches
// the user's ingredients with no extra ingredients needed.
// Perfect score = every recipe ingredient is covered by user ingredients.
function coverageScore(recipeNer, userNerSet) {
  if (!recipeNer || recipeNer.length === 0) return 0;
  const matched = recipeNer.filter(n => userNerSet.has(n)).length;
  return matched / recipeNer.length;
}

// ── Re-rank results client-side ────────────────────────────────────────────
// Delegates to applyFilters in filters.js which handles:
//   - allergy hard removal
//   - vegan/vegetarian hard removal
//   - appliance + cuisine boost scoring
//   - coverage (fewest missing ingredients) as primary sort
function rerankByCoverage(rows, userNerSet) {
  return applyFilters(rows, userNerSet);
}

function getActiveFilters() {
  const tags = [];
  document.querySelectorAll('.chip.active').forEach(chip => {
    const text = chip.textContent.trim();
    const map = {
      '🌱 Vegan':        'Vegan',
      '🥗 Vegetarian':   'Vegetarian',
      '🥩 Keto':         'Keto',
      '🔥 Low-Calorie':  'Low-Cal',
      '🥩 High Protein': 'High Protein',
    };
    if (map[text]) tags.push(map[text]);
  });
  return tags;
}

function mapRow(row, userNerSet) {
  const cov = coverageScore(row.ner || [], userNerSet);
  return {
    id:            row.id,
    icon:          pickIcon(row.ner || []),
    name:          row.title,
    time:          '–',
    cal:           null,
    tags:          row.tags || [],
    ingredients:   row.ingredients || [],
    instructions:  row.directions  || [],
    nutrition:     null,
    matchScore:    row.match_score,
    coverageScore: cov,
    missingCount:  Math.round((1 - cov) * (row.ner || []).length),
    ner:           row.ner || [],
    source:        row.source || null,
    link:          row.link   || null,
  };
}

function pickIcon(ner) {
  const s = ner.join(' ');
  if (/pasta|noodle|spaghetti|fettuccine|penne/.test(s)) return '🍝';
  if (/chicken|turkey|duck/.test(s))                      return '🍗';
  if (/beef|steak|burger|mince/.test(s))                  return '🥩';
  if (/salmon|tuna|shrimp|fish|seafood/.test(s))          return '🐟';
  if (/egg/.test(s))                                      return '🥚';
  if (/tomato|pepper|onion|garlic/.test(s))               return '🍅';
  if (/chocolate|cocoa|cake|cookie|brownie/.test(s))      return '🍫';
  if (/bread|flour|yeast/.test(s))                        return '🍞';
  if (/rice|grain|quinoa/.test(s))                        return '🍚';
  if (/soup|broth|stock/.test(s))                         return '🍲';
  if (/salad|lettuce|spinach|arugula/.test(s))            return '🥗';
  if (/curry|cumin|turmeric|garam/.test(s))               return '🫕';
  if (/lemon|lime|orange/.test(s))                        return '🍋';
  return '🍽️';
}

async function generateRecipes() {
  const btn = document.getElementById('generate-btn');
  btn.classList.add('loading');
  btn.disabled = true;

  console.log('[search] ingredients state:', ingredients);
  const nerTerms = ingredients.map(ingredientToNer).filter(Boolean);
  console.log('[search] nerTerms:', nerTerms);
  const userNerSet = new Set(nerTerms);

  if (!nerTerms.length) {
    btn.classList.remove('loading');
    btn.disabled = false;
    alert('Add at least one ingredient to search.');
    return;
  }

  const tags       = getActiveFilters();
  const titleQuery = '';

  searchState.lastIngredients = nerTerms;
  searchState.lastTags        = tags;
  searchState.lastTitleQuery  = titleQuery;
  searchState.lastUserNerSet  = userNerSet;
  searchState.offset          = 0;
  searchState.exhausted       = false;

  try {
    const { recipes: rows, offset } = await callSearch({
      ingredients: nerTerms,
      tags,
      titleQuery,
      limit:  SEARCH_PAGE_SIZE * 3,  // fetch more so re-ranking has material to work with
      offset: 0,
    });

    searchState.offset    = offset;
    searchState.exhausted = rows.length < SEARCH_PAGE_SIZE;

    const reranked   = rerankByCoverage(rows, userNerSet);
    currentRecipes   = reranked.slice(0, SEARCH_PAGE_SIZE).map(r => mapRow(r, userNerSet));
    searchState._buffer = reranked.slice(SEARCH_PAGE_SIZE).map(r => mapRow(r, userNerSet));

    renderRecipes();
    updateLoadMoreButton();

    const results = document.getElementById('results-section');
    results.classList.add('visible');
    results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (err) {
    console.error('Search failed:', err);
    alert('Search failed — check your connection and try again.');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

async function loadMoreRecipes() {
  if (searchState.exhausted) return;

  const btn = document.getElementById('load-more-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }

  const userNerSet = searchState.lastUserNerSet || new Set();

  try {
    // Use buffered results first
    if (searchState._buffer && searchState._buffer.length) {
      const next = searchState._buffer.splice(0, SEARCH_LOAD_MORE);
      currentRecipes = [...currentRecipes, ...next];
      searchState.exhausted = searchState._buffer.length === 0 && searchState.exhausted;
    } else {
      const { recipes: rows, offset } = await callSearch({
        ingredients: searchState.lastIngredients,
        tags:        searchState.lastTags,
        titleQuery:  searchState.lastTitleQuery,
        limit:       SEARCH_LOAD_MORE * 3,
        offset:      searchState.offset,
      });

      searchState.offset    = offset;
      searchState.exhausted = rows.length < SEARCH_LOAD_MORE;

      const reranked = rerankByCoverage(rows, userNerSet);
      const next     = reranked.slice(0, SEARCH_LOAD_MORE).map(r => mapRow(r, userNerSet));
      searchState._buffer = reranked.slice(SEARCH_LOAD_MORE).map(r => mapRow(r, userNerSet));
      currentRecipes = [...currentRecipes, ...next];
    }

    renderRecipes();
    updateLoadMoreButton();

  } catch (err) {
    console.error('Load more failed:', err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Show more recipes'; }
  }
}

function updateLoadMoreButton() {
  const container = document.getElementById('load-more-container');
  if (!container) return;
  container.style.display = searchState.exhausted && (!searchState._buffer?.length) ? 'none' : 'block';
  const count = document.getElementById('results-count');
  if (count) {
    count.textContent = searchState.exhausted && !searchState._buffer?.length
      ? `${currentRecipes.length} recipes found`
      : `${currentRecipes.length} recipes — scroll for more`;
  }
}

async function callSearch(params) {
  const res = await fetch('/api/search', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Search returned ${res.status}`);
  }
  return res.json();
}