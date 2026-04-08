// ──────────────────────────────────────────────
// MEAL PLAN — 7 days × 3 meals, drag-to-reorder
// ──────────────────────────────────────────────

const MEAL_PLAN_KEY = 'savr_meal_plan';

// ── Recipe colour palette — muted, easy on the eyes ───────────────────────
const MP_COLORS = [
  { bg: '#C8D9C7', text: '#2C4A2E' }, // sage green
  { bg: '#F2CDB8', text: '#6B3A22' }, // terracotta pale
  { bg: '#F5E4B8', text: '#6B4F10' }, // gold pale
  { bg: '#D4E4F0', text: '#1A3D5C' }, // dusty blue
  { bg: '#E8D5E8', text: '#4A2A4A' }, // soft lavender
  { bg: '#D5EAD5', text: '#1A3D1A' }, // mint green
  { bg: '#F0DDD5', text: '#5C2A1A' }, // peach
  { bg: '#D5E0EA', text: '#1A2D3D' }, // steel blue
  { bg: '#EAE0D5', text: '#3D2A1A' }, // warm sand
  { bg: '#D5EAE5', text: '#1A3D35' }, // seafoam
];

function recipeColor(recipeId, colorMap) {
  if (colorMap && colorMap[recipeId] != null) {
    return MP_COLORS[colorMap[recipeId] % MP_COLORS.length];
  }
  return MP_COLORS[Math.abs(recipeId) % MP_COLORS.length];
}

function buildColorMap(plan) {
  const ids = [...new Set(
    plan.flatMap(d => MEAL_SLOTS.map(s => d.meals[s]?.recipeId).filter(Boolean))
  )];
  const indices = [...Array(MP_COLORS.length).keys()];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const map = {};
  ids.forEach((id, i) => { map[id] = indices[i % indices.length]; });
  return map;
}

// ── Serving size extraction ────────────────────────────────────────────────
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

// ── Persist / restore ──────────────────────────────────────────────────────
function saveMealPlan(plan, colorMap) {
  localStorage.setItem(MEAL_PLAN_KEY, JSON.stringify({ plan, colorMap: colorMap || {} }));
}

function loadMealPlan() {
  try {
    const raw = localStorage.getItem(MEAL_PLAN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed[0]?.meals) return { plan: parsed, colorMap: {} };
    if (parsed?.plan && Array.isArray(parsed.plan) && parsed.plan[0]?.meals) return parsed;
    return null;
  } catch { return null; }
}

function emptyPlan() {
  return DAYS.map(day => ({
    day,
    meals: { breakfast: null, lunch: null, dinner: null }
  }));
}

