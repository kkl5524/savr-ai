function generateRecipes() {
  const btn = document.getElementById('generate-btn');
  btn.classList.add('loading');
  btn.disabled = true;

  setTimeout(() => {
    btn.classList.remove('loading');
    btn.disabled = false;

    currentRecipes = [...SAMPLE_RECIPES].sort(() => Math.random() - 0.5);
    renderRecipes();

    const results = document.getElementById('results-section');
    results.classList.add('visible');
    results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 1800);
}

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
  const pinnedRecipes = SAMPLE_RECIPES.filter((r) => pinned.includes(r.id));

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

// ── Modal

let nutritionChartInstance = null;

function openModal(id) {
  const r = SAMPLE_RECIPES.find((x) => x.id === id);
  if (!r) return;
  currentModalId = id;

  document.getElementById('modal-icon').textContent = r.icon;
  document.getElementById('modal-title').textContent = r.name;
  document.getElementById('modal-meta').innerHTML = `
    <span>⏱ ${r.time}</span>
    <span>🔥 ${r.cal} kcal</span>
    <span>${pinned.includes(id) ? '📌 Pinned' : '🔖 Not pinned'}</span>
  `;

  const n = r.nutrition;
  document.getElementById('modal-calories').textContent = r.cal;
  document.getElementById('modal-fiber').textContent = n.fiber;
  // ~28g fiber is 100% DV
  const fiberDV = Math.round((n.fiber / 28) * 100);
  document.getElementById('modal-fiber-dv').textContent = `(${fiberDV}% DV)`;

  document.getElementById('nutrition-legend').innerHTML = `
    <div class="legend-item"><span class="legend-dot" style="background:#5A7D5B"></span> Protein <strong>${n.protein}g</strong></div>
    <div class="legend-item"><span class="legend-dot" style="background:#D4A843"></span> Carbs <strong>${n.carbs}g</strong></div>
    <div class="legend-item"><span class="legend-dot" style="background:#C4633A"></span> Fat <strong>${n.fat}g</strong></div>
  `;

  if (nutritionChartInstance) {
    nutritionChartInstance.destroy();
    nutritionChartInstance = null;
  }
  const ctx = document.getElementById('nutritionChart').getContext('2d');
  nutritionChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Protein', 'Carbs', 'Fat'],
      datasets: [{
        data: [n.protein, n.carbs, n.fat],
        backgroundColor: ['#5A7D5B', '#D4A843', '#C4633A'],
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      cutout: '62%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.parsed}g`,
          },
        },
      },
    },
  });

  const steps = Array.isArray(r.instructions)
    ? r.instructions
    : r.instructions.split('. ').filter(Boolean);

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
    const stepEls = document.querySelectorAll('#modal-steps li');
    stepEls.forEach((li, i) => {
      let text = steps[i];
      if (candidates && candidates.length) {
        const stepLower = text.toLowerCase();
        const isMatch = candidates.some(w => stepLower.includes(w));
        if (isMatch) {
          candidates.forEach(w => {
            const regex = new RegExp(`\\b(${w}\\w*)`, 'gi');
            text = text.replace(regex, '<mark class="step-highlight">$1</mark>');
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

  document.getElementById('modal-steps').innerHTML = steps
    .map((s) => `<li>${s}</li>`)
    .join('');

  const ingredientUL = document.getElementById('modal-ingredients');
  ingredientUL.innerHTML = r.ingredients
    .map((ing) => `<li>${ing}</li>`)
    .join('');

  ingredientUL.querySelectorAll('li').forEach((li) => {
    const candidates = extractCandidates(li.textContent);
    li.addEventListener('mouseenter', () => {
      li.classList.add('ing-hover');
      renderSteps(candidates);
    });
    li.addEventListener('mouseleave', () => {
      li.classList.remove('ing-hover');
      renderSteps(null);
    });
  });

  document.getElementById('modal-pin-btn').textContent = pinned.includes(id)
    ? '📌 Pinned'
    : '🔖 Pin Recipe';

  document.getElementById('modal-backdrop').classList.add('open');
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