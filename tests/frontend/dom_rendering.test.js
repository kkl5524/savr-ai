/**
 * tests/frontend/dom_rendering.test.js
 * Frontend tests verifying that key UI elements render to the DOM correctly.
 * Uses jest-environment-jsdom to simulate the browser.
 */

// ── Set up a minimal DOM environment before each test ────────────────────
beforeEach(() => {
  document.body.innerHTML = '';
});

// ── Inline the render functions under test ────────────────────────────────

function renderIngredientTag(ing, idx) {
  const qtyLabel = [ing.qty, ing.unit].filter(Boolean).join(' ');
  const label    = qtyLabel ? `<span class="ingr-qty">${qtyLabel}</span> ${ing.name}` : ing.name;
  return `
    <span class="ingr-tag" data-idx="${idx}">
      ${label}
      <button class="ingr-edit-btn" data-idx="${idx}" title="Edit quantity">✎</button>
      <button class="remove-btn" data-idx="${idx}" title="Remove">×</button>
    </span>`;
}

function renderRecipeCard(recipe, isPinned) {
  const covPct = recipe.coverageScore != null ? Math.round(recipe.coverageScore * 100) : null;
  const covBadge = covPct != null
    ? `<span class="recipe-coverage ${covPct === 100 ? 'recipe-coverage--perfect' : ''}">${covPct === 100 ? '✓ All in' : `${covPct}% match`}</span>`
    : '';
  return `
    <div class="recipe-card" data-id="${recipe.id}">
      <div class="recipe-card-img">
        ${recipe.icon}
        <button class="recipe-card-pin ${isPinned ? 'pinned' : ''}">${isPinned ? '📌' : '🔖'}</button>
        ${covBadge}
      </div>
      <div class="recipe-card-body">
        <h4>${recipe.name}</h4>
        <div class="recipe-card-meta">
          ${recipe.missingCount ? `<span class="missing-count">🛒 ${recipe.missingCount} needed</span>` : '<span class="all-in">✓ All ingredients in</span>'}
        </div>
      </div>
    </div>`;
}