// ── Generate a plan from pinned recipes ────────────────────────────────────
// Fetches any pinned recipes not yet in memory before building the plan
async function generateMealPlan() {
  const btn = document.querySelector('.generate-plan-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

  // Ensure all pinned recipes are in memory
  const missingIds = pinned.filter(
    id => !currentRecipes.find(r => r.id === id) && !SAMPLE_RECIPES.find(r => r.id === id)
  );
  if (missingIds.length) {
    try {
      const fetched = await fetchRecipesByIds(missingIds);
      for (const r of fetched) {
        if (!currentRecipes.find(x => x.id === r.id)) currentRecipes.push(r);
      }
    } catch (e) { console.warn('Could not fetch pinned recipes:', e); }
  }

  // Build pool from pinned — fall back to SAMPLE_RECIPES only if nothing pinned
  let pool = pinned.map(id => findRecipe(id)).filter(Boolean);
  if (!pool.length) pool = SAMPLE_RECIPES.slice(0, 6);

  const plan = emptyPlan();
  let idx = 0;
  for (const day of plan) {
    for (const slot of MEAL_SLOTS) {
      const recipe = pool[idx % pool.length];
      day.meals[slot] = { recipeId: recipe.id, servings: 1 };
      idx++;
    }
  }

  const colorMap = buildColorMap(plan);
  saveMealPlan(plan, colorMap);
  renderMealPlanDays(plan, colorMap);

  if (btn) { btn.disabled = false; btn.textContent = '✨ Generate 7-Day Plan'; }
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderMealPlanPlaceholder() {
  const saved = loadMealPlan();
  if (!saved) {
    document.getElementById('meal-plan-grid').innerHTML = `
      <div class="mp-empty">
        <p>No meal plan yet.</p>
        <p style="font-size:0.85rem;opacity:0.6;margin-top:0.3rem;">Pin some recipes then click Generate.</p>
      </div>`;
    return;
  }

  const { plan, colorMap } = saved;
  const allIds     = plan.flatMap(d => MEAL_SLOTS.map(s => d.meals[s]?.recipeId).filter(Boolean));
  const missingIds = [...new Set(allIds)].filter(
    id => !currentRecipes.find(r => r.id === id) && !SAMPLE_RECIPES.find(r => r.id === id)
  );

  renderMealPlanDays(plan, colorMap);

  if (missingIds.length) {
    fetchRecipesByIds(missingIds).then(fetched => {
      for (const r of fetched) {
        if (!currentRecipes.find(x => x.id === r.id)) currentRecipes.push(r);
      }
      renderMealPlanDays(plan, colorMap);
    }).catch(() => {});
  }
}

function renderMealPlanDays(plan, colorMap = {}) {
  const grid = document.getElementById('meal-plan-grid');

  // Build per-recipe summary for "What to cook" panel
  const recipeSummary = {};
  for (const day of plan) {
    for (const slot of MEAL_SLOTS) {
      const meal = day.meals[slot];
      if (!meal) continue;
      if (!recipeSummary[meal.recipeId]) {
        const recipe = findRecipe(meal.recipeId);
        recipeSummary[meal.recipeId] = {
          recipe,
          totalServingsNeeded: 0,
          recipeServings: recipe ? extractRecipeServings(recipe) : 4,
        };
      }
      recipeSummary[meal.recipeId].totalServingsNeeded += (meal.servings || 1);
    }
  }

  grid.innerHTML = `
    <div class="mp-table">
      <div class="mp-header-row">
        <div class="mp-slot-label"></div>
        ${plan.map(d => `<div class="mp-day-header">${d.day}</div>`).join('')}
      </div>
      ${MEAL_SLOTS.map(slot => `
        <div class="mp-meal-row">
          <div class="mp-slot-label">${slot.charAt(0).toUpperCase() + slot.slice(1)}</div>
          ${plan.map(d => renderMealCell(d, slot, recipeSummary, colorMap)).join('')}
        </div>
      `).join('')}
    </div>`;

  // "What to cook" summary
  const summaryEntries = Object.values(recipeSummary).filter(s => s.recipe);
  if (summaryEntries.length) {
    const rows = summaryEntries.map(s => {
      const batchesNeeded = Math.ceil(s.totalServingsNeeded / s.recipeServings);
      const extra         = (batchesNeeded * s.recipeServings) - s.totalServingsNeeded;
      return `
        <div class="mp-summary-row">
          <span class="mp-summary-icon">${s.recipe.icon || ''}</span>
          <span class="mp-summary-name">${s.recipe.name}</span>
          <span class="mp-summary-detail">
            ${s.totalServingsNeeded} serving${s.totalServingsNeeded !== 1 ? 's' : ''} needed
            · recipe makes ${s.recipeServings}
            · cook <strong>${batchesNeeded}×</strong>
            ${extra > 0 ? `<span class="mp-summary-extra">(${extra} leftover)</span>` : ''}
          </span>
        </div>`;
    }).join('');

    grid.innerHTML += `
      <div class="mp-summary">
        <div class="mp-summary-title">What to cook</div>
        ${rows}
      </div>`;
  }

  initDragAndDrop(plan, colorMap);
}

function renderMealCell(dayObj, slot, recipeSummary, colorMap) {
  const meal   = dayObj.meals[slot];
  const recipe = meal ? findRecipe(meal.recipeId) : null;
  const cellId = `mp-${dayObj.day}-${slot}`;

  if (!recipe) {
    return `
      <div class="mp-cell mp-cell--empty"
        id="${cellId}"
        data-day="${dayObj.day}"
        data-slot="${slot}"
        onclick="openMealPicker('${dayObj.day}','${slot}')"
        ondragover="mpDragOver(event)"
        ondrop="mpDrop(event, '${dayObj.day}', '${slot}')"
        ondragleave="mpDragLeave(event)">
        <span class="mp-empty-slot">+</span>
      </div>`;
  }

  const servings = meal.servings || 1;
  const color    = recipeColor(recipe.id, colorMap);

  return `
    <div class="mp-cell"
      id="${cellId}"
      data-day="${dayObj.day}"
      data-slot="${slot}"
      draggable="true"
      style="background:${color.bg};border-color:${color.bg};color:${color.text};"
      ondragstart="mpDragStart(event, '${dayObj.day}', '${slot}')"
      ondragover="mpDragOver(event)"
      ondrop="mpDrop(event, '${dayObj.day}', '${slot}')"
      ondragleave="mpDragLeave(event)"
      ondragend="mpDragEnd(event)">
      <div class="mp-cell-name" style="color:${color.text};">${recipe.name}</div>
      <div class="mp-servings" style="color:${color.text};opacity:0.75;margin-top:0.3rem;display:flex;align-items:center;gap:0.3rem;font-size:0.68rem;">
        <button class="mp-serving-btn" style="color:${color.text};background:rgba(0,0,0,0.08);"
          onclick="event.stopPropagation();changeServings('${dayObj.day}','${slot}',-1)">−</button>
        <span>${servings} serving${servings !== 1 ? 's' : ''}</span>
        <button class="mp-serving-btn" style="color:${color.text};background:rgba(0,0,0,0.08);"
          onclick="event.stopPropagation();changeServings('${dayObj.day}','${slot}',1)">+</button>
      </div>
      <button class="mp-remove-btn" style="color:${color.text};opacity:0.4;"
        onclick="event.stopPropagation();removeMealSlot('${dayObj.day}','${slot}')" title="Remove">✕</button>
    </div>`;
}

// ── Servings control ───────────────────────────────────────────────────────
function changeServings(day, slot, delta) {
  const saved = loadMealPlan();
  if (!saved) return;
  const { plan, colorMap } = saved;
  const dayObj = plan.find(d => d.day === day);
  if (!dayObj || !dayObj.meals[slot]) return;
  dayObj.meals[slot].servings = Math.max(1, (dayObj.meals[slot].servings || 1) + delta);
  saveMealPlan(plan, colorMap);
  renderMealPlanDays(plan, colorMap);
}

function removeMealSlot(day, slot) {
  const saved = loadMealPlan();
  if (!saved) return;
  const { plan, colorMap } = saved;
  const dayObj = plan.find(d => d.day === day);
  if (dayObj) dayObj.meals[slot] = null;
  saveMealPlan(plan, colorMap);
  renderMealPlanDays(plan, colorMap);
}

// ── Drag and drop ──────────────────────────────────────────────────────────
let _dragSource = null;

function initDragAndDrop(plan, colorMap) {
  window._mpSaved = { plan, colorMap };
}

function mpDragStart(event, day, slot) {
  _dragSource = { day, slot };
  event.currentTarget.classList.add('mp-dragging');
  event.dataTransfer.effectAllowed = 'move';
}

function mpDragEnd(event) {
  event.currentTarget.classList.remove('mp-dragging');
  document.querySelectorAll('.mp-cell').forEach(c => c.classList.remove('mp-drag-over'));
}

function mpDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.classList.add('mp-drag-over');
}

function mpDragLeave(event) {
  event.currentTarget.classList.remove('mp-drag-over');
}

function mpDrop(event, targetDay, targetSlot) {
  event.preventDefault();
  event.currentTarget.classList.remove('mp-drag-over');
  if (!_dragSource) return;
  if (_dragSource.day === targetDay && _dragSource.slot === targetSlot) return;

  const saved = loadMealPlan() || window._mpSaved;
  if (!saved) return;
  const { plan, colorMap } = saved;

  const srcDay = plan.find(d => d.day === _dragSource.day);
  const tgtDay = plan.find(d => d.day === targetDay);
  if (!srcDay || !tgtDay) return;

  const tmp                      = srcDay.meals[_dragSource.slot];
  srcDay.meals[_dragSource.slot] = tgtDay.meals[targetSlot];
  tgtDay.meals[targetSlot]       = tmp;

  _dragSource = null;
  saveMealPlan(plan, colorMap);
  renderMealPlanDays(plan, colorMap);
}

// ── Meal picker — pinned recipes only ──────────────────────────────────────
function openMealPicker(day, slot) {
  const saved = loadMealPlan();
  if (!saved) return;
  const { plan, colorMap } = saved;

  // Only show pinned recipes
  const recipes = pinned.map(id => findRecipe(id)).filter(Boolean);

  if (!recipes.length) {
    alert('Pin some recipes first to add them to your meal plan.');
    return;
  }

  // Calculate servings already used per recipe
  const usedServings = {};
  for (const d of plan) {
    for (const s of MEAL_SLOTS) {
      const m = d.meals[s];
      if (m) usedServings[m.recipeId] = (usedServings[m.recipeId] || 0) + (m.servings || 1);
    }
  }

  const rows = recipes.map(r => {
    const recipeServs = extractRecipeServings(r);
    const used        = usedServings[r.id] || 0;
    const remaining   = Math.max(0, recipeServs - used);
    const color       = recipeColor(r.id, colorMap);
    const remainLabel = remaining > 0
      ? `<span class="mp-picker-left mp-picker-left--ok">${remaining} serving${remaining !== 1 ? 's' : ''} left</span>`
      : `<span class="mp-picker-left mp-picker-left--none">Need another batch</span>`;

    return `
      <div class="mp-picker-row" onclick="pickMeal('${day}','${slot}',${r.id})"
        style="border-left:3px solid ${color.bg};">
        <div class="mp-picker-info">
          <div class="mp-picker-name">${r.name}</div>
          <div class="mp-picker-meta">Makes ${recipeServs} servings · ${remainLabel}</div>
        </div>
      </div>`;
  }).join('');

  const modal = document.getElementById('mp-picker-modal');
  const body  = document.getElementById('mp-picker-body');
  const title = document.getElementById('mp-picker-title');
  if (!modal || !body) return;

  title.textContent  = `Add to ${day} — ${slot}`;
  body.innerHTML     = rows;
  modal.dataset.day  = day;
  modal.dataset.slot = slot;
  modal.classList.add('open');
}

function closeMealPicker(e) {
  const modal = document.getElementById('mp-picker-modal');
  if (!e || e.target === modal) modal?.classList.remove('open');
}

function closeMealPickerBtn() {
  document.getElementById('mp-picker-modal')?.classList.remove('open');
}

function pickMeal(day, slot, recipeId) {
  const saved = loadMealPlan();
  if (!saved) return;
  const { plan, colorMap } = saved;
  const dayObj = plan.find(d => d.day === day);
  if (!dayObj) return;
  dayObj.meals[slot] = { recipeId: Number(recipeId), servings: 1 };
  if (colorMap[recipeId] == null) {
    const usedIndices  = new Set(Object.values(colorMap));
    const available    = [...Array(MP_COLORS.length).keys()].find(i => !usedIndices.has(i));
    colorMap[recipeId] = available ?? (Object.keys(colorMap).length % MP_COLORS.length);
  }
  saveMealPlan(plan, colorMap);
  closeMealPickerBtn();
  renderMealPlanDays(plan, colorMap);
}

// ── Clear all ──────────────────────────────────────────────────────────────
function clearMealPlan() {
  if (!confirm('Clear the entire meal plan?')) return;
  const plan = emptyPlan();
  saveMealPlan(plan, {});
  renderMealPlanDays(plan, {});
}