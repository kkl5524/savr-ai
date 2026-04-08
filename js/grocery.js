// ──────────────────────────────────────────────
// GROCERY — shopping lists with store-friendly quantities
// ──────────────────────────────────────────────

// ── Store unit conversion table ────────────────────────────────────────────
// Maps ingredient keywords → how you'd buy them at a store.
// Each entry defines:
//   unit: the purchasable unit name
//   grams: approximate grams per one purchasable unit
//   threshold: minimum grams before bumping to the next size (optional)
const STORE_UNITS = [
  // ── Produce — sold by count ────────────────────────────────────────────
  { match: ['onion','shallot'],            unit: 'onion',          grams: 110,  sizes: [[55,'small onion'],[110,'medium onion'],[200,'large onion']] },
  { match: ['garlic clove','garlic'],       unit: 'garlic',         grams: 5,    sizes: [[30,'bulb of garlic'],[5,'clove of garlic']] },
  { match: ['carrot'],                      unit: 'carrot',         grams: 80,   sizes: [[80,'carrot'],[400,'bag of carrots']] },
  { match: ['celery'],                      unit: 'celery stalk',   grams: 40,   sizes: [[40,'celery stalk'],[400,'head of celery']] },
  { match: ['potato'],                      unit: 'potato',         grams: 150,  sizes: [[100,'small potato'],[150,'medium potato'],[250,'large potato']] },
  { match: ['sweet potato'],                unit: 'sweet potato',   grams: 150,  sizes: [[150,'sweet potato']] },
  { match: ['tomato'],                      unit: 'tomato',         grams: 120,  sizes: [[120,'tomato'],[400,'can of tomatoes']] },
  { match: ['cherry tomato'],               unit: 'cherry tomatoes',grams: 200,  sizes: [[200,'punnet of cherry tomatoes']] },
  { match: ['lemon'],                       unit: 'lemon',          grams: 100,  sizes: [[100,'lemon']] },
  { match: ['lime'],                        unit: 'lime',           grams: 70,   sizes: [[70,'lime']] },
  { match: ['orange'],                      unit: 'orange',         grams: 180,  sizes: [[180,'orange']] },
  { match: ['avocado'],                     unit: 'avocado',        grams: 200,  sizes: [[200,'avocado']] },
  { match: ['bell pepper','capsicum'],      unit: 'pepper',         grams: 160,  sizes: [[160,'bell pepper']] },
  { match: ['jalapeño','jalapeno'],         unit: 'jalapeño',       grams: 15,   sizes: [[15,'jalapeño']] },
  { match: ['broccoli'],                    unit: 'broccoli',       grams: 300,  sizes: [[300,'head of broccoli']] },
  { match: ['cauliflower'],                 unit: 'cauliflower',    grams: 500,  sizes: [[500,'head of cauliflower']] },
  { match: ['zucchini','courgette'],        unit: 'zucchini',       grams: 200,  sizes: [[200,'zucchini']] },
  { match: ['eggplant','aubergine'],        unit: 'eggplant',       grams: 350,  sizes: [[350,'eggplant']] },
  { match: ['cucumber'],                    unit: 'cucumber',       grams: 300,  sizes: [[300,'cucumber']] },
  { match: ['corn','sweetcorn'],            unit: 'corn',           grams: 150,  sizes: [[150,'ear of corn'],[400,'can of corn']] },
  { match: ['mushroom'],                    unit: 'mushrooms',      grams: 200,  sizes: [[200,'pack of mushrooms']] },
  { match: ['spinach'],                     unit: 'spinach',        grams: 200,  sizes: [[200,'bag of spinach']] },
  { match: ['kale'],                        unit: 'kale',           grams: 150,  sizes: [[150,'bunch of kale']] },
  { match: ['lettuce'],                     unit: 'lettuce',        grams: 300,  sizes: [[300,'head of lettuce']] },
  { match: ['cabbage'],                     unit: 'cabbage',        grams: 500,  sizes: [[500,'head of cabbage']] },
  { match: ['apple'],                       unit: 'apple',          grams: 180,  sizes: [[180,'apple']] },
  { match: ['banana'],                      unit: 'banana',         grams: 120,  sizes: [[120,'banana']] },
  { match: ['egg'],                         unit: 'eggs',           grams: 50,   sizes: [[300,'half dozen eggs'],[600,'dozen eggs']] },

  // ── Meat & fish — sold by weight ──────────────────────────────────────
  { match: ['chicken breast'],              unit: 'g chicken breast',  grams: 1, weight: true },
  { match: ['chicken thigh'],               unit: 'g chicken thighs',  grams: 1, weight: true },
  { match: ['chicken'],                     unit: 'g chicken',         grams: 1, weight: true },
  { match: ['beef','steak','mince','ground beef'], unit: 'g beef',     grams: 1, weight: true },
  { match: ['pork','bacon','ham'],          unit: 'g pork',            grams: 1, weight: true },
  { match: ['lamb'],                        unit: 'g lamb',            grams: 1, weight: true },
  { match: ['salmon'],                      unit: 'salmon fillet',     grams: 150, sizes: [[150,'salmon fillet']] },
  { match: ['tuna'],                        unit: 'can of tuna',       grams: 180, sizes: [[180,'can of tuna']] },
  { match: ['shrimp','prawn'],              unit: 'g shrimp',          grams: 1, weight: true },

  // ── Dairy — sold by carton/block/pot ──────────────────────────────────
  { match: ['milk'],                        unit: 'milk',           grams: 240,  sizes: [[500,'500ml milk'],[1000,'1 litre milk']] },
  { match: ['butter'],                      unit: 'butter',         grams: 14,   sizes: [[250,'250g butter']] },
  { match: ['cream cheese'],                unit: 'cream cheese',   grams: 30,   sizes: [[200,'tub of cream cheese']] },
  { match: ['heavy cream','double cream','whipping cream'], unit: 'cream', grams: 240, sizes: [[300,'300ml cream']] },
  { match: ['sour cream'],                  unit: 'sour cream',     grams: 60,   sizes: [[300,'tub of sour cream']] },
  { match: ['yogurt','yoghurt'],            unit: 'yogurt',         grams: 150,  sizes: [[500,'500g yogurt']] },
  { match: ['parmesan'],                    unit: 'parmesan',       grams: 30,   sizes: [[100,'100g parmesan']] },
  { match: ['mozzarella'],                  unit: 'mozzarella',     grams: 125,  sizes: [[125,'ball of mozzarella']] },
  { match: ['cheddar','cheese'],            unit: 'cheese',         grams: 30,   sizes: [[200,'200g cheddar'],[400,'400g cheddar']] },
  { match: ['feta'],                        unit: 'feta',           grams: 100,  sizes: [[200,'200g feta']] },

  // ── Pantry — sold in cans/bags/bottles ────────────────────────────────
  { match: ['chickpea','garbanzo'],         unit: 'chickpeas',      grams: 400,  sizes: [[400,'can of chickpeas']] },
  { match: ['black bean'],                  unit: 'black beans',    grams: 400,  sizes: [[400,'can of black beans']] },
  { match: ['kidney bean'],                 unit: 'kidney beans',   grams: 400,  sizes: [[400,'can of kidney beans']] },
  { match: ['lentil'],                      unit: 'lentils',        grams: 400,  sizes: [[200,'bag of lentils'],[400,'can of lentils']] },
  { match: ['coconut milk'],                unit: 'coconut milk',   grams: 400,  sizes: [[400,'can of coconut milk']] },
  { match: ['olive oil'],                   unit: 'olive oil',      grams: 1,    pantry: true },
  { match: ['vegetable oil','canola oil'],  unit: 'oil',            grams: 1,    pantry: true },
  { match: ['soy sauce'],                   unit: 'soy sauce',      grams: 1,    pantry: true },
  { match: ['flour'],                       unit: 'flour',          grams: 120,  sizes: [[500,'500g flour'],[1000,'1kg flour']] },
  { match: ['sugar'],                       unit: 'sugar',          grams: 200,  sizes: [[500,'500g sugar'],[1000,'1kg sugar']] },
  { match: ['rice'],                        unit: 'rice',           grams: 200,  sizes: [[500,'500g rice'],[1000,'1kg rice']] },
  { match: ['pasta','spaghetti','penne','fettuccine'], unit: 'pasta', grams: 500, sizes: [[500,'500g pasta']] },
  { match: ['bread'],                       unit: 'bread',          grams: 500,  sizes: [[500,'loaf of bread']] },
  { match: ['stock','broth'],               unit: 'stock',          grams: 500,  sizes: [[500,'500ml stock'],[1000,'1 litre stock']] },
  { match: ['tomato paste','tomato puree'], unit: 'tomato paste',   grams: 30,   sizes: [[70,'small tin tomato paste']] },
];