function renderEmptyState(hasActiveFilters, filterNames) {
  if (hasActiveFilters) {
    return `
      <div class="results-empty">
        <p>No recipes matched your current filters.</p>
        <p class="results-empty-sub">Your active filters (<strong>${filterNames}</strong>) removed all results.</p>
      </div>`;
  }
  return `
    <div class="results-empty">
      <p>No recipes found for these ingredients.</p>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
describe('Ingredient tag rendering', () => {

  test('renders ingredient name without qty/unit', () => {
    document.body.innerHTML = renderIngredientTag({ name: 'Garlic', qty: '', unit: '' }, 0);
    const tag = document.querySelector('.ingr-tag');
    expect(tag).not.toBeNull();
    expect(tag.textContent).toContain('Garlic');
    expect(tag.querySelector('.ingr-qty')).toBeNull();
  });

  test('renders ingredient with qty and unit', () => {
    document.body.innerHTML = renderIngredientTag({ name: 'Chicken', qty: '500', unit: 'g' }, 0);
    const qtySpan = document.querySelector('.ingr-qty');
    expect(qtySpan).not.toBeNull();
    expect(qtySpan.textContent).toBe('500 g');
    expect(document.body.textContent).toContain('Chicken');
  });

  test('renders edit and remove buttons', () => {
    document.body.innerHTML = renderIngredientTag({ name: 'Onion', qty: '1', unit: '' }, 2);
    const editBtn   = document.querySelector('.ingr-edit-btn');
    const removeBtn = document.querySelector('.remove-btn');
    expect(editBtn).not.toBeNull();
    expect(removeBtn).not.toBeNull();
    expect(editBtn.dataset.idx).toBe('2');
  });

  test('renders correct data-idx for list position', () => {
    document.body.innerHTML = renderIngredientTag({ name: 'Tomato', qty: '', unit: '' }, 5);
    expect(document.querySelector('.ingr-tag').dataset.idx).toBe('5');
  });

});

// ─────────────────────────────────────────────────────────────────────────
describe('Recipe card rendering', () => {

  const sampleRecipe = {
    id:            42,
    name:          'Garlic Chicken',
    icon:          '🍗',
    tags:          ['High Protein'],
    coverageScore: 1.0,
    missingCount:  0,
    ner:           ['garlic', 'chicken'],
  };

  test('renders recipe name as h4', () => {
    document.body.innerHTML = renderRecipeCard(sampleRecipe, false);
    const h4 = document.querySelector('h4');
    expect(h4).not.toBeNull();
    expect(h4.textContent).toBe('Garlic Chicken');
  });

  test('renders "✓ All in" badge when coverage is 100%', () => {
    document.body.innerHTML = renderRecipeCard(sampleRecipe, false);
    const badge = document.querySelector('.recipe-coverage');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('✓ All in');
    expect(badge.classList.contains('recipe-coverage--perfect')).toBe(true);
  });

  test('renders partial coverage badge correctly', () => {
    const partial = { ...sampleRecipe, coverageScore: 0.5, missingCount: 2 };
    document.body.innerHTML = renderRecipeCard(partial, false);
    const badge = document.querySelector('.recipe-coverage');
    expect(badge.textContent).toContain('50% match');
    expect(badge.classList.contains('recipe-coverage--perfect')).toBe(false);
  });

  test('renders 📌 pin button when recipe is pinned', () => {
    document.body.innerHTML = renderRecipeCard(sampleRecipe, true);
    const pinBtn = document.querySelector('.recipe-card-pin');
    expect(pinBtn.classList.contains('pinned')).toBe(true);
    expect(pinBtn.textContent).toBe('📌');
  });

  test('renders 🔖 button when recipe is not pinned', () => {
    document.body.innerHTML = renderRecipeCard(sampleRecipe, false);
    const pinBtn = document.querySelector('.recipe-card-pin');
    expect(pinBtn.classList.contains('pinned')).toBe(false);
    expect(pinBtn.textContent).toBe('🔖');
  });

  test('renders missing count when missingCount > 0', () => {
    const missing = { ...sampleRecipe, coverageScore: 0.7, missingCount: 3 };
    document.body.innerHTML = renderRecipeCard(missing, false);
    const meta = document.querySelector('.missing-count');
    expect(meta).not.toBeNull();
    expect(meta.textContent).toContain('3 needed');
  });

  test('renders all-ingredients-in message when missingCount is 0', () => {
    document.body.innerHTML = renderRecipeCard(sampleRecipe, false);
    const allIn = document.querySelector('.all-in');
    expect(allIn).not.toBeNull();
    expect(allIn.textContent).toContain('✓ All ingredients in');
  });

});

// ─────────────────────────────────────────────────────────────────────────
describe('Empty state rendering — Case Two filter conflict', () => {

  test('shows filter conflict message when hard filters active', () => {
    document.body.innerHTML = renderEmptyState(true, 'Vegan, Gluten');
    const empty = document.querySelector('.results-empty');
    expect(empty).not.toBeNull();
    expect(empty.textContent).toContain('No recipes matched your current filters');
    const sub = document.querySelector('.results-empty-sub');
    expect(sub.textContent).toContain('Vegan, Gluten');
  });

  test('shows generic message when no filters active', () => {
    document.body.innerHTML = renderEmptyState(false, '');
    expect(document.querySelector('.results-empty').textContent)
      .toContain('No recipes found for these ingredients');
    expect(document.querySelector('.results-empty-sub')).toBeNull();
  });

  test('empty state element exists in DOM', () => {
    document.body.innerHTML = renderEmptyState(true, 'Dairy');
    expect(document.querySelector('.results-empty')).not.toBeNull();
  });

});