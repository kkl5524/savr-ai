// ──────────────────────────────────────────────
// RECIPES — render, pin, modal
// (generateRecipes lives in search.js)
// ──────────────────────────────────────────────

function renderRecipes() {
  const grid = document.getElementById('recipes-grid');
  document.getElementById('results-count').textContent = `${currentRecipes.length} recipes found`;

  grid.innerHTML = currentRecipes.map((r) => {
    const isPinned  = pinned.includes(r.id);
    const covPct    = r.coverageScore != null ? Math.round(r.coverageScore * 100) : null;
    const covBadge  = covPct != null
      ? `<span class="recipe-coverage ${covPct === 100 ? 'recipe-coverage--perfect' : ''}" title="${r.missingCount || 0} ingredient(s) needed">
           ${covPct === 100 ? '✓ All in' : `${covPct}% match`}
         </span>`
      : '';

    return `
      <div class="recipe-card" onclick="openModal(${r.id})">
        <div class="recipe-card-img">
          ${r.icon}
          <button
            class="recipe-card-pin ${isPinned ? 'pinned' : ''}"
            onclick="event.stopPropagation(); togglePin(${r.id}, this)"
            title="Pin recipe"
          >${isPinned ? '📌' : '🔖'}</button>
          ${covBadge}
        </div>
        <div class="recipe-card-body">
          <h4>${r.name}</h4>
          <div class="recipe-card-meta">
            ${r.missingCount ? `<span class="missing-count">🛒 ${r.missingCount} needed</span>` : `<span style="color:var(--moss);font-size:0.78rem;">✓ All ingredients in</span>`}
          </div>
          <div class="recipe-card-tags">
            ${r.tags.map(t => `<span class="recipe-tag">${t}</span>`).join('')}
          </div>
          <button class="recipe-shopping-btn" onclick="event.stopPropagation(); openShoppingList(${r.id})" title="Shopping list">
            🛒 Shopping list
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function togglePin(id, btn) {
  const idx = pinned.indexOf(id);
  if (idx === -1) {
    pinned.push(id);
    if (btn) { btn.classList.add('pinned'); btn.textContent = '📌'; }
  } else {
    pinned.splice(idx, 1);
    if (btn) { btn.classList.remove('pinned'); btn.textContent = '🔖'; }
  }
  localStorage.setItem('savr_pinned', JSON.stringify(pinned));
  renderPinned();
  updatePinBadge();
}

function renderPinned() {
  const grid  = document.getElementById('pinned-grid');
  const empty = document.getElementById('pinned-empty');
  if (!grid) return;

  // Look up pinned recipes — currentRecipes and SAMPLE_RECIPES first (fast, no network)
  const found   = [];
  const missing = [];

  for (const id of pinned) {
    const r = currentRecipes.find(r => r.id === id) || SAMPLE_RECIPES.find(r => r.id === id);
    if (r) found.push(r);
    else    missing.push(id);
  }

  // If any pinned IDs aren't in memory, fetch them from Supabase
  if (missing.length) {
    fetchRecipesByIds(missing).then(fetched => {
      // Merge into currentRecipes so findRecipe works for modals too
      for (const r of fetched) {
        if (!currentRecipes.find(x => x.id === r.id)) currentRecipes.push(r);
      }
      renderPinnedList([...found, ...fetched]);
    }).catch(() => renderPinnedList(found));
    // Show what we have immediately while fetching
    if (found.length) renderPinnedList(found);
    else { empty.style.display = 'flex'; grid.innerHTML = ''; }
    return;
  }

  renderPinnedList(found);
}

async function fetchRecipesByIds(ids) {
  if (!ids.length) return [];
  try {
    const res = await fetch(`/api/search`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      // Special mode: fetch by IDs directly
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.recipes || []).map(row => ({
      id:           row.id,
      icon:         typeof pickIcon === 'function' ? pickIcon(row.ner || []) : '🍽️',
      name:         row.title,
      time:         '–',
      cal:          null,
      tags:         row.tags || [],
      ingredients:  row.ingredients || [],
      instructions: row.directions  || [],
      nutrition:    null,
      ner:          row.ner || [],
      source:       row.source || null,
      link:         row.link   || null,
    }));
  } catch { return []; }
}

function renderPinnedList(pinnedRecipes) {
  const grid  = document.getElementById('pinned-grid');
  const empty = document.getElementById('pinned-empty');
  if (!grid) return;

  if (!pinnedRecipes.length) {
    empty.style.display = 'flex';
    grid.innerHTML = '';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = pinnedRecipes.map((r) => `
    <div class="recipe-card" onclick="openModal(${r.id})">
      <div class="recipe-card-img">
        ${r.icon}
        <button
          class="recipe-card-pin pinned"
          onclick="event.stopPropagation(); togglePin(${r.id}, this)"
          title="Unpin recipe"
        >📌</button>
      </div>
      <div class="recipe-card-body">
        <h4>${r.name}</h4>
        <div class="recipe-card-tags">
          ${(r.tags || []).map(t => `<span class="recipe-tag">${t}</span>`).join('')}
        </div>
      </div>
    </div>
  `).join('');
}

function updatePinBadge() {
  const badge = document.getElementById('nav-pin-badge');
  if (!badge) return;
  if (pinned.length) {
    badge.textContent = pinned.length;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

// ── Modal ──────────────────────────────────────

let nutritionChartInstance = null;

// Look up a recipe by id across both the live search results and the static samples
function findRecipe(id) {
  return currentRecipes.find(r => r.id === id)
      || SAMPLE_RECIPES.find(r => r.id === id)
      || null;
}

function openModal(id) {
  const r = findRecipe(id);
  if (!r) return;
  currentModalId = id;

  // Header
  document.getElementById('modal-icon').textContent = r.icon;
  document.getElementById('modal-title').textContent = r.name;
  document.getElementById('modal-meta').innerHTML = `
    <span>⏱ ${r.time && r.time !== '–' ? r.time : 'varies'}</span>
    ${r.cal ? `<span>🔥 ${r.cal} kcal</span>` : ''}
    <span>${pinned.includes(id) ? '📌 Pinned' : '🔖 Not pinned'}</span>
    ${r.link ? `<a href="${r.link}" target="_blank" rel="noopener" style="font-size:0.78rem;color:var(--moss);">View original ↗</a>` : ''}
  `;

  // Reset servings to default and clear cached raw nutrition
  _rawNutrition = null;
  const servingsEl = document.getElementById('modal-servings');
  if (servingsEl) { servingsEl.value = '4'; delete servingsEl.dataset.wired; }

  // Show modal immediately with loading state in nutrition panel
  renderNutritionLoading();
  document.getElementById('modal-backdrop').classList.add('open');

  // Fetch live nutrition from FDC, fall back to static data or show N/A
  fetchRecipeNutrition(r)
    .then(live => {
      // Treat all-zero result as a failed fetch (proxy misconfigured or key missing)
      const isAllZero = live && live.calories === 0 && live.protein === 0 && live.carbs === 0 && live.fat === 0;
      if (isAllZero) return renderNutritionPanel(r.nutrition, false);
      renderNutritionPanel(live || r.nutrition, !!live && !isAllZero);
    })
    .catch(() => renderNutritionPanel(r.nutrition, false));

  // Ingredients + steps — handle JS arrays, Python-literal strings, and plain strings
  function parseListField(val) {
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val !== 'string' || !val.trim()) return [];
    // Python-literal list: "['step one', 'step two']"
    if (val.trim().startsWith('[')) {
      try {
        // Replace single quotes with double quotes carefully
        const jsonLike = val
          .replace(/^\[/, '[')
          .replace(/'/g, '"')
          .replace(/,\s*]/, ']');
        const parsed = JSON.parse(jsonLike);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch (_) { /* fall through to split */ }
    }
    // Plain string — split on ". "
    return val.split(/\.\s+/).filter(Boolean);
  }

  const steps = parseListField(r.instructions);

  const STOP_WORDS = new Set([
    'cup','cups','tbsp','tsp','g','kg','ml','oz','lb','clove','cloves',
    'can','cans','bunch','pinch','slice','slices','piece','pieces',
    'large','small','medium','fresh','dried','frozen','raw','whole',
    'of','and','or','the','a','an','to','with','for','in','into',
    'minced','diced','sliced','chopped','grated','crushed','halved',
    'peeled','trimmed','rinsed','drained','cooked','shredded','beaten',
    'taste','needed','optional','divided','packed','heaping','level',
  ]);

  function extractCandidates(ingredient) {
    return ingredient
      .toLowerCase()
      .replace(/[\d¼½¾⅓⅔–-]+/g, ' ')
      .replace(/\(.*?\)/g, ' ')
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  }

  function renderSteps(candidates = null) {
    document.querySelectorAll('#modal-steps .modal-step-item').forEach((li, i) => {
      const textSpan = li.querySelector('.modal-step-text');
      if (!textSpan) return;
      let text = steps[i];
      if (candidates && candidates.length) {
        const isMatch = candidates.some(w => text.toLowerCase().includes(w));
        if (isMatch) {
          candidates.forEach(w => {
            text = text.replace(new RegExp(`\\b(${w}\\w*)`, 'gi'), '<mark class="step-highlight">$1</mark>');
          });
        }
        textSpan.innerHTML = text;
        li.classList.toggle('step-active', isMatch);
      } else {
        textSpan.innerHTML = text;
        li.classList.remove('step-active');
      }
    });
  }

  const stepsOl = document.getElementById('modal-steps');
  stepsOl.innerHTML = steps.map((s, i) => `
    <li class="modal-step-item">
      <span class="modal-step-text">${s}</span>
      <button class="step-chat-btn" title="Ask AI about this step" data-step-index="${i}">?</button>
    </li>`).join('');

  // Wire step buttons via event delegation
  stepsOl.addEventListener('click', (e) => {
    const btn = e.target.closest('.step-chat-btn');
    if (!btn) return;
    e.stopPropagation();
    e.preventDefault();
    const idx = parseInt(btn.dataset.stepIndex);
    if (!isNaN(idx) && steps[idx]) openAiChatForStep(steps[idx]);
  });

  // General recipe chat button
  const actionsEl = document.getElementById('modal-actions-row');
  if (actionsEl) {
    actionsEl.querySelector('.recipe-ask-btn')?.remove();
    const askBtn = document.createElement('button');
    askBtn.className = 'btn-secondary recipe-ask-btn';
    askBtn.textContent = '? Ask AI about this recipe';
    askBtn.onclick = () => openAiChatForRecipe(r);
    actionsEl.appendChild(askBtn);
  }

  const ingredientUL = document.getElementById('modal-ingredients');
  ingredientUL.innerHTML = (r.ingredients || []).map(ing => `<li>${ing}</li>`).join('');
  ingredientUL.querySelectorAll('li').forEach(li => {
    const candidates = extractCandidates(li.textContent);
    li.addEventListener('mouseenter', () => { li.classList.add('ing-hover'); renderSteps(candidates); });
    li.addEventListener('mouseleave', () => { li.classList.remove('ing-hover'); renderSteps(null); });
  });

  document.getElementById('modal-pin-btn').textContent = pinned.includes(id)
    ? '📌 Pinned' : '🔖 Pin Recipe';

  // Forum — load tips for this recipe
  if (typeof initForumInModal === 'function') {
    initForumInModal(id, r.name, r.ingredients || []);
  }
}

function renderNutritionLoading() {
  if (nutritionChartInstance) { nutritionChartInstance.destroy(); nutritionChartInstance = null; }
  document.getElementById('modal-calories').textContent = '–';
  document.getElementById('modal-fiber').textContent = '–';
  document.getElementById('modal-fiber-dv').textContent = '';
  document.getElementById('nutrition-legend').innerHTML = `
    <div class="legend-item nutrition-loading">Fetching nutrition data…</div>
  `;
}

// Store raw totals so servings input can recalculate without re-fetching
let _rawNutrition = null;

function renderNutritionPanel(n, isLive) {
  _rawNutrition = n;
  const servingsEl = document.getElementById('modal-servings');

  // Wire servings input to recalculate on change
  if (servingsEl && !servingsEl.dataset.wired) {
    servingsEl.dataset.wired = '1';
    servingsEl.addEventListener('input', () => {
      if (_rawNutrition) renderNutritionPanel(_rawNutrition, isLive);
    });
  }

  const servings = Math.max(1, parseInt(servingsEl?.value || '4'));

  if (!n) {
    document.getElementById('modal-calories').textContent = '–';
    document.getElementById('modal-fiber').textContent = '–';
    document.getElementById('modal-fiber-dv').textContent = '';
    document.getElementById('nutrition-legend').innerHTML =
      '<div class="legend-item nutrition-loading">Nutrition unavailable</div>';
    return;
  }

  // Divide totals by servings
  const perServing = {
    calories: Math.round((n.calories ?? n.cal ?? 0) / servings),
    protein:  Math.round((n.protein  ?? 0) / servings),
    fat:      Math.round((n.fat      ?? 0) / servings),
    carbs:    Math.round((n.carbs    ?? 0) / servings),
    fiber:    Math.round((n.fiber    ?? 0) / servings),
  };

  document.getElementById('modal-calories').textContent = perServing.calories || '–';
  document.getElementById('modal-fiber').textContent    = perServing.fiber    || '–';
  const fiberDV = perServing.fiber ? Math.round((perServing.fiber / 28) * 100) : 0;
  document.getElementById('modal-fiber-dv').textContent = perServing.fiber ? `(${fiberDV}% DV)` : '';

  document.getElementById('nutrition-legend').innerHTML = `
    <div class="legend-item"><span class="legend-dot" style="background:#5A7D5B"></span> Protein <strong>${perServing.protein}g</strong></div>
    <div class="legend-item"><span class="legend-dot" style="background:#D4A843"></span> Carbs <strong>${perServing.carbs}g</strong></div>
    <div class="legend-item"><span class="legend-dot" style="background:#C4633A"></span> Fat <strong>${perServing.fat}g</strong></div>
    ${isLive
      ? '<div class="legend-source">Source: USDA SR Legacy · per serving</div>'
      : '<div class="legend-source legend-source--fallback">Estimated · per serving</div>'}
  `;

  if (nutritionChartInstance) { nutritionChartInstance.destroy(); nutritionChartInstance = null; }

  const { protein, carbs, fat } = perServing;
  if ((protein + carbs + fat) > 0) {
    const ctx = document.getElementById('nutritionChart').getContext('2d');
    nutritionChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Protein', 'Carbs', 'Fat'],
        datasets: [{
          data: [protein, carbs, fat],
          backgroundColor: ['#5A7D5B', '#D4A843', '#C4633A'],
          borderWidth: 0,
          hoverOffset: 4,
        }],
      },
      options: {
        cutout: '65%',
        plugins: {
          legend:  { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed}g` } },
        },
      },
    });
  }
}

function closeModal(e) {
  if (e.target === document.getElementById('modal-backdrop')) {
    document.getElementById('modal-backdrop').classList.remove('open');
  }
}

function closeModalBtn() {
  document.getElementById('modal-backdrop').classList.remove('open');
}

function pinFromModal() {
  if (!currentModalId) return;
  if (!pinned.includes(currentModalId)) {
    togglePin(currentModalId, null);
    renderRecipes();
  }
  closeModalBtn();
}