// ── Spices / herbs — small amounts, sold as jars ──────────────────────────
const SPICE_KEYWORDS = [
  'salt','pepper','cumin','paprika','turmeric','coriander','oregano',
  'thyme','rosemary','basil','bay leaf','chili','cinnamon','nutmeg',
  'ginger','cardamom','clove','allspice','cayenne','mustard seed',
  'fennel','sage','dill','tarragon','marjoram','saffron',
];

// ── Parse the ingredient string to get grams ──────────────────────────────
const FRACTIONS_G = { '½':0.5,'¼':0.25,'¾':0.75,'⅓':0.333,'⅔':0.667,'⅛':0.125 };
const UNIT_GRAMS  = {
  g:1,gram:1,grams:1,kg:1000,
  oz:28.35,lb:453.59,
  ml:1,l:1000,
  tsp:4.93,teaspoon:4.93,teaspoons:4.93,
  tbsp:14.79,tablespoon:14.79,tablespoons:14.79,
  cup:236.59,cups:236.59,
  clove:5,cloves:5,
  can:400,cans:400,
  bunch:150,
  pinch:0.3,dash:0.6,
  slice:30,slices:30,
  piece:100,pieces:100,
  fillet:150,fillets:150,
  large:150,medium:110,small:60,
};

function parseGrams(str) {
  let s = str.toLowerCase().trim();
  for (const [g, v] of Object.entries(FRACTIONS_G)) s = s.replace(g, v + ' ');
  const numMatch = s.match(/^([\d]+(?:\.[\d]+)?)\s*/);
  let qty = 1;
  if (numMatch) { qty = parseFloat(numMatch[1]); s = s.slice(numMatch[0].length); }
  const unitKeys    = Object.keys(UNIT_GRAMS).sort((a,b) => b.length - a.length);
  const unitPattern = new RegExp('^(' + unitKeys.map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'i');
  const unitMatch   = s.match(unitPattern);
  if (unitMatch) {
    const factor = UNIT_GRAMS[unitMatch[1].toLowerCase()];
    return qty * (factor || 100);
  }
  return qty * 100; // unitless count — assume ~100g
}

