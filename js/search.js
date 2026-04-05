const SEARCH_PAGE_SIZE = 3;
const SEARCH_LOAD_MORE = 6;

const searchState = {
  lastIngredients: [],
  lastTags: [],
  lastTitleQuery: '',
  offset: 0,
  exhausted: false,
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

function ingredientToNer(str) {
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

function getActiveFilters() {
  const tags = [];
  document.querySelectorAll('.chip.active').forEach(chip => {
    const text = chip.textContent.trim();
    const map = {
      '🌱 Vegan': 'Vegan',
      '🥗 Vegetarian': 'Vegetarian',
      '🥩 Keto': 'Keto',
      '🔥 Low-Calorie': 'Low-Cal',
      '🥩 High Protein': 'High Protein',
    };
    if (map[text]) tags.push(map[text]);
  });
  return tags;
}

function mapRow(row) {
  return {
    id: row.id,
    icon: pickIcon(row.ner || []),
    name: row.title,
    time: '–',
    cal: null,
    tags: row.tags || [],
    ingredients: row.ingredients || [],
    instructions: row.directions || [],
    nutrition: null,
    matchScore: row.match_score,
    source: row.source || null,
    link: row.link || null,
  };
}

function pickIcon(ner) {
  const s = ner.join(' ');
  if (/pasta|noodle|spaghetti|fettuccine|penne/.test(s)) return '🍝';
  if (/chicken|turkey|duck/.test(s)) return '🍗';
  if (/beef|steak|burger|mince/.test(s)) return '🥩';
  if (/salmon|tuna|shrimp|fish|seafood/.test(s)) return '🐟';
  if (/egg/.test(s)) return '🥚';
  if (/tomato|pepper|onion|garlic/.test(s)) return '🍅';
  if (/chocolate|cocoa|cake|cookie|brownie/.test(s)) return '🍫';
  if (/bread|flour|yeast/.test(s)) return '🍞';
  if (/rice|grain|quinoa/.test(s)) return '🍚';
  if (/soup|broth|stock/.test(s)) return '🍲';
  if (/salad|lettuce|spinach|arugula/.test(s)) return '🥗';
  if (/curry|cumin|turmeric|garam/.test(s)) return '🫕';
  if (/lemon|lime|orange/.test(s)) return '🍋';
  return '🍽️';
}

async function generateRecipes() {
  const btn = document.getElementById('generate-btn');
  btn.classList.add('loading');
  btn.disabled = true;

  const nerTerms = ingredients
    .map(ingredientToNer)
    .filter(Boolean);

  if (!nerTerms.length) {
    btn.classList.remove('loading');
    btn.disabled = false;
    alert('Add at least one ingredient to search.');
    return;
  }

  const tags = getActiveFilters();
  const titleQuery = '';

  searchState.lastIngredients = nerTerms;
  searchState.lastTags = tags;
  searchState.lastTitleQuery = titleQuery;
  searchState.offset = 0;
  searchState.exhausted = false;

  try {
    const { recipes: rows, offset } = await callSearch({
      ingredients: nerTerms,
      tags,
      titleQuery,
      limit:  SEARCH_PAGE_SIZE,
      offset: 0,
    });

    searchState.offset = offset;
    searchState.exhausted = rows.length < SEARCH_PAGE_SIZE;

    currentRecipes = rows.map(mapRow);
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

  try {
    const { recipes: rows, offset } = await callSearch({
      ingredients: searchState.lastIngredients,
      tags: searchState.lastTags,
      titleQuery: searchState.lastTitleQuery,
      limit: SEARCH_LOAD_MORE,
      offset: searchState.offset,
    });

    searchState.offset = offset;
    searchState.exhausted = rows.length < SEARCH_LOAD_MORE;

    const newRecipes = rows.map(mapRow);
    currentRecipes = [...currentRecipes, ...newRecipes];
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
  container.style.display = searchState.exhausted ? 'none' : 'block';
  const count = document.getElementById('results-count');
  if (count) {
    count.textContent = searchState.exhausted
      ? `${currentRecipes.length} recipes found`
      : `${currentRecipes.length} recipes — scroll for more`;
  }
}

async function callSearch(params) {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Search returned ${res.status}`);
  }
  return res.json();
}