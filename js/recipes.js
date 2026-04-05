// ──────────────────────────────────────────────
// RECIPES — render, pin, modal
// (generateRecipes lives in search.js)
// ──────────────────────────────────────────────

function renderRecipes() {
  const grid = document.getElementById('recipes-grid');
  document.getElementById('results-count').textContent = `${currentRecipes.length} recipes found`;

  grid.innerHTML = currentRecipes
    .map((r) => {
      const isPinned = pinned.includes(r.id);
      return `
        <div class="recipe-card" onclick="openModal(${r.id})">
          <div class="recipe-card-img">
            ${r.icon}
            <button
              class="recipe-card-pin ${isPinned ? 'pinned' : ''}"
              onclick="event.stopPropagation(); togglePin(${r.id}, this)"
              title="Pin recipe"
            >
              ${isPinned ? '📌' : '🔖'}
            </button>
          </div>
          <div class="recipe-card-body">
            <h4>${r.name}</h4>
            <div class="recipe-card-meta">
              <span>⏱ ${r.time}</span>
              <span>🔥 ${r.cal} kcal</span>
            </div>
            <div class="recipe-card-tags">
              ${r.tags.map((t) => `<span class="recipe-tag">${t}</span>`).join('')}
            </div>
          </div>
        </div>
      `;
    })
    .join('');
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
  const grid = document.getElementById('pinned-grid');
  const empty = document.getElementById('pinned-empty');

  // Look up each pinned id across currentRecipes first, then static samples
  const pinnedRecipes = pinned
    .map(id => currentRecipes.find(r => r.id === id) || SAMPLE_RECIPES.find(r => r.id === id))
    .filter(Boolean);

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
        <div class="recipe-card-meta">
          <span>⏱ ${r.time}</span>
          <span>🔥 ${r.cal} kcal</span>
        </div>
        <div class="recipe-card-tags">
          ${r.tags.map((t) => `<span class="recipe-tag">${t}</span>`).join('')}
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
    document.querySelectorAll('#modal-steps li').forEach((li, i) => {
      let text = steps[i];
      if (candidates && candidates.length) {
        const isMatch = candidates.some(w => text.toLowerCase().includes(w));
        if (isMatch) {
          candidates.forEach(w => {
            text = text.replace(new RegExp(`\\b(${w}\\w*)`, 'gi'), '<mark class="step-highlight">$1</mark>');
          });
        }
        li.innerHTML = text;
        li.classList.toggle('step-active', isMatch);
      } else {
        li.innerHTML = text;
        li.classList.remove('step-active');
      }
    });
  }

  document.getElementById('modal-steps').innerHTML = steps.map(s => `<li>${s}</li>`).join('');

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
  // Destroy old chart
  if (nutritionChartInstance) { nutritionChartInstance.destroy(); nutritionChartInstance = null; }

  document.getElementById('modal-calories').textContent = '–';
  document.getElementById('modal-fiber').textContent = '–';
  document.getElementById('modal-fiber-dv').textContent = '';
  document.getElementById('nutrition-legend').innerHTML = `
    <div class="legend-item nutrition-loading">Fetching live data…</div>
  `;
}

function renderNutritionPanel(n, isLive) {
  // n may be null for dataset recipes before FDC responds
  if (!n) {
    document.getElementById('modal-calories').textContent = '–';
    document.getElementById('modal-fiber').textContent = '–';
    document.getElementById('modal-fiber-dv').textContent = '';
    document.getElementById('nutrition-legend').innerHTML =
      '<div class="legend-item nutrition-loading">Nutrition unavailable</div>';
    return;
  }

  const cal = n.calories ?? n.cal ?? '–';
  document.getElementById('modal-calories').textContent = cal;
  document.getElementById('modal-fiber').textContent = n.fiber ?? '–';
  const fiberDV = n.fiber ? Math.round((n.fiber / 28) * 100) : 0;
  document.getElementById('modal-fiber-dv').textContent = n.fiber ? `(${fiberDV}% DV)` : '';

  document.getElementById('nutrition-legend').innerHTML = `
    <div class="legend-item"><span class="legend-dot" style="background:#5A7D5B"></span> Protein <strong>${n.protein ?? '–'}g</strong></div>
    <div class="legend-item"><span class="legend-dot" style="background:#D4A843"></span> Carbs <strong>${n.carbs ?? '–'}g</strong></div>
    <div class="legend-item"><span class="legend-dot" style="background:#C4633A"></span> Fat <strong>${n.fat ?? '–'}g</strong></div>
    ${isLive
      ? '<div class="legend-source">Source: USDA FoodData Central</div>'
      : '<div class="legend-source legend-source--fallback">Estimated values</div>'}
  `;

  if (nutritionChartInstance) { nutritionChartInstance.destroy(); nutritionChartInstance = null; }

  // Only draw chart if all three macros are present and non-zero
  const { protein, carbs, fat } = n;
  if (protein != null && carbs != null && fat != null && (protein + carbs + fat) > 0) {
    const ctx = document.getElementById('nutritionChart').getContext('2d');
    nutritionChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Protein', 'Carbs', 'Fat'],
        datasets: [{
          data: [protein, carbs, fat],
          backgroundColor: ['#5A7D5B', '#D4A843', '#C4633A'],
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        cutout: '62%',
        plugins: {
          legend: { display: false },
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