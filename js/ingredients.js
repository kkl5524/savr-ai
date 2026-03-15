function renderIngredients() {
  const list = document.getElementById('ingredients-list');
  list.innerHTML = ingredients
    .map(
      (i, idx) =>
        `<span class="ingr-tag">${i}<button onclick="removeIngredient(${idx})" title="Remove">×</button></span>`
    )
    .join('');
  localStorage.setItem('savr_ingredients', JSON.stringify(ingredients));
}

function addIngredient() {
  const input = document.getElementById('ingredient-input');
  const raw = input.value.trim();
  if (!raw) return input.focus();

  raw.split(',')
    .map(s => s.trim())
    .filter(s => s.length && !ingredients.includes(s))
    .forEach(s => ingredients.push(s));

  renderIngredients();
  input.value = '';
  input.focus();
}

function removeIngredient(idx) {
  ingredients.splice(idx, 1);
  renderIngredients();
}

function initIngredients() {
  document.getElementById('ingredient-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addIngredient();
  });

  if (ingredients.length === 0) {
    ingredients = ['Eggs', 'Broccoli', 'Garlic', 'Tomatoes', 'Olive Oil'];
  }
  renderIngredients();
}