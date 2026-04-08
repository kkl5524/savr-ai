// ──────────────────────────────────────────────
// INGREDIENTS — add, remove, render with qty/unit
// ──────────────────────────────────────────────

const COMMON_UNITS = ['g','kg','ml','l','oz','lb','cup','cups','tbsp','tsp','piece','pieces','bunch','can','cans','pinch','slice','slices','clove','cloves','fillet','fillets'];

function saveIngredients() {
  localStorage.setItem('savr_ingredients', JSON.stringify(ingredients));
}

function renderIngredients() {
  const list = document.getElementById('ingredients-list');
  list.innerHTML = ingredients.map((ing, idx) => {
    const qtyLabel = [ing.qty, ing.unit].filter(Boolean).join(' ');
    const label    = qtyLabel ? `<span class="ingr-qty">${qtyLabel}</span> ${ing.name}` : ing.name;
    return `
      <span class="ingr-tag" data-idx="${idx}">
        ${label}
        <button class="ingr-edit-btn" onclick="openEditIngredient(${idx})" title="Edit quantity">✎</button>
        <button onclick="removeIngredient(${idx})" title="Remove">×</button>
      </span>`;
  }).join('');
  saveIngredients();
}

function addIngredient() {
  const input = document.getElementById('ingredient-input');
  const raw   = input.value.trim();
  if (!raw) return input.focus();

  raw.split(',').map(s => s.trim()).filter(Boolean).forEach(s => {
    // Try to parse "2 cups chicken" or "500g beef" from the input itself
    const parsed  = parseIngredientString(s);
    const nameKey = parsed.name.toLowerCase();
    if (!ingredients.some(i => i.name.toLowerCase() === nameKey)) {
      ingredients.push(parsed);
    }
  });

  renderIngredients();
  input.value = '';
  input.focus();
}

// Parse "2 cups chicken breast" → { qty: '2', unit: 'cups', name: 'chicken breast' }
function parseIngredientString(str) {
  const s = str.trim();
  // Match leading number
  const numMatch = s.match(/^([\d½¼¾⅓⅔⅛]+(?:\.[\d]+)?)\s*/);
  let qty  = '';
  let rest = s;
  if (numMatch) { qty = numMatch[1]; rest = s.slice(numMatch[0].length); }

  // Match unit
  const unitPattern = new RegExp('^(' + COMMON_UNITS.join('|') + ')\\b\\s*', 'i');
  const unitMatch   = rest.match(unitPattern);
  let unit = '';
  if (unitMatch) { unit = unitMatch[1].toLowerCase(); rest = rest.slice(unitMatch[0].length); }

  return { name: rest.trim() || s, qty, unit };
}

function removeIngredient(idx) {
  ingredients.splice(idx, 1);
  renderIngredients();
}

// ── Inline edit popover for qty/unit ──────────
function openEditIngredient(idx) {
  // Close any existing edit popover
  document.querySelectorAll('.ingr-edit-popover').forEach(el => el.remove());

  const ing  = ingredients[idx];
  const tag  = document.querySelector(`.ingr-tag[data-idx="${idx}"]`);
  if (!tag) return;

  const popover = document.createElement('div');
  popover.className = 'ingr-edit-popover';
  popover.innerHTML = `
    <div class="ingr-edit-inner">
      <label class="ingr-edit-label">Quantity</label>
      <input id="edit-qty-${idx}"  class="ingr-edit-input" type="text" value="${ing.qty}"  placeholder="e.g. 2" style="width:60px;">
      <select id="edit-unit-${idx}" class="ingr-edit-input">
        <option value="">no unit</option>
        ${COMMON_UNITS.map(u => `<option value="${u}" ${u === ing.unit ? 'selected' : ''}>${u}</option>`).join('')}
      </select>
      <input id="edit-name-${idx}" class="ingr-edit-input" type="text" value="${ing.name}" placeholder="Ingredient name" style="flex:1;">
      <div class="ingr-edit-actions">
        <button class="btn-primary" style="padding:0.3rem 0.8rem;font-size:0.82rem;" onclick="saveEditIngredient(${idx})">Save</button>
        <button class="btn-secondary" style="padding:0.3rem 0.8rem;font-size:0.82rem;" onclick="this.closest('.ingr-edit-popover').remove()">Cancel</button>
      </div>
    </div>
  `;

  tag.appendChild(popover);
  document.getElementById(`edit-qty-${idx}`)?.focus();

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!popover.contains(e.target) && !tag.contains(e.target)) {
        popover.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 50);
}

function saveEditIngredient(idx) {
  const qty  = document.getElementById(`edit-qty-${idx}`)?.value.trim()  || '';
  const unit = document.getElementById(`edit-unit-${idx}`)?.value         || '';
  const name = document.getElementById(`edit-name-${idx}`)?.value.trim()  || ingredients[idx].name;
  ingredients[idx] = { name, qty, unit };
  document.querySelectorAll('.ingr-edit-popover').forEach(el => el.remove());
  renderIngredients();
}

function initIngredients() {
  document.getElementById('ingredient-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') addIngredient();
  });

  if (ingredients.length === 0) {
    ingredients = [
      { name: 'Eggs',      qty: '6',   unit: '' },
      { name: 'Broccoli',  qty: '1',   unit: 'bunch' },
      { name: 'Garlic',    qty: '3',   unit: 'cloves' },
      { name: 'Tomatoes',  qty: '400', unit: 'g' },
      { name: 'Olive Oil', qty: '2',   unit: 'tbsp' },
    ];
  }
  renderIngredients();
}