function cleanIngredientName(str) {
  return str
    .toLowerCase()
    .replace(/[\d¼½¾⅓⅔⅛\/\.]+/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b(cup|cups|tbsp|tsp|g|kg|oz|lb|ml|l|clove|cloves|can|cans|bunch|pinch|dash|slice|slices|piece|pieces|fillet|fillets|large|medium|small|handful|sprig|sprigs|stalk|stalks)\b/gi, '')
    .replace(/\b(fresh|dried|raw|frozen|cooked|minced|diced|sliced|chopped|grated|crushed|shredded|peeled|trimmed|rinsed|drained|halved|beaten|softened|melted|packed|heaping|ground|whole|boneless|skinless|lean)\b/gi, '')
    .replace(/,.*$/, '')  // remove everything after comma
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Convert a recipe ingredient string to a store-friendly label ──────────
function toStoreUnit(ingStr) {
  const totalGrams = parseGrams(ingStr);
  const name       = cleanIngredientName(ingStr);

  // Check if it's a spice/herb — sold as a jar, just list the name
  if (SPICE_KEYWORDS.some(s => name.includes(s))) {
    return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // Find matching store unit rule
  for (const rule of STORE_UNITS) {
    const matched = rule.match.some(kw => name.includes(kw));
    if (!matched) continue;

    // Pantry staples (olive oil, soy sauce) — just list the name
    if (rule.pantry) {
      return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    // Weight-sold items (meat, fish) — round to nearest 50g
    if (rule.weight) {
      const rounded = Math.ceil(totalGrams / 50) * 50;
      return `${rounded}${rule.unit}`;
    }

    // Count/size items — find the best size match
    if (rule.sizes) {
      // How many units needed
      const count  = Math.ceil(totalGrams / rule.grams);
      // Find the size label that best fits
      const sorted = [...rule.sizes].sort((a, b) => a[0] - b[0]);
      let bestSize = sorted[sorted.length - 1][1]; // default to largest
      for (const [sizeGrams, label] of sorted) {
        if (totalGrams <= sizeGrams * 1.2) { bestSize = label; break; }
      }
      const qty = count > 1 ? `${count} × ` : '';
      return qty + bestSize.charAt(0).toUpperCase() + bestSize.slice(1);
    }
  }

  // No rule matched — clean up the string and return it capitalised
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ── Shared helpers ─────────────────────────────────────────────────────────
function getUserIngredientNames() {
  return new Set(ingredients.map(i => {
    const name = typeof i === 'string' ? i : (i.name || '');
    return name.toLowerCase().trim();
  }));
}

function isCovered(recipeIngStr, userNames) {
  const lower = recipeIngStr.toLowerCase();
  for (const name of userNames) {
    if (name.length > 2 && lower.includes(name)) return true;
  }
  return false;
}

function renderGroceryItems(rawItems, title) {
  const list    = document.getElementById('grocery-list');
  const titleEl = document.getElementById('grocery-modal-title');
  if (titleEl) titleEl.textContent = title || 'Your Shopping List';

  if (!rawItems.length) {
    list.innerHTML = `<li style="color:var(--moss);font-size:0.9rem;padding:0.5rem 0;">
      ✓ You have everything for this recipe!
    </li>`;
  } else {
    // Convert each ingredient to a store-friendly label
    const storeItems = rawItems.map(toStoreUnit);
    // Deduplicate (same store item may appear from different recipe ingredients)
    const unique = [...new Set(storeItems)].filter(Boolean);

    list.innerHTML = unique.map(item => `
      <li style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0;border-bottom:1px solid var(--stone-pale);">
        <input type="checkbox" style="accent-color:var(--moss);width:16px;height:16px;cursor:pointer;">
        <span style="font-size:0.9rem;">${item}</span>
      </li>`).join('');
  }

  document.getElementById('grocery-backdrop').classList.add('open');
}

// ── Single recipe shopping list ────────────────────────────────────────────
function openShoppingList(recipeId) {
  const r = findRecipe(recipeId);
  if (!r) return;
  const userNames = getUserIngredientNames();
  const needed    = (r.ingredients || []).filter(ing => !isCovered(ing, userNames));
  renderGroceryItems(needed, `Shopping list — ${r.name}`);
}

// ── Pinned recipes shopping list ───────────────────────────────────────────
function generateGroceryList() {
  const pinnedRecipes = pinned.map(id => findRecipe(id)).filter(Boolean);
  if (!pinnedRecipes.length) {
    alert('Pin some recipes first to generate a grocery list!');
    return;
  }
  const userNames = getUserIngredientNames();
  const allNeeded = pinnedRecipes.flatMap(r => r.ingredients || [])
    .filter(ing => !isCovered(ing, userNames));
  renderGroceryItems(allNeeded, `Shopping list — ${pinnedRecipes.length} pinned recipe${pinnedRecipes.length > 1 ? 's' : ''}`);
}

function closeGrocery(e) {
  if (e.target === document.getElementById('grocery-backdrop')) {
    document.getElementById('grocery-backdrop').classList.remove('open');
  }
}