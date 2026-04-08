// ──────────────────────────────────────────────
// FILTERS — allergy hard-filter, diet/appliance/cuisine ranking
// ──────────────────────────────────────────────

const FILTERS_KEY = 'savr_filters';

// ── Allergy ingredient blocklists ──────────────────────────────────────────
// Any recipe whose NER or ingredient strings contain these terms is removed.
const ALLERGY_BLOCKLISTS = {
  '🥜 Peanuts':   ['peanut','peanuts','peanut butter','groundnut'],
  '🌾 Gluten':    ['flour','wheat','barley','rye','bread','pasta','noodle',
                   'spaghetti','penne','fettuccine','breadcrumb','crouton','couscous','semolina'],
  '🥛 Dairy':     ['milk','butter','cream','cheese','yogurt','yoghurt','parmesan',
                   'mozzarella','cheddar','ricotta','feta','brie','whey','lactose',
                   'ghee','sour cream','cream cheese','heavy cream','double cream'],
  '🥚 Eggs':      ['egg','eggs','egg white','egg yolk','mayonnaise','mayo'],
  '🐟 Fish':      ['fish','salmon','tuna','cod','tilapia','halibut','anchovy',
                   'anchovies','sardine','mackerel','bass','trout','snapper'],
  '🦐 Shellfish': ['shrimp','prawn','lobster','crab','scallop','clam','mussel',
                   'oyster','crawfish','crayfish'],
};

// ── Vegan / Vegetarian ingredient blocklists ───────────────────────────────
const VEGAN_BLOCKLIST = [
  // meat
  'chicken','beef','pork','lamb','turkey','bacon','ham','sausage','duck',
  'veal','venison','bison','goat','salami','pepperoni','prosciutto','lard',
  'gelatin','anchovies','anchovy','fish sauce','worcestershire',
  // dairy
  'milk','butter','cream','cheese','yogurt','yoghurt','parmesan','mozzarella',
  'cheddar','ricotta','feta','brie','ghee','sour cream','cream cheese',
  'heavy cream','double cream','whey',
  // eggs
  'egg','eggs','egg white','egg yolk','mayonnaise','mayo',
  // seafood
  'salmon','tuna','shrimp','prawn','lobster','crab','scallop','clam',
  'mussel','oyster','fish','seafood',
  // other
  'honey','lard','suet','bone broth',
];

const VEGETARIAN_BLOCKLIST = [
  'chicken','beef','pork','lamb','turkey','bacon','ham','sausage','duck',
  'veal','venison','bison','goat','salami','pepperoni','prosciutto','lard',
  'gelatin','fish sauce','worcestershire',
  'salmon','tuna','shrimp','prawn','lobster','crab','scallop','clam',
  'mussel','oyster','fish','seafood','anchovy','anchovies',
];

// ── Appliance detection from recipe steps ─────────────────────────────────
// Maps appliance chip label → keywords to look for in directions text
const APPLIANCE_KEYWORDS = {
  '🔥 Stovetop':    ['stovetop','saucepan','skillet','frying pan','pan','pot',
                     'wok','sauté','sautee','stir fry','boil','simmer','fry',
                     'sear','brown','caramelize','caramelise','heat oil','medium heat',
                     'high heat','low heat'],
  '♨️ Oven':        ['oven','bake','baked','baking','roast','roasted','roasting',
                     'broil','broiled','broiling','grill','grilled','grilling',
                     '350','375','400','425','450','degrees','preheat','fahrenheit','celsius'],
  '⚡ Microwave':   ['microwave','microwaved','microwave-safe'],
  '💨 Air Fryer':   ['air fry','air fryer','air-fry','air fryer basket'],
  '🫕 Slow Cooker': ['slow cooker','slow cook','crockpot','crock pot','low and slow'],
  '⚙️ Instant Pot': ['instant pot','pressure cook','pressure cooker','saute mode',
                     'manual pressure','high pressure','low pressure'],
};

// ── Cuisine detection from NER + title ────────────────────────────────────
const CUISINE_KEYWORDS = {
  '🇮🇹 Italian':        ['pasta','spaghetti','penne','fettuccine','risotto','parmesan',
                          'mozzarella','basil','oregano','marinara','bolognese','carbonara',
                          'lasagna','lasagne','tiramisu','prosciutto','pancetta','italian'],
  '🇲🇽 Mexican':        ['taco','burrito','enchilada','quesadilla','salsa','guacamole',
                          'jalapeño','jalapeno','chipotle','tortilla','cilantro','cumin',
                          'lime','black beans','refried','mexican','chili pepper'],
  '🇯🇵 Japanese':       ['soy sauce','miso','dashi','sake','mirin','tofu','sushi',
                          'ramen','udon','soba','tempura','teriyaki','wasabi','nori',
                          'sesame','rice vinegar','japanese','edamame','matcha'],
  '🇮🇳 Indian':         ['curry','turmeric','garam masala','cumin','coriander','cardamom',
                          'ginger','chili','naan','basmati','ghee','paneer','dal','lentil',
                          'tandoori','tikka','masala','indian','fenugreek','mustard seed'],
  '🇹🇭 Thai':           ['fish sauce','coconut milk','lemongrass','galangal','thai basil',
                          'lime leaf','pad thai','green curry','red curry','nam pla',
                          'tamarind','thai','chili paste','bean sprout'],
  '🇬🇷 Mediterranean':  ['olive oil','feta','hummus','tahini','chickpea','eggplant',
                          'zucchini','lemon','garlic','tomato','cucumber','kalamata',
                          'pita','greek','mediterranean','tzatziki','oregano'],
  '🇨🇳 Chinese':        ['soy sauce','hoisin','oyster sauce','sesame oil','ginger',
                          'five spice','bok choy','bean sprout','dumpling','wonton',
                          'lo mein','chow mein','kung pao','mapo','chinese','rice wine'],
  '🇺🇸 American':       ['burger','barbecue','bbq','mac and cheese','cornbread',
                          'ranch','buffalo','pulled pork','coleslaw','potato salad',
                          'american','biscuit','gravy','meatloaf','cheeseburger'],
  '🇫🇷 French':         ['beurre','crème','roux','baguette','gruyere','dijon',
                          'tarragon','thyme','shallot','bechamel','hollandaise',
                          'coq au vin','ratatouille','quiche','french','croissant'],
};

// ── Read active filters from DOM ──────────────────────────────────────────
function getActiveFilterState() {
  const allergies  = [];
  const dietary    = [];
  const appliances = [];
  const cuisines   = [];

  document.querySelectorAll('.chip.active').forEach(chip => {
    const text = chip.textContent.trim();
    if (chip.closest('#allergy-chips'))    allergies.push(text);
    else if (chip.closest('#appliance-chips')) appliances.push(text);
    else if (chip.closest('#cuisine-chips'))   cuisines.push(text);
    else                                       dietary.push(text);
  });

  return { allergies, dietary, appliances, cuisines };
}

// ── Hard allergy filter ───────────────────────────────────────────────────
// Returns true if the recipe should be REMOVED (contains an allergen)
function recipeContainsAllergen(recipe, activeAllergies) {
  if (!activeAllergies.length) return false;
  const text = [
    ...(recipe.ingredients || []),
    ...(recipe.ner || []),
  ].join(' ').toLowerCase();

  for (const allergy of activeAllergies) {
    const blocklist = ALLERGY_BLOCKLISTS[allergy] || [];
    if (blocklist.some(term => text.includes(term))) return true;
  }
  return false;
}

// ── Dietary hard filter ───────────────────────────────────────────────────
function recipeViolatesDiet(recipe, dietary) {
  if (!dietary.length) return false;
  const text = [
    ...(recipe.ingredients || []),
    ...(recipe.ner || []),
  ].join(' ').toLowerCase();

  if (dietary.includes('🌱 Vegan')) {
    if (VEGAN_BLOCKLIST.some(term => new RegExp(`\\b${term}\\b`).test(text))) return true;
  }
  if (dietary.includes('🥗 Vegetarian')) {
    if (VEGETARIAN_BLOCKLIST.some(term => new RegExp(`\\b${term}\\b`).test(text))) return true;
  }
  return false;
}

// ── Detect appliances required by a recipe ───────────────────────────────
function detectAppliances(recipe) {
  const stepsText = [
    ...(recipe.instructions || recipe.directions || []),
    ...(recipe.ingredients || []),
  ].join(' ').toLowerCase();

  const detected = [];
  for (const [appliance, keywords] of Object.entries(APPLIANCE_KEYWORDS)) {
    if (keywords.some(kw => stepsText.includes(kw))) {
      detected.push(appliance);
    }
  }
  return detected;
}

// ── Detect cuisine of a recipe ────────────────────────────────────────────
function detectCuisine(recipe) {
  const text = [
    recipe.name || '',
    ...(recipe.ner || []),
    ...(recipe.ingredients || []),
  ].join(' ').toLowerCase();

  const detected = [];
  for (const [cuisine, keywords] of Object.entries(CUISINE_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      detected.push(cuisine);
    }
  }
  return detected;
}

// ── Appliance & cuisine boost score ───────────────────────────────────────
// Returns a bonus score 0–2 based on filter matches
function filterBoostScore(recipe, appliances, cuisines) {
  let boost = 0;

  if (appliances.length) {
    const required = detectAppliances(recipe);
    if (!required.length) {
      // Can't detect — neutral, give half boost
      boost += 0.5;
    } else {
      const covered = required.filter(a => appliances.includes(a));
      // Full boost if all required appliances are available
      // Partial if some are, 0 if none
      boost += covered.length / required.length;
    }
  }

  if (cuisines.length) {
    const detected = detectCuisine(recipe);
    if (detected.some(c => cuisines.includes(c))) boost += 1;
  }

  return boost;
}

// ── Master filter + rank function ─────────────────────────────────────────
// Called in generateRecipes after Supabase results come back.
// Returns filtered + re-ranked array.
function applyFilters(rows, userNerSet) {
  const { allergies, dietary, appliances, cuisines } = getActiveFilterState();

  // Step 1: hard remove allergy violations
  let filtered = rows.filter(r => !recipeContainsAllergen(r, allergies));

  // Step 2: hard remove dietary violations (vegan/vegetarian)
  filtered = filtered.filter(r => !recipeViolatesDiet(r, dietary));

  // Step 3: score and sort
  // Primary:  fewest missing ingredients (pantry coverage)
  // Secondary: filter boost (appliances + cuisine match)
  // Tertiary:  match_score
  filtered.sort((a, b) => {
    const missingA = (a.ner || []).filter(n => !userNerSet.has(n)).length;
    const missingB = (b.ner || []).filter(n => !userNerSet.has(n)).length;
    if (missingA !== missingB) return missingA - missingB;

    const boostA = filterBoostScore(a, appliances, cuisines);
    const boostB = filterBoostScore(b, appliances, cuisines);
    if (Math.abs(boostB - boostA) > 0.1) return boostB - boostA;

    return (b.match_score || 0) - (a.match_score || 0);
  });

  return filtered;
}

// ── Chip toggle + persist ─────────────────────────────────────────────────
function toggleChip(el, style) {
  el.classList.toggle('active');
  if (style) el.classList.toggle(style, el.classList.contains('active'));
  saveFilters();
}

function saveFilters() {
  const activeChips = [...document.querySelectorAll('.chip.active')].map(chip => ({
    text:  chip.textContent.trim(),
    style: chip.dataset.chipStyle || null,
  }));
  localStorage.setItem(FILTERS_KEY, JSON.stringify(activeChips));
}

function restoreFilters() {
  const isValidChipArray = v => Array.isArray(v) && v.every(x => x && typeof x.text === 'string');
  const saved = safeRead(FILTERS_KEY, [], isValidChipArray);
  if (!saved.length) return;

  document.querySelectorAll('.chip').forEach(chip => {
    const match = saved.find(s => s.text === chip.textContent.trim());
    if (match) {
      chip.classList.add('active');
      const allowedStyles = ['terra'];
      if (match.style && allowedStyles.includes(match.style)) chip.classList.add(match.style);
    }
  });
}

function initFilters() {
  document.querySelectorAll('#allergy-chips .chip').forEach(chip => {
    chip.dataset.chipStyle = 'terra';
  });
  restoreFilters();
}

// Legacy alias used by search.js
function getActiveFilters() {
  return getActiveFilterState().dietary
    .map(d => ({
      '🌱 Vegan': 'Vegan', '🥗 Vegetarian': 'Vegetarian',
      '🥩 Keto': 'Keto', '🔥 Low-Calorie': 'Low-Cal',
    }[d]))
    .filter(Boolean);